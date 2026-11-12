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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
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
import { reviewStatusTone } from '../data/asset-display';
import {
  AccessReview,
  AccessReviewListQuery,
  REVIEW_SORTS,
  REVIEW_STATUSES,
  ReviewSort,
  ReviewStatus,
} from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { AssetsNav } from '../shared/assets-nav';

const PAGE_SIZE = 25;

export const REVIEW_DUE_FILTERS = ['30', '90'] as const;

export interface ReviewFilters {
  /** A status, or `open` for planned + in progress. */
  readonly status: ReviewStatus | 'open' | '';
  readonly reviewer: 'me' | '';
  readonly due: (typeof REVIEW_DUE_FILTERS)[number] | '';
  readonly sort: ReviewSort;
}

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  status: 'open',
  reviewer: '',
  due: '',
  sort: 'due_on',
};

export function reviewFiltersFromView(values: Readonly<Record<string, string>>): ReviewFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
  return {
    status: values['status'] === 'open' ? 'open' : pick(values['status'], REVIEW_STATUSES),
    reviewer: values['reviewer'] === 'me' ? 'me' : '',
    due: pick(values['due'], REVIEW_DUE_FILTERS),
    sort: pick(values['sort'], REVIEW_SORTS) || 'due_on',
  };
}

export function reviewQuery(q: string, f: ReviewFilters, offset: number): AccessReviewListQuery {
  return {
    q: q || undefined,
    status: f.status === 'open' ? ['planned', 'in_progress'] : f.status ? [f.status] : undefined,
    reviewer: f.reviewer || undefined,
    due_within_days: f.due ? Number(f.due) : undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * Access reviews (`/assets/access-reviews`): the periodic check, per system, that
 * every account still needs the access it has (ISO 27001 A.5.15–A.5.18). Filters on
 * status, reviewer and due date; each row shows the system, the reviewer, progress
 * through the accounts and the due date (red when overdue).
 */
@Component({
  selector: 'app-access-reviews-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    AssetsNav,
    Badge,
    Button,
    Card,
    GuideIntro,
    Icon,
    LessonView,
    Pager,
    RecordListPage,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="assets.reviews.title"
      scope="assets"
      page="reviews"
      searchPlaceholderKey="assets.reviews.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <p class="mt-1 text-[14px] text-fg-muted">{{ 'assets.reviews.subtitle' | transloco }}</p>
        <app-assets-nav />
      </div>

      <ng-container toolbar>
        <app-tour-button scope="assets" tour="reviews" />
        <app-button variant="ghost" size="sm" (click)="askOverview()">
          <app-icon name="spark" [size]="14" />
          {{ 'assets.ai.reviewsOverview' | transloco }}
        </app-button>
        @if (canManage()) {
          <app-button size="sm" appTourStep="assets-review-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'assets.reviews.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <div class="flex flex-wrap items-center gap-2" appTourStep="assets-review-filters">
          <label class="sr-only" for="ar-f-status">{{ 'assets.fields.status' | transloco }}</label>
          <select
            id="ar-f-status"
            [class]="selectClass"
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
          <label class="sr-only" for="ar-f-reviewer">{{
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
                {{ 'assets.filters.dueWithin' | transloco: { days: d } }}
              </option>
            }
          </select>
          <label class="sr-only" for="ar-f-sort">{{ 'assets.filters.sort' | transloco }}</label>
          <select
            id="ar-f-sort"
            [class]="selectClass"
            (change)="setFilter('sort', $any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'assets.filters.reviewSorts.' + s | transloco }}
              </option>
            }
          </select>
        </div>
      </ng-container>

      <div class="mb-4 flex flex-col gap-3">
        <app-guide-intro scope="assets" page="reviews" />
        <div><app-lesson scope="assets" lesson="access-reviews" /></div>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'assets.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'assets.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'assets.filters.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="review-rows">
                @for (row of rows(); track row.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/assets/access-reviews', row.id]"
                        class="flex items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-muted">{{ row.code }}</span>
                        <span class="truncate">{{ row.title }}</span>
                      </a>
                      <span class="flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
                        <span>{{ row.system_asset?.name ?? row.system_name }}</span>
                        @if (row.reviewer?.name; as name) {
                          <span>{{ 'assets.reviews.reviewedBy' | transloco: { name } }}</span>
                        }
                        @if (row.frequency_months; as months) {
                          <span>{{ 'assets.reviews.everyMonths' | transloco: { months } }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <span>
                        {{
                          'assets.reviews.progress'
                            | transloco
                              : {
                                  done: row.counts.total - row.counts.pending,
                                  total: row.counts.total,
                                }
                        }}
                      </span>
                      @if (row.counts.revoke + row.counts.modify) {
                        <app-badge tone="warn">
                          {{
                            'assets.reviews.changesFound'
                              | transloco: { count: row.counts.revoke + row.counts.modify }
                          }}
                        </app-badge>
                      }
                      <app-badge [tone]="tone(row.status)">
                        {{ 'assets.reviewStatus.' + row.status | transloco }}
                      </app-badge>
                      <span
                        class="inline-flex w-[130px] items-center justify-end gap-1"
                        [class.text-fail]="row.overdue"
                        [class.font-semibold]="row.overdue"
                      >
                        @if (row.overdue) {
                          <app-icon name="alert" [size]="13" />
                          <span class="sr-only">{{ 'assets.common.overdue' | transloco }}</span>
                        }
                        {{ 'assets.reviews.dueOn' | transloco: { date: (row.due_on | localDay) } }}
                      </span>
                    </span>
                  </li>
                }
              </ul>
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
      </app-card>

      <div class="mt-6"><app-why-it-matters scope="assets" page="reviews" /></div>

      <div empty class="flex flex-col gap-4">
        <app-guide-intro scope="assets" page="reviews" />
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

  protected readonly selectClass =
    'h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg';
  protected readonly statuses = REVIEW_STATUSES;
  protected readonly dueFilters = REVIEW_DUE_FILTERS;
  protected readonly sorts = REVIEW_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly tone = reviewStatusTone;

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('assets:manage'),
  );

  protected readonly q = signal('');
  protected readonly filters = signal<ReviewFilters>(DEFAULT_REVIEW_FILTERS);
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly AccessReview[]>([]);
  protected readonly total = signal(0);

  protected readonly viewFilters = computed(
    () => ({ ...this.filters() }) as Record<string, string>,
  );
  private readonly isFiltered = computed(() => {
    const f = this.filters();
    return !!this.q() || !!f.reviewer || !!f.due || (!!f.status && f.status !== 'open');
  });
  /** The teaching empty state: only when there are no open reviews and no narrowing filters. */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
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

  protected create(): void {
    void this.router.navigate(['/assets/access-reviews/new']);
  }

  protected askOverview(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.reviewsOverview'));
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
}
