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
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
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
import { SJA_SORTS, SJA_STATUSES, Sja, SjaSort, SjaStatus } from '../data/hse.models';
import { riskTone, sjaStatusTone } from '../hse-format';
import { HSE_MODULE, HseLessonButton, HseNav, injectHsePermissions } from '../shared/hse-shared';

const PAGE_SIZE = 25;

/**
 * `/hse/sja`: safe job analyses with search, status / "mine" filters, sorting,
 * saved views and paging. `?status=` (from the overview) seeds the status filter.
 */
@Component({
  selector: 'app-sja-list',
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
    TourButton,
    TourStepDirective,
    HseNav,
    HseLessonButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="hse.sja.list.title"
      scope="hse"
      page="sja"
      searchPlaceholderKey="hse.sja.list.search"
      [query]="query()"
      [filters]="filters()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1">
        <p class="text-[14px] text-fg-muted">{{ 'hse.sja.list.subtitle' | transloco }}</p>
      </div>
      <ng-container toolbar>
        <app-tour-button scope="hse" tour="sja" />
        <app-hse-lesson-button lesson="sja-basics" labelKey="hse.sja.lesson" />
        @if (perms.write()) {
          <a routerLink="/hse/sja/new" tabindex="-1" appTourStep="hse-sja-new">
            <app-button>
              <app-icon name="plus" [size]="15" />
              {{ 'hse.sja.new' | transloco }}
            </app-button>
          </a>
        }
      </ng-container>
      <ng-container filters>
        <label class="sr-only" for="sja-status">{{ 'hse.common.status' | transloco }}</label>
        <select
          id="sja-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
          [value]="status()"
          (change)="setStatus($any($event.target).value)"
          appTourStep="hse-sja-filters"
        >
          <option value="">{{ 'hse.common.allStatuses' | transloco }}</option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="s === status()">
              {{ 'hse.sja.status.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="sja-sort">{{ 'hse.common.sort' | transloco }}</label>
        <select
          id="sja-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
          [value]="sort()"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === sort()">
              {{ 'hse.sja.sort.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
        <button
          type="button"
          class="h-10 rounded-[10px] border px-3 text-[13px] font-semibold"
          [class]="
            mine()
              ? 'border-accent-border bg-accent-soft text-accent'
              : 'border-border bg-bg text-fg-muted hover:text-fg'
          "
          [attr.aria-pressed]="mine()"
          (click)="toggleMine()"
        >
          {{ 'hse.common.mine' | transloco }}
        </button>
      </ng-container>

      <app-hse-nav />
      <div class="mb-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <app-guide-intro scope="hse" page="sja" />
        <app-why-it-matters scope="hse" page="sja" />
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
            page="sja"
            [showAction]="perms.write()"
            (action)="create()"
          />
        } @else if (items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'hse.common.noMatches' | transloco }}
          </p>
        } @else {
          <ul data-testid="sja-rows">
            @for (row of items(); track row.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/hse/sja', row.id]"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 outline-none focus-visible:bg-surface-2"
                >
                  <span class="w-[84px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    row.code
                  }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold text-fg">{{ row.title }}</span>
                    <span class="block truncate text-[12.5px] text-fg-muted">
                      {{ row.location || ('hse.common.noLocation' | transloco) }}
                      ·
                      {{
                        'hse.sja.list.counts'
                          | transloco: { hazards: row.hazard_count, controls: row.control_count }
                      }}
                    </span>
                  </span>
                  @if (row.residual_risk_level || row.risk_level; as level) {
                    <app-badge [tone]="riskTone(level)">{{
                      'hse.risk.' + level | transloco
                    }}</app-badge>
                  }
                  <app-badge [tone]="statusTone(row.status)">{{
                    'hse.sja.status.' + row.status | transloco
                  }}</app-badge>
                  <span
                    class="hidden w-[130px] flex-none truncate text-right text-[12.5px] text-fg-subtle sm:block"
                  >
                    {{ row.owner?.name ?? '' }}
                  </span>
                  <span class="w-[96px] flex-none text-right text-[12.5px] text-fg-subtle">
                    {{ row.work_start_at | localDate: 'mediumDate' }}
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
    </app-record-list-page>
  `,
})
export class SjaList {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);

  protected readonly perms = injectHsePermissions();
  protected readonly statuses = SJA_STATUSES;
  protected readonly sorts = SJA_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusTone = sjaStatusTone;
  protected readonly riskTone = riskTone;

  protected readonly query = signal('');
  protected readonly status = signal<SjaStatus | ''>('');
  protected readonly sort = signal<SjaSort>('-created_at');
  protected readonly mine = signal(false);
  protected readonly offset = signal(0);

  protected readonly items = signal<readonly Sja[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly filtered = computed(
    () => this.query() !== '' || this.status() !== '' || this.mine(),
  );
  protected readonly filters = computed(() => ({
    status: this.status(),
    sort: this.sort(),
    mine: this.mine() ? '1' : '',
  }));

  private request = new Subscription();

  constructor() {
    providePageContext(() => ({ module: HSE_MODULE, entityType: 'sja', view: 'list' }));
    const status = inject(ActivatedRoute).snapshot.queryParamMap.get('status');
    if (status && (SJA_STATUSES as readonly string[]).includes(status)) {
      this.status.set(status as SjaStatus);
    }
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const params = {
        q: this.query() || undefined,
        status: this.status() ? [this.status() as SjaStatus] : undefined,
        owner: this.mine() ? 'me' : undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, params));
    });
  }

  private load(orgId: string | null, params: Parameters<HseApi['listSja']>[1]): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listSja(orgId, params).subscribe({
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

  protected sortKey(sort: SjaSort): string {
    return sort.replace(/^-/, 'desc_');
  }

  protected onSearch(text: string): void {
    this.query.set(text.trim());
    this.offset.set(0);
  }

  protected setStatus(value: string): void {
    this.status.set(value as SjaStatus | '');
    this.offset.set(0);
  }

  protected setSort(value: string): void {
    this.sort.set(value as SjaSort);
    this.offset.set(0);
  }

  protected toggleMine(): void {
    this.mine.update((v) => !v);
    this.offset.set(0);
  }

  protected goTo(offset: number): void {
    this.offset.set(offset);
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.status.set((f['status'] as SjaStatus | undefined) ?? '');
    const sort = f['sort'] as SjaSort | undefined;
    this.sort.set(sort && (SJA_SORTS as readonly string[]).includes(sort) ? sort : '-created_at');
    this.mine.set(f['mine'] === '1');
    this.offset.set(0);
  }

  protected create(): void {
    void this.router.navigate(['/hse/sja/new']);
  }
}
