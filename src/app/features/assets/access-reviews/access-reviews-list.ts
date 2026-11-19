import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription, catchError, forkJoin, map, of } from 'rxjs';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { reviewStatusBadge } from '../data/asset-display';
import {
  AccessReview,
  AccessReviewListQuery,
  REVIEW_SORTS,
  REVIEW_STATUSES,
  ReviewSort,
  ReviewStatus,
} from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { assetsNav } from '../shared/assets-nav';

const PAGE_SIZE = 25;

export const REVIEW_DUE_FILTERS = ['overdue', '30', '90'] as const;

export interface ReviewFilters {
  /** A status, or `open` for planned + in progress. */
  readonly status: ReviewStatus | 'open' | '';
  readonly reviewer: 'me' | '';
  /** `overdue`, or due within 30 / 90 days. */
  readonly due: (typeof REVIEW_DUE_FILTERS)[number] | '';
  readonly sort: ReviewSort;
}

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  status: 'open',
  reviewer: '',
  due: '',
  sort: 'due_on',
};

/** Restore filters from a saved view or the URL (`?overdue=true` from the home page). */
export function reviewFiltersFromView(values: Readonly<Record<string, string>>): ReviewFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
  const status =
    values['status'] === 'open'
      ? 'open'
      : values['status'] === undefined
        ? DEFAULT_REVIEW_FILTERS.status
        : pick(values['status'], REVIEW_STATUSES);
  return {
    status,
    reviewer: values['reviewer'] === 'me' ? 'me' : '',
    due: values['overdue'] === 'true' ? 'overdue' : pick(values['due'], REVIEW_DUE_FILTERS),
    sort: pick(values['sort'], REVIEW_SORTS) || 'due_on',
  };
}

export function reviewQuery(q: string, f: ReviewFilters, offset: number): AccessReviewListQuery {
  return {
    q: q || undefined,
    status: f.status === 'open' ? ['planned', 'in_progress'] : f.status ? [f.status] : undefined,
    reviewer: f.reviewer || undefined,
    overdue: f.due === 'overdue' ? true : undefined,
    due_within_days: f.due && f.due !== 'overdue' ? Number(f.due) : undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

interface Kpi {
  readonly key: string;
  readonly labelKey: string;
  readonly value: number;
  readonly tone: KpiTone;
  readonly filter: Partial<ReviewFilters>;
}

interface Summary {
  readonly open: number;
  readonly overdue: number;
  readonly inProgress: number;
  readonly mine: number;
  readonly completed: number;
}

/**
 * Access reviews (`/assets/access-reviews`): the periodic check, per system, that
 * every account still needs the access it has (ISO 27001 A.5.15–A.5.18). Headline
 * figures that double as filters (open, overdue, in progress, mine, completed);
 * status, reviewer and due filters; each row shows the system, how many accounts are
 * decided, flagged holders and access to change, the reviewer and the due date.
 */
@Component({
  selector: 'app-access-reviews-list',
  imports: [
    TranslocoPipe,
    Button,
    Card,
    CoverageChip,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    MenuItem,
    ModuleNav,
    Pager,
    RecordListPage,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="assets.reviews.title"
      descriptionKey="assets.reviews.subtitle"
      [breadcrumbs]="[{ labelKey: 'modules.names.assets', link: '/assets' }]"
      scope="assets"
      page="reviews"
      searchPlaceholderKey="assets.reviews.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="(filters().reviewer ? 1 : 0) + (filters().sort !== 'due_on' ? 1 : 0)"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      @if (canManage()) {
        <app-button primary appTourStep="assets-review-new" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'assets.reviews.new' | transloco }}
        </app-button>
      }
      @if (!ai.unavailable()) {
        <button appMenuItem overflow type="button" (click)="askOverview()">
          {{ 'assets.ai.reviewsOverview' | transloco }}
        </button>
      }

      <div nav appTourStep="assets-sections">
        <app-module-nav labelKey="modules.names.assets" [items]="nav()" />
      </div>
      <app-help-strip help scope="assets" page="reviews" tour="reviews" lesson="access-reviews" />

      <ng-container ngProjectAs="[kpis]">
        @for (k of kpis(); track k.key) {
          <button
            type="button"
            class="block h-full w-full rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&_app-kpi-tile]:block [&_app-kpi-tile]:h-full [&_app-kpi-tile>div]:h-full"
            [class.max-sm:hidden]="k.key === 'completed'"
            [class.ring-2]="kpiActive(k)"
            [class.ring-accent]="kpiActive(k)"
            [attr.aria-pressed]="kpiActive(k)"
            [attr.data-testid]="'kpi-' + k.key"
            (click)="applyKpi(k)"
          >
            <app-kpi-tile [label]="k.labelKey | transloco" [value]="k.value" [tone]="k.tone" />
          </button>
        }
      </ng-container>

      <ng-container filters>
        <label class="sr-only" for="ar-f-status">{{ 'assets.fields.status' | transloco }}</label>
        <select
          id="ar-f-status"
          [class]="selectClass"
          appTourStep="assets-review-filters"
          (change)="setFilter('status', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().status">
            {{ 'assets.filters.anyStatus' | transloco }}
          </option>
          <option value="open" [selected]="filters().status === 'open'">
            {{ 'assets.reviews.openOnly' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="filters().status === s">
              {{ 'assets.reviewStatus.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="ar-f-due">{{ 'assets.fields.dueOn' | transloco }}</label>
        <select
          id="ar-f-due"
          [class]="selectClass"
          (change)="setFilter('due', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().due">
            {{ 'assets.filters.anyDue' | transloco }}
          </option>
          @for (d of dueFilters; track d) {
            <option [value]="d" [selected]="filters().due === d">
              {{
                d === 'overdue'
                  ? ('assets.common.overdue' | transloco)
                  : ('assets.filters.dueWithin' | transloco: { days: d })
              }}
            </option>
          }
        </select>
      </ng-container>

      <div more-filters class="flex flex-col gap-1 empty:hidden">
        <label class="text-meta font-semibold text-fg-muted" for="ar-f-reviewer">{{
          'assets.fields.reviewer' | transloco
        }}</label>
        <select
          id="ar-f-reviewer"
          [class]="selectClass"
          (change)="setFilter('reviewer', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().reviewer">
            {{ 'assets.filters.anyReviewer' | transloco }}
          </option>
          <option value="me" [selected]="filters().reviewer === 'me'">
            {{ 'assets.filters.reviewedByMe' | transloco }}
          </option>
        </select>
      </div>
      <div more-filters class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'assets.filters.sort' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setFilter('sort', $any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'assets.filters.reviewSorts.' + s | transloco }}
              </option>
            }
          </select>
        </label>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="4" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (rows().length === 0) {
              <app-empty-state
                icon="search"
                titleKey="ui.empty.noResults"
                bodyKey="ui.empty.noResultsBody"
                ctaKey="ui.empty.clearFilters"
                ctaVariant="secondary"
                (cta)="clearFilters()"
              />
            } @else {
              <div role="list" data-testid="review-rows">
                <app-record-row-header dateKind="due" />
                @for (row of rows(); track row.id) {
                  <app-record-row
                    [code]="row.code"
                    [title]="row.title"
                    [subtitle]="subtitle(row)"
                    [link]="['/assets/access-reviews', row.id]"
                    [owner]="row.reviewer?.name"
                    [date]="row.due_on"
                    dateKind="due"
                    [overdue]="row.overdue"
                  >
                    <app-status-badge
                      badges
                      [meaning]="statusBadge(row.status).meaning"
                      [value]="statusBadge(row.status).value"
                      [labelKey]="'assets.reviewStatus.' + row.status"
                    />
                    @if (row.counts.flagged) {
                      <app-status-badge
                        badges
                        meaning="lifecycle"
                        value="due"
                        labelKey="assets.reviews.flagged"
                        [labelParams]="{ count: row.counts.flagged }"
                      />
                    }
                    @if (row.counts.revoke + row.counts.modify) {
                      <app-status-badge
                        badges
                        meaning="lifecycle"
                        value="due"
                        labelKey="assets.reviews.changesFound"
                        [labelParams]="{ count: row.counts.revoke + row.counts.modify }"
                      />
                    }
                    <app-coverage-chip coverage entityType="access_review" [entityId]="row.id" />
                  </app-record-row>
                }
              </div>
              @if (total() > pageSize) {
                <div class="border-t border-border px-4 py-2.5">
                  <app-pager
                    [offset]="offset()"
                    [pageSize]="pageSize"
                    [count]="rows().length"
                    [total]="total()"
                    (pageChange)="offset.set($event)"
                  />
                </div>
              }
            }
          }
        }
      </app-card>

      <app-why-it-matters below scope="assets" page="reviews" />

      <div empty class="flex flex-col gap-4">
        <app-teaching-empty
          scope="assets"
          page="reviews"
          [showAction]="canManage()"
          (action)="create()"
        />
        <app-why-it-matters scope="assets" page="reviews" />
      </div>
    </app-record-list-page>
  `,
})
export class AccessReviewsList {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly ai = inject(AiAvailability);

  protected readonly selectClass =
    'h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg';
  protected readonly statuses = REVIEW_STATUSES;
  protected readonly dueFilters = REVIEW_DUE_FILTERS;
  protected readonly sorts = REVIEW_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusBadge = reviewStatusBadge;

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('assets:manage'),
  );

  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly filters = signal<ReviewFilters>(
    reviewFiltersFromView(this.route.snapshot.queryParams as Record<string, string>),
  );
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly AccessReview[]>([]);
  protected readonly total = signal(0);
  protected readonly summary = signal<Summary | null>(null);

  protected readonly nav = computed(() => assetsNav({ openReviews: this.summary()?.open }));
  protected readonly viewFilters = computed(
    () => ({ ...this.filters() }) as Record<string, string>,
  );
  private readonly isFiltered = computed(() => {
    const f = this.filters();
    return !!this.q() || !!f.reviewer || !!f.due || (!!f.status && f.status !== 'open');
  });
  /** The teaching empty state: only when nothing at all is planned and nothing narrows the list. */
  protected readonly showEmpty = computed(
    () =>
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.isFiltered() &&
      (this.summary()?.completed ?? 0) === 0,
  );

  protected readonly kpis = computed<readonly Kpi[]>(() => {
    const s = this.summary();
    if (!s || s.open + s.completed === 0) {
      return [];
    }
    return [
      {
        key: 'open',
        labelKey: 'assets.reviews.kpiOpen',
        value: s.open,
        tone: 'neutral',
        filter: { status: 'open', due: '', reviewer: '' },
      },
      {
        key: 'overdue',
        labelKey: 'assets.reviews.kpiOverdue',
        value: s.overdue,
        tone: s.overdue ? 'warn' : 'pass',
        filter: { status: 'open', due: 'overdue', reviewer: '' },
      },
      {
        key: 'inProgress',
        labelKey: 'assets.reviews.kpiInProgress',
        value: s.inProgress,
        tone: 'neutral',
        filter: { status: 'in_progress', due: '', reviewer: '' },
      },
      {
        key: 'mine',
        labelKey: 'assets.reviews.kpiMine',
        value: s.mine,
        tone: s.mine ? 'warn' : 'neutral',
        filter: { status: 'open', due: '', reviewer: 'me' },
      },
      {
        key: 'completed',
        labelKey: 'assets.reviews.kpiCompleted',
        value: s.completed,
        tone: s.completed ? 'pass' : 'neutral',
        filter: { status: 'completed', due: '', reviewer: '' },
      },
    ];
  });

  private request = new Subscription();
  private summaryRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.summaryRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'assets',
      entityType: 'access_review',
      view: 'list',
      title: this.language.translate('assets.reviews.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = reviewQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.loadSummary(orgId));
    });
  }

  protected search(text: string): void {
    this.offset.set(0);
    this.q.set(text.trim());
  }

  protected setFilter<K extends keyof ReviewFilters>(key: K, value: string): void {
    this.offset.set(0);
    this.filters.update((f) => reviewFiltersFromView({ ...f, [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(reviewFiltersFromView(view.filters));
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.filters.set({ ...DEFAULT_REVIEW_FILTERS, status: '', sort: this.filters().sort });
  }

  protected kpiActive(k: Kpi): boolean {
    const f = this.filters();
    return Object.entries(k.filter).every(
      ([key, value]) => f[key as keyof ReviewFilters] === value,
    );
  }

  protected applyKpi(k: Kpi): void {
    this.offset.set(0);
    const active = this.kpiActive(k);
    const base: ReviewFilters = { ...DEFAULT_REVIEW_FILTERS, sort: this.filters().sort };
    this.filters.set(active ? base : { ...base, ...k.filter });
  }

  /** System · every N months · "3 av 5 avgjort". */
  protected subtitle(row: AccessReview): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts: string[] = [];
    const system = row.system_asset?.name ?? row.system_name;
    if (system) {
      parts.push(system);
    }
    parts.push(
      row.frequency_months
        ? t('assets.reviews.everyMonths', { months: row.frequency_months })
        : t('assets.reviewDetail.oneOff'),
    );
    if (row.counts.total) {
      parts.push(
        t('assets.reviews.progress', {
          done: row.counts.total - row.counts.pending,
          total: row.counts.total,
        }),
      );
    }
    return parts.join(' · ');
  }

  protected create(): void {
    void this.router.navigate(['/assets/access-reviews/new']);
  }

  protected askOverview(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.reviewsOverview'));
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.load(orgId, reviewQuery(this.q(), this.filters(), this.offset()));
    this.loadSummary(orgId);
  }

  private load(orgId: string | null, query: AccessReviewListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listReviews(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  private loadSummary(orgId: string | null): void {
    this.summaryRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    const open: readonly ReviewStatus[] = ['planned', 'in_progress'];
    const count = (query: AccessReviewListQuery): Observable<number> =>
      this.api.listReviews(orgId, { ...query, limit: 1 }).pipe(
        map((page) => page.total),
        catchError(() => of(0)),
      );
    this.summaryRequest = forkJoin({
      open: count({ status: open }),
      overdue: count({ status: open, overdue: true }),
      inProgress: count({ status: ['in_progress'] }),
      mine: count({ status: open, reviewer: 'me' }),
      completed: count({ status: ['completed'] }),
    }).subscribe((summary) => this.summary.set(summary));
  }
}
