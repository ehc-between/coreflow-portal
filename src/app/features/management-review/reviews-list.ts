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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PlanningCard } from './components/planning-card';
import { ManagementReviewApi } from './data/management-review-api';
import {
  FRAMEWORKS,
  Framework,
  Planning,
  REVIEW_SORTS,
  REVIEW_STATUSES,
  ReviewListQuery,
  ReviewSort,
  ReviewStatus,
  ReviewSummary,
} from './data/management-review.models';
import {
  MR_MODULE,
  MR_NAME_KEY,
  MR_NAV,
  MR_PERMISSIONS,
  MR_SCOPE,
  MR_SETTINGS_LINK,
  OPEN_REVIEW_STATUSES,
  frameworkKey,
  meetingStatusKey,
  mrCrumbs,
  reviewStatusKey,
  toneValue,
} from './management-review-display';
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;

/** Status filter of the list: open reviews by default, one status, or everything. */
export type ReviewStatusFilter = 'open' | 'all' | ReviewStatus;
export const REVIEW_STATUS_FILTERS: readonly ReviewStatusFilter[] = [
  'open',
  ...REVIEW_STATUSES,
  'all',
];

export function reviewStatusesFor(filter: ReviewStatusFilter): readonly ReviewStatus[] {
  if (filter === 'open') {
    return OPEN_REVIEW_STATUSES;
  }
  return filter === 'all' ? [] : [filter];
}

/** The date a review row shows: when it was signed, else when the meeting is. */
export function reviewRowDate(r: ReviewSummary): {
  readonly date: string | null;
  readonly kind: 'date' | 'next';
} {
  return r.signed_at ? { date: r.signed_at, kind: 'date' } : { date: r.scheduled_at, kind: 'next' };
}

const SELECT =
  'h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg outline-none focus:border-accent';

/**
 * `/management-review/reviews` (the module root): where the organisation stands
 * against its review interval (last signed review, next one, when it is due),
 * then the register of management reviews with search, filters (status,
 * standard; sorting and "mine" under "Flere filtre"), saved views and paging.
 */
@Component({
  selector: 'app-mr-reviews-list',
  imports: [
    FulfilsRequirements,
    TranslocoPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    PlanningCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      [titleKey]="nameKey"
      descriptionKey="managementReview.list.subtitle"
      [breadcrumbs]="crumbs"
      [settingsLink]="settingsLink"
      [scope]="scope"
      page="reviews"
      searchPlaceholderKey="managementReview.list.searchPlaceholder"
      [query]="q()"
      [filters]="savedFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="isEmptyRegister()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="management_review.reviews" />
      @if (canWrite()) {
        <app-button primary appTourStep="mr-new" (click)="create()" data-testid="mr-new-review">
          <app-icon name="plus" [size]="14" />
          {{ 'managementReview.list.new' | transloco }}
        </app-button>
      }
      <app-button secondary variant="ghost" (click)="askStatus()">
        <app-icon name="spark" [size]="14" />
        {{ 'managementReview.ai.summariseAll' | transloco }}
      </app-button>

      <app-module-nav nav [labelKey]="nameKey" [items]="nav" />
      <app-help-strip help [scope]="scope" page="list" tour="list" lesson="effective-review" />

      @if (planning(); as p) {
        <app-mr-planning-card kpis class="col-span-full" [planning]="p" (plan)="create()" />
      }

      <ng-container filters>
        <label class="sr-only" for="mr-status">{{
          'managementReview.filters.status' | transloco
        }}</label>
        <select
          id="mr-status"
          [class]="select"
          appTourStep="mr-filters"
          (change)="setStatus($any($event.target).value)"
        >
          @for (s of statusFilters; track s) {
            <option [value]="s" [selected]="status() === s">
              {{ 'managementReview.filters.statusOptions.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="mr-framework">{{
          'managementReview.filters.framework' | transloco
        }}</label>
        <select
          id="mr-framework"
          [class]="select"
          (change)="setFramework($any($event.target).value)"
        >
          <option value="" [selected]="!framework()">
            {{ 'managementReview.filters.allFrameworks' | transloco }}
          </option>
          @for (f of frameworks; track f) {
            <option [value]="f" [selected]="framework() === f">
              {{ frameworkKey(f) | transloco }}
            </option>
          }
        </select>
      </ng-container>
      <ng-container more-filters>
        <div class="flex flex-col gap-1.5">
          <label for="mr-sort" class="text-ui font-semibold text-fg-muted">{{
            'managementReview.filters.sort' | transloco
          }}</label>
          <select id="mr-sort" [class]="select" (change)="setSort($any($event.target).value)">
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="sort() === s">
                {{ 'managementReview.filters.reviewSorts.' + s | transloco }}
              </option>
            }
          </select>
        </div>
        <label class="inline-flex min-h-9 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="mine()"
            (change)="setMine($any($event.target).checked)"
          />
          {{ 'managementReview.filters.mine' | transloco }}
        </label>
      </ng-container>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <div class="p-4"><app-loading-state [rows]="4" /></div>
          }
          @case ('error') {
            <div class="p-4"><app-error-state (retry)="reload()" /></div>
          }
          @default {
            @if (reviews().length === 0) {
              <app-empty-state
                titleKey="ui.empty.noResults"
                bodyKey="ui.empty.noResultsBody"
                ctaKey="ui.empty.clearFilters"
                ctaVariant="secondary"
                [compact]="true"
                (cta)="clearFilters()"
              />
            } @else {
              <div role="list" data-testid="review-rows">
                <app-record-row-header dateKind="date" />
                @for (r of reviews(); track r.id) {
                  <app-record-row
                    [code]="r.code"
                    [title]="r.title"
                    [subtitle]="subtitle(r)"
                    [link]="['/management-review/reviews', r.id]"
                    [owner]="r.owner?.name ?? null"
                    [date]="rowDate(r).date"
                    [dateKind]="rowDate(r).kind"
                  >
                    <app-coverage-chip coverage entityType="management_review" [entityId]="r.id" />
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      [value]="tone(r.status)"
                      [labelKey]="statusKey(r.status)"
                    />
                  </app-record-row>
                }
              </div>
              @if (total() > pageSize) {
                <div class="px-4 py-2.5">
                  <app-pager
                    [offset]="offset()"
                    [pageSize]="pageSize"
                    [count]="reviews().length"
                    [total]="total()"
                    (pageChange)="offset.set($event)"
                  />
                </div>
              }
            }
          }
        }
      </app-card>

      <app-teaching-empty
        empty
        [scope]="scope"
        page="list"
        [showAction]="canWrite()"
        (action)="create()"
      />

      <app-why-it-matters below [scope]="scope" page="list" />
    </app-record-list-page>
  `,
})
export class ReviewsList {
  private readonly api = inject(ManagementReviewApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly scope = MR_SCOPE;
  protected readonly nameKey = MR_NAME_KEY;
  protected readonly nav = MR_NAV;
  protected readonly settingsLink = MR_SETTINGS_LINK;
  protected readonly crumbs = mrCrumbs();
  protected readonly select = SELECT;
  protected readonly statusFilters = REVIEW_STATUS_FILTERS;
  protected readonly frameworks = FRAMEWORKS;
  protected readonly sorts = REVIEW_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = reviewStatusKey;
  protected readonly tone = toneValue;
  protected readonly frameworkKey = frameworkKey;
  protected readonly rowDate = reviewRowDate;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(MR_PERMISSIONS.write),
  );

  protected readonly q = signal('');
  protected readonly status = signal<ReviewStatusFilter>('open');
  protected readonly framework = signal<Framework | ''>('');
  protected readonly sort = signal<ReviewSort>('-created_at');
  protected readonly mine = signal(false);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly reviews = signal<readonly ReviewSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly planning = signal<Planning | null>(null);

  protected readonly isFiltered = computed(
    () => !!this.q() || this.status() !== 'open' || !!this.framework() || this.mine(),
  );
  /** No review at all yet (not a filter that matches nothing): the teaching empty state. */
  protected readonly isEmptyRegister = computed(
    () =>
      this.state() === 'ready' &&
      this.reviews().length === 0 &&
      !this.isFiltered() &&
      !this.planning()?.last_signed &&
      !this.planning()?.upcoming,
  );
  protected readonly moreActive = computed(
    () => (this.sort() !== '-created_at' ? 1 : 0) + (this.mine() ? 1 : 0),
  );
  protected readonly savedFilters = computed<Record<string, string>>(() => ({
    status: this.status(),
    framework: this.framework(),
    sort: this.sort(),
    mine: this.mine() ? '1' : '',
  }));

  private readonly query = computed<ReviewListQuery>(() => ({
    q: this.q() || undefined,
    status: reviewStatusesFor(this.status()),
    framework: this.framework() || undefined,
    owner: this.mine() ? this.auth.user()?.id : undefined,
    sort: this.sort(),
    limit: PAGE_SIZE,
    offset: this.offset(),
  }));

  private request = new Subscription();
  private planningRequest = new Subscription();

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      this.request.unsubscribe();
      this.planningRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: MR_MODULE,
      entityType: 'management_review',
      view: 'list',
      title: this.language.translate(MR_NAME_KEY),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = this.query();
      untracked(() => this.load(orgId, query));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.loadPlanning(orgId));
    });
  }

  /** "Periode 1. okt. 2025 – 30. sep. 2026 · ISO 9001 · ISO 27001 · Møte: Planlagt". */
  protected subtitle(r: ReviewSummary): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts: string[] = [];
    if (r.frameworks.length) {
      parts.push(r.frameworks.map((f) => t(frameworkKey(f))).join(', '));
    }
    if (r.meeting_status) {
      parts.push(
        t('managementReview.list.meeting', { status: t(meetingStatusKey(r.meeting_status)) }),
      );
    }
    return parts.join(' · ');
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: ReviewStatusFilter): void {
    this.offset.set(0);
    this.status.set(value);
  }

  protected setFramework(value: Framework | ''): void {
    this.offset.set(0);
    this.framework.set(value);
  }

  protected setSort(value: ReviewSort): void {
    this.offset.set(0);
    this.sort.set(value);
  }

  protected setMine(value: boolean): void {
    this.offset.set(0);
    this.mine.set(value);
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.status.set('all');
    this.framework.set('');
    this.mine.set(false);
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.status.set(
      REVIEW_STATUS_FILTERS.includes(f['status'] as ReviewStatusFilter)
        ? (f['status'] as ReviewStatusFilter)
        : 'open',
    );
    this.framework.set(
      FRAMEWORKS.includes(f['framework'] as Framework) ? (f['framework'] as Framework) : '',
    );
    this.sort.set(
      REVIEW_SORTS.includes(f['sort'] as ReviewSort) ? (f['sort'] as ReviewSort) : '-created_at',
    );
    this.mine.set(f['mine'] === '1');
  }

  protected create(): void {
    void this.router.navigate(['/management-review/reviews/new']);
  }

  protected askStatus(): void {
    this.ask.showWith(this.language.translate('managementReview.ai.prompts.summariseAll'));
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.query());
  }

  private load(orgId: string | null, query: ReviewListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listReviews(orgId, query).subscribe({
      next: (page) => {
        this.reviews.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  private loadPlanning(orgId: string | null): void {
    this.planningRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    // Planning is a helpful extra: without it (older server) the list still works.
    this.planningRequest = this.api.planning(orgId).subscribe({
      next: (p) => this.planning.set(p),
      error: () => this.planning.set(null),
    });
  }
}
