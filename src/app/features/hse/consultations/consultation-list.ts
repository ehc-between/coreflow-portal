import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { HseApi } from '../data/hse-api';
import {
  CONSULTATION_KINDS,
  CONSULTATION_SORTS,
  CONSULTATION_STATUSES,
  Consultation,
  ConsultationKind,
  ConsultationQuery,
  ConsultationSort,
  ConsultationStatus,
} from '../data/hse.models';
import { consultationStatusTone } from '../hse-format';
import { HSE_MODULE, HseLessonButton, HseNav, injectHsePermissions } from '../shared/hse-shared';

const PAGE_SIZE = 25;
const SELECT_CLASS =
  'h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent';

/**
 * `/hse/consultations`: worker consultation and participation records (meetings,
 * safety committee, surveys, toolbox talks, suggestions) with search, status /
 * kind filters, sorting, saved views and paging.
 */
@Component({
  selector: 'app-consultation-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    RecordListPage,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    HseNav,
    HseLessonButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="hse.consultation.list.title"
      scope="hse"
      page="consultations"
      searchPlaceholderKey="hse.consultation.list.search"
      [query]="query()"
      [filters]="filters()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1">
        <p class="text-[14px] text-fg-muted">{{ 'hse.consultation.list.subtitle' | transloco }}</p>
      </div>
      <ng-container toolbar>
        <app-hse-lesson-button lesson="worker-participation" labelKey="hse.consultation.lesson" />
        @if (perms.write()) {
          <a routerLink="/hse/consultations/new" tabindex="-1">
            <app-button>
              <app-icon name="plus" [size]="15" />
              {{ 'hse.consultation.new' | transloco }}
            </app-button>
          </a>
        }
      </ng-container>
      <ng-container filters>
        <label class="sr-only" for="wc-status">{{ 'hse.common.status' | transloco }}</label>
        <select
          id="wc-status"
          [class]="selectClass"
          (change)="set('status', $any($event.target).value)"
        >
          <option value="">{{ 'hse.common.allStatuses' | transloco }}</option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="s === status()">
              {{ 'hse.consultation.status.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="wc-kind">{{
          'hse.consultation.fields.kind' | transloco
        }}</label>
        <select
          id="wc-kind"
          [class]="selectClass"
          (change)="set('kind', $any($event.target).value)"
        >
          <option value="">{{ 'hse.consultation.list.allKinds' | transloco }}</option>
          @for (k of kinds; track k) {
            <option [value]="k" [selected]="k === kind()">
              {{ 'hse.consultation.kind.' + k | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="wc-sort">{{ 'hse.common.sort' | transloco }}</label>
        <select
          id="wc-sort"
          [class]="selectClass"
          (change)="set('sort', $any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === sort()">
              {{ 'hse.consultation.sort.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
      </ng-container>

      <app-hse-nav />
      <div class="mb-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <app-guide-intro scope="hse" page="consultations" />
        <app-why-it-matters scope="hse" page="consultations" />
      </div>

      <app-card [padded]="false">
        @if (state() === 'loading') {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'hse.common.loading' | transloco }}
          </p>
        } @else if (state() === 'error') {
          <p class="px-4 py-10 text-center text-[14px] text-fail" role="alert">
            {{ 'hse.common.loadFailed' | transloco }}
          </p>
        } @else if (items().length === 0 && !filtered()) {
          <app-teaching-empty
            scope="hse"
            page="consultations"
            [showAction]="perms.write()"
            (action)="create()"
          />
        } @else if (items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'hse.common.noMatches' | transloco }}
          </p>
        } @else {
          <ul data-testid="consultation-rows">
            @for (row of items(); track row.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/hse/consultations', row.id]"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 outline-none focus-visible:bg-surface-2"
                >
                  <span class="w-[84px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    row.code
                  }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold text-fg">{{ row.title }}</span>
                    <span class="block truncate text-[12.5px] text-fg-muted">
                      {{ 'hse.consultation.kind.' + row.kind | transloco }}
                      @if (row.worker_representative_present) {
                        · {{ 'hse.consultation.list.repPresent' | transloco }}
                      }
                    </span>
                  </span>
                  <app-badge [tone]="statusTone(row.status)">{{
                    'hse.consultation.status.' + row.status | transloco
                  }}</app-badge>
                  <span class="w-[110px] flex-none text-right text-[12.5px] text-fg-subtle">
                    {{ row.held_at || row.scheduled_at | localDate: 'mediumDate' }}
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
        (pageChange)="offset.set($event)"
      />
    </app-record-list-page>
  `,
})
export class ConsultationList {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);

  protected readonly perms = injectHsePermissions();
  protected readonly statuses = CONSULTATION_STATUSES;
  protected readonly kinds = CONSULTATION_KINDS;
  protected readonly sorts = CONSULTATION_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly selectClass = SELECT_CLASS;
  protected readonly statusTone = consultationStatusTone;

  protected readonly query = signal('');
  protected readonly status = signal<ConsultationStatus | ''>('');
  protected readonly kind = signal<ConsultationKind | ''>('');
  protected readonly sort = signal<ConsultationSort>('-created_at');
  protected readonly offset = signal(0);

  protected readonly items = signal<readonly Consultation[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly filtered = computed(() => !!(this.query() || this.status() || this.kind()));
  protected readonly filters = computed(() => ({
    status: this.status(),
    kind: this.kind(),
    sort: this.sort(),
  }));

  private request = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'worker_consultation',
      view: 'list',
    }));
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    this.applyFilters({ status: params.get('status') ?? '' });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: ConsultationQuery = {
        q: this.query() || undefined,
        status: this.status() ? [this.status() as ConsultationStatus] : undefined,
        kind: this.kind() || undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  private load(orgId: string | null, query: ConsultationQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listConsultations(orgId, query).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.state.set('ready');
      },
      error: () => {
        this.items.set([]);
        this.state.set('error');
      },
    });
  }

  private applyFilters(f: Readonly<Record<string, string>>): void {
    const status = f['status'] ?? '';
    this.status.set(
      (CONSULTATION_STATUSES as readonly string[]).includes(status)
        ? (status as ConsultationStatus)
        : '',
    );
    const kind = f['kind'] ?? '';
    this.kind.set(
      (CONSULTATION_KINDS as readonly string[]).includes(kind) ? (kind as ConsultationKind) : '',
    );
    const sort = f['sort'] ?? '';
    this.sort.set(
      (CONSULTATION_SORTS as readonly string[]).includes(sort)
        ? (sort as ConsultationSort)
        : '-created_at',
    );
  }

  protected sortKey(sort: ConsultationSort): string {
    return sort.replace(/^-/, 'desc_');
  }

  protected onSearch(text: string): void {
    this.query.set(text.trim());
    this.offset.set(0);
  }

  protected set(key: 'status' | 'kind' | 'sort', value: string): void {
    this.applyFilters({ ...this.filters(), [key]: value });
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.applyFilters(view.filters);
    this.offset.set(0);
  }

  protected create(): void {
    void this.router.navigate(['/hse/consultations/new']);
  }
}
