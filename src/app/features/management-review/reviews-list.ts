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
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { Pager } from '../../shared/ui/pager/pager';
import { MrTabs } from './components/mr-tabs';
import { ManagementReviewApi } from './data/management-review-api';
import {
  FRAMEWORKS,
  Framework,
  REVIEW_SORTS,
  REVIEW_STATUSES,
  ReviewListQuery,
  ReviewSort,
  ReviewStatus,
  ReviewSummary,
} from './data/management-review.models';
import {
  MR_MODULE,
  MR_PERMISSIONS,
  MR_SCOPE,
  OPEN_REVIEW_STATUSES,
  frameworkKey,
  meetingStatusKey,
  reviewStatusKey,
  reviewStatusTone,
} from './management-review-display';

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

/**
 * `/management-review/reviews`: the register of management reviews with search,
 * filters (status, standard, mine), sorting, saved views and paging.
 */
@Component({
  selector: 'app-mr-reviews-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    GuideIntro,
    LessonView,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    MrTabs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="managementReview.list.title"
      [scope]="scope"
      page="reviews"
      searchPlaceholderKey="managementReview.list.searchPlaceholder"
      [query]="q()"
      [filters]="savedFilters()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1.5">
        <p class="text-[14px] text-fg-muted">{{ 'managementReview.list.subtitle' | transloco }}</p>
      </div>

      <ng-container toolbar>
        <app-tour-button [scope]="scope" tour="list" />
        <app-button variant="ghost" size="sm" (click)="askStatus()">
          <app-icon name="spark" [size]="14" />
          {{ 'managementReview.ai.summariseAll' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button size="sm" appTourStep="mr-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'managementReview.list.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <label class="sr-only" for="mr-status">{{
          'managementReview.filters.status' | transloco
        }}</label>
        <select
          id="mr-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
        <label class="sr-only" for="mr-sort">{{
          'managementReview.filters.sort' | transloco
        }}</label>
        <select
          id="mr-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'managementReview.filters.reviewSorts.' + s | transloco }}
            </option>
          }
        </select>
        <label
          class="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
        >
          <input
            type="checkbox"
            [checked]="mine()"
            (change)="setMine($any($event.target).checked)"
          />
          {{ 'managementReview.filters.mine' | transloco }}
        </label>
      </ng-container>

      <div class="mb-4 flex flex-col gap-4">
        <app-mr-tabs />
        <app-guide-intro [scope]="scope" page="list" />
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'managementReview.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'managementReview.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (reviews().length === 0) {
              @if (isFiltered()) {
                <p class="py-10 text-center text-[14px] text-fg-muted">
                  {{ 'managementReview.filters.noMatch' | transloco }}
                </p>
              } @else {
                <app-teaching-empty
                  [scope]="scope"
                  page="list"
                  [showAction]="canWrite()"
                  (action)="create()"
                />
              }
            } @else {
              <ul class="divide-y divide-border" data-testid="review-rows">
                @for (r of reviews(); track r.id) {
                  <li class="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/management-review/reviews', r.id]"
                        class="flex min-w-0 items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-subtle">{{ r.code }}</span>
                        <span class="truncate">{{ r.title }}</span>
                      </a>
                      <span
                        class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{
                          r.owner?.name ?? ('managementReview.common.noOwner' | transloco)
                        }}</span>
                        @if (r.period_start || r.period_end) {
                          <span>{{
                            'managementReview.list.period'
                              | transloco
                                : {
                                    from: (r.period_start | localDay) || '…',
                                    to: (r.period_end | localDay) || '…',
                                  }
                          }}</span>
                        }
                        @if (r.meeting_status) {
                          <span>{{
                            'managementReview.list.meeting'
                              | transloco
                                : { status: (meetingStatusKey(r.meeting_status) | transloco) }
                          }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap gap-1">
                      @for (f of r.frameworks; track f) {
                        <app-badge tone="neutral">{{ frameworkKey(f) | transloco }}</app-badge>
                      }
                    </span>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="statusTone(r.status)">{{
                        statusKey(r.status) | transloco
                      }}</app-badge>
                      <span class="min-w-[110px] text-right">
                        @if (r.signed_at) {
                          {{ r.signed_at | localDate }}
                        } @else if (r.scheduled_at) {
                          {{ r.scheduled_at | localDate: 'medium' }}
                        } @else {
                          {{ 'managementReview.common.notScheduled' | transloco }}
                        }
                      </span>
                    </span>
                  </li>
                }
              </ul>
              <div class="border-t border-border px-4 py-2.5">
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
      </app-card>
    </app-record-list-page>

    <div class="mx-auto -mt-6 flex max-w-[1180px] flex-col gap-4 px-4 pb-12 sm:px-8">
      <app-why-it-matters [scope]="scope" page="list" />
      <details class="rounded-card border border-border bg-surface p-4">
        <summary class="cursor-pointer text-[13.5px] font-semibold text-fg">
          {{ 'managementReview.lessons.effectiveReview' | transloco }}
        </summary>
        <div class="mt-3"><app-lesson [scope]="scope" lesson="effective-review" /></div>
      </details>
    </div>
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
  protected readonly statusFilters = REVIEW_STATUS_FILTERS;
  protected readonly frameworks = FRAMEWORKS;
  protected readonly sorts = REVIEW_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = reviewStatusKey;
  protected readonly statusTone = reviewStatusTone;
  protected readonly frameworkKey = frameworkKey;
  protected readonly meetingStatusKey = meetingStatusKey;

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

  protected readonly isFiltered = computed(
    () => !!this.q() || this.status() !== 'open' || !!this.framework() || this.mine(),
  );
  protected readonly savedFilters = computed<Record<string, string>>(() => ({
    status: this.status(),
    framework: this.framework(),
    sort: this.sort(),
    mine: this.mine() ? '1' : '',
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: MR_MODULE,
      entityType: 'management_review',
      view: 'list',
      title: this.language.translate('managementReview.list.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: ReviewListQuery = {
        q: this.q() || undefined,
        status: reviewStatusesFor(this.status()),
        framework: this.framework() || undefined,
        owner: this.mine() ? this.auth.user()?.id : undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
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
}
