import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecruitmentApi } from '../data/recruitment-api';
import {
  activeApplicationCount,
  requisitionStatusTone,
  riskTone,
} from '../data/recruitment-display';
import {
  MODULE_KEY,
  REQUISITION_SORTS,
  REQUISITION_STATUSES,
  Requisition,
  RequisitionSort,
  RequisitionStatus,
} from '../data/recruitment.models';
import { RecruitmentLessonButton } from '../shared/recruitment-lesson-button';
import { RecruitmentNav } from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';

const PAGE_SIZE = 25;

/** Job requisitions of the current org: search, status / owner filters, sort and saved views. */
@Component({
  selector: 'app-requisitions-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    RecordListPage,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    RecruitmentNav,
    RecruitmentLessonButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="recruitment.requisitions.title"
      scope="recruitment"
      page="requisitions"
      searchPlaceholderKey="recruitment.requisitions.search"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="!loading() && items().length === 0 && !filtered()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3 flex flex-col gap-3">
        <app-recruitment-nav />
        <app-guide-intro scope="recruitment" page="requisitions" />
      </div>
      <ng-container toolbar>
        <app-tour-button scope="recruitment" tour="requisitions" />
        <app-recruitment-lesson-button lesson="fair-screening" />
        @if (perms().write) {
          <a routerLink="/recruitment/requisitions/new" appTourStep="recruitment-new">
            <app-button>
              <app-icon name="plus" [size]="15" />
              {{ 'recruitment.requisitions.new' | transloco }}
            </app-button>
          </a>
        }
      </ng-container>
      <ng-container filters>
        <label class="sr-only" for="req-status">{{
          'recruitment.filters.status' | transloco
        }}</label>
        <select
          id="req-status"
          class="cf-filter"
          appTourStep="recruitment-status-filter"
          [value]="status()"
          (change)="setStatus($any($event.target).value)"
        >
          <option value="">{{ 'recruitment.filters.allStatuses' | transloco }}</option>
          <option value="active">{{ 'recruitment.filters.activeStatuses' | transloco }}</option>
          @for (s of statuses; track s) {
            <option [value]="s">{{ 'recruitment.requisitionStatus.' + s | transloco }}</option>
          }
        </select>
        <label class="sr-only" for="req-owner">{{ 'recruitment.filters.owner' | transloco }}</label>
        <select
          id="req-owner"
          class="cf-filter"
          [value]="owner()"
          (change)="setOwner($any($event.target).value)"
        >
          <option value="">{{ 'recruitment.filters.everyone' | transloco }}</option>
          <option value="me">{{ 'recruitment.filters.mine' | transloco }}</option>
        </select>
        <label class="sr-only" for="req-sort">{{ 'recruitment.filters.sort' | transloco }}</label>
        <select
          id="req-sort"
          class="cf-filter"
          [value]="sort()"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s">
              {{ 'recruitment.requisitions.sort.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
      </ng-container>

      <app-card [padded]="false">
        @if (loading() && items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        } @else if (items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'recruitment.common.noMatches' | transloco }}
          </p>
        } @else {
          <ul>
            @for (row of items(); track row.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/recruitment/requisitions', row.id]"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span class="w-[84px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    row.code
                  }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold text-fg">{{ row.title }}</span>
                    <span class="block truncate text-[12.5px] text-fg-muted">
                      {{ 'recruitment.employmentType.' + row.employment_type | transloco }}
                      @if (row.location) {
                        · {{ row.location }}
                      }
                      @if (row.hiring_manager) {
                        ·
                        {{
                          'recruitment.requisitions.managedBy'
                            | transloco: { name: row.hiring_manager.name }
                        }}
                      }
                    </span>
                  </span>
                  <app-badge [tone]="riskTone(row.role_risk)">{{
                    'recruitment.roleRisk.' + row.role_risk | transloco
                  }}</app-badge>
                  <app-badge [tone]="statusTone(row.status)">{{
                    'recruitment.requisitionStatus.' + row.status | transloco
                  }}</app-badge>
                  <span class="w-[150px] flex-none text-right text-[12.5px] text-fg-subtle">
                    {{
                      'recruitment.requisitions.counts'
                        | transloco
                          : { active: activeCount(row), hires: row.hires, headcount: row.headcount }
                    }}
                  </span>
                  <span
                    class="hidden w-[100px] flex-none text-right text-[12.5px] text-fg-subtle sm:block"
                  >
                    {{ row.target_start_date ? (row.target_start_date | localDay) : '—' }}
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      </app-card>
      <app-pager
        [offset]="offset()"
        [pageSize]="pageSize"
        [count]="items().length"
        [total]="total()"
        (pageChange)="goTo($event)"
      />
      <div class="mt-6">
        <app-why-it-matters scope="recruitment" page="requisitions" />
      </div>

      <div empty>
        <app-card>
          <app-teaching-empty
            scope="recruitment"
            page="requisitions"
            [showAction]="perms().write"
            (action)="create()"
          />
        </app-card>
        <div class="mt-6">
          <app-why-it-matters scope="recruitment" page="requisitions" />
        </div>
      </div>
    </app-record-list-page>
  `,
  styles: [
    `
      .cf-filter {
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
      }
      .cf-filter:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class RequisitionsList {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly perms = injectRecruitmentPerms();

  protected readonly statuses = REQUISITION_STATUSES;
  protected readonly sorts = REQUISITION_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusTone = requisitionStatusTone;
  protected readonly riskTone = riskTone;
  protected readonly activeCount = activeApplicationCount;

  protected readonly q = signal('');
  protected readonly status = signal<'' | 'active' | RequisitionStatus>('');
  protected readonly owner = signal<'' | 'me'>('');
  protected readonly sort = signal<RequisitionSort>('-created_at');
  protected readonly offset = signal(0);

  protected readonly items = signal<readonly Requisition[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);

  protected readonly filtered = computed(
    () => this.q() !== '' || this.status() !== '' || this.owner() !== '',
  );
  protected readonly viewFilters = computed(() => ({
    status: this.status(),
    owner: this.owner(),
    sort: this.sort(),
  }));

  constructor() {
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: 'job_requisition',
      view: 'list',
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      const query = {
        q: this.q(),
        status: this.statusFilter(),
        owner: this.owner() || undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      } as const;
      if (!orgId) {
        return;
      }
      this.loading.set(true);
      const sub = this.api.listRequisitions(orgId, query).subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  private statusFilter(): readonly RequisitionStatus[] | undefined {
    const s = this.status();
    if (s === 'active') {
      return ['draft', 'pending_approval', 'approved', 'open', 'on_hold'];
    }
    return s ? [s] : undefined;
  }

  protected sortKey(sort: RequisitionSort): string {
    return sort === '-created_at' ? 'newest' : sort === 'created_at' ? 'oldest' : sort;
  }

  protected onSearch(text: string): void {
    this.q.set(text.trim());
    this.offset.set(0);
  }

  protected setStatus(value: string): void {
    this.status.set(value as '' | 'active' | RequisitionStatus);
    this.offset.set(0);
  }

  protected setOwner(value: string): void {
    this.owner.set(value === 'me' ? 'me' : '');
    this.offset.set(0);
  }

  protected setSort(value: string): void {
    if ((REQUISITION_SORTS as readonly string[]).includes(value)) {
      this.sort.set(value as RequisitionSort);
      this.offset.set(0);
    }
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.status.set((f['status'] ?? '') as '' | 'active' | RequisitionStatus);
    this.owner.set(f['owner'] === 'me' ? 'me' : '');
    this.setSort(f['sort'] ?? '-created_at');
    this.offset.set(0);
  }

  protected goTo(offset: number): void {
    this.offset.set(offset);
  }

  protected create(): void {
    void this.router.navigate(['/recruitment/requisitions/new']);
  }
}
