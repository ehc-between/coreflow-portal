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
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { Pager } from '../../shared/ui/pager/pager';
import { MrTabs } from './components/mr-tabs';
import { ManagementReviewApi } from './data/management-review-api';
import {
  MEETING_KINDS,
  MEETING_SORTS,
  MEETING_STATUSES,
  MeetingKind,
  MeetingListQuery,
  MeetingSort,
  MeetingStatus,
  MeetingSummary,
} from './data/management-review.models';
import {
  MR_MODULE,
  MR_PERMISSIONS,
  MR_SCOPE,
  meetingKindKey,
  meetingStatusKey,
  meetingStatusTone,
  minutesStatusKey,
  utcNaive,
} from './management-review-display';

const PAGE_SIZE = 25;

/**
 * `/management-review/meetings`: every meeting with minutes (committees, project
 * and safety meetings, and the meetings of management reviews) with search,
 * filters (status, kind, upcoming), sorting, saved views and paging.
 */
@Component({
  selector: 'app-mr-meetings-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
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
      titleKey="managementReview.meetings.title"
      [scope]="scope"
      page="meetings"
      searchPlaceholderKey="managementReview.meetings.searchPlaceholder"
      [query]="q()"
      [filters]="savedFilters()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1.5">
        <p class="text-[14px] text-fg-muted">
          {{ 'managementReview.meetings.subtitle' | transloco }}
        </p>
      </div>

      <ng-container toolbar>
        <app-tour-button [scope]="scope" tour="meetings" />
        <app-button variant="ghost" size="sm" (click)="askStatus()">
          <app-icon name="spark" [size]="14" />
          {{ 'managementReview.ai.summariseMeetings' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button size="sm" appTourStep="mtg-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'managementReview.meetings.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <label class="sr-only" for="mtg-status">{{
          'managementReview.filters.status' | transloco
        }}</label>
        <select
          id="mtg-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          appTourStep="mtg-filters"
          (change)="setStatus($any($event.target).value)"
        >
          <option value="" [selected]="!status()">
            {{ 'managementReview.filters.allStatuses' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="status() === s">{{ statusKey(s) | transloco }}</option>
          }
        </select>
        <label class="sr-only" for="mtg-kind">{{
          'managementReview.filters.kind' | transloco
        }}</label>
        <select
          id="mtg-kind"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setKind($any($event.target).value)"
        >
          <option value="" [selected]="!kind()">
            {{ 'managementReview.filters.allKinds' | transloco }}
          </option>
          @for (k of kinds; track k) {
            <option [value]="k" [selected]="kind() === k">{{ kindKey(k) | transloco }}</option>
          }
        </select>
        <label class="sr-only" for="mtg-sort">{{
          'managementReview.filters.sort' | transloco
        }}</label>
        <select
          id="mtg-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'managementReview.filters.meetingSorts.' + s | transloco }}
            </option>
          }
        </select>
        <label
          class="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
        >
          <input
            type="checkbox"
            [checked]="upcoming()"
            (change)="setUpcoming($any($event.target).checked)"
          />
          {{ 'managementReview.filters.upcoming' | transloco }}
        </label>
        <label
          class="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
        >
          <input
            type="checkbox"
            [checked]="includeReviews()"
            (change)="setIncludeReviews($any($event.target).checked)"
          />
          {{ 'managementReview.filters.includeReviews' | transloco }}
        </label>
      </ng-container>

      <div class="mb-4 flex flex-col gap-4">
        <app-mr-tabs />
        <app-guide-intro [scope]="scope" page="meetings" />
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
            @if (meetings().length === 0) {
              @if (isFiltered()) {
                <p class="py-10 text-center text-[14px] text-fg-muted">
                  {{ 'managementReview.filters.noMatch' | transloco }}
                </p>
              } @else {
                <app-teaching-empty
                  [scope]="scope"
                  page="meetings"
                  [showAction]="canWrite()"
                  (action)="create()"
                />
              }
            } @else {
              <ul class="divide-y divide-border" data-testid="meeting-rows">
                @for (m of meetings(); track m.id) {
                  <li class="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/management-review/meetings', m.id]"
                        class="flex min-w-0 items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-subtle">{{ m.code }}</span>
                        <span class="truncate">{{ m.title }}</span>
                      </a>
                      <span
                        class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{ kindKey(m.kind) | transloco }}</span>
                        @if (m.chair) {
                          <span>{{
                            'managementReview.meetings.chairedBy'
                              | transloco: { name: m.chair.name }
                          }}</span>
                        }
                        @if (m.location) {
                          <span>{{ m.location }}</span>
                        }
                        <span>{{
                          'managementReview.meetings.counts'
                            | transloco
                              : { attendees: m.attendee_count, decisions: m.decision_count }
                        }}</span>
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="statusTone(m.status)">{{
                        statusKey(m.status) | transloco
                      }}</app-badge>
                      <app-badge [tone]="m.minutes_status === 'approved' ? 'pass' : 'neutral'">{{
                        minutesKey(m.minutes_status) | transloco
                      }}</app-badge>
                      <span class="min-w-[140px] text-right">
                        @if (m.scheduled_at) {
                          {{ m.scheduled_at | localDate: 'medium' }}
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
                  [count]="meetings().length"
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
      <app-why-it-matters [scope]="scope" page="meetings" />
      <details class="rounded-card border border-border bg-surface p-4">
        <summary class="cursor-pointer text-[13.5px] font-semibold text-fg">
          {{ 'managementReview.lessons.goodMinutes' | transloco }}
        </summary>
        <div class="mt-3"><app-lesson [scope]="scope" lesson="good-minutes" /></div>
      </details>
    </div>
  `,
})
export class MeetingsList {
  private readonly api = inject(ManagementReviewApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly scope = MR_SCOPE;
  protected readonly statuses = MEETING_STATUSES;
  protected readonly kinds = MEETING_KINDS;
  protected readonly sorts = MEETING_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = meetingStatusKey;
  protected readonly statusTone = meetingStatusTone;
  protected readonly minutesKey = minutesStatusKey;
  protected readonly kindKey = meetingKindKey;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(MR_PERMISSIONS.write),
  );

  protected readonly q = signal('');
  protected readonly status = signal<MeetingStatus | ''>('');
  protected readonly kind = signal<MeetingKind | ''>('');
  protected readonly sort = signal<MeetingSort>('-scheduled_at');
  protected readonly upcoming = signal(false);
  protected readonly includeReviews = signal(true);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly meetings = signal<readonly MeetingSummary[]>([]);
  protected readonly total = signal(0);

  protected readonly isFiltered = computed(
    () =>
      !!this.q() || !!this.status() || !!this.kind() || this.upcoming() || !this.includeReviews(),
  );
  protected readonly savedFilters = computed<Record<string, string>>(() => ({
    status: this.status(),
    kind: this.kind(),
    sort: this.sort(),
    upcoming: this.upcoming() ? '1' : '',
    reviews: this.includeReviews() ? '1' : '0',
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: MR_MODULE,
      entityType: 'meeting',
      view: 'list',
      title: this.language.translate('managementReview.meetings.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const status = this.status();
      const kind = this.kind();
      const query: MeetingListQuery = {
        q: this.q() || undefined,
        status: status ? [status] : undefined,
        kind: kind ? [kind] : undefined,
        from: this.upcoming() ? utcNaive() : undefined,
        include_reviews: this.includeReviews(),
        sort: this.upcoming() && this.sort() === '-scheduled_at' ? 'scheduled_at' : this.sort(),
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

  protected setStatus(value: MeetingStatus | ''): void {
    this.offset.set(0);
    this.status.set(value);
  }

  protected setKind(value: MeetingKind | ''): void {
    this.offset.set(0);
    this.kind.set(value);
  }

  protected setSort(value: MeetingSort): void {
    this.offset.set(0);
    this.sort.set(value);
  }

  protected setUpcoming(value: boolean): void {
    this.offset.set(0);
    this.upcoming.set(value);
  }

  protected setIncludeReviews(value: boolean): void {
    this.offset.set(0);
    this.includeReviews.set(value);
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.status.set(
      MEETING_STATUSES.includes(f['status'] as MeetingStatus) ? (f['status'] as MeetingStatus) : '',
    );
    this.kind.set(
      MEETING_KINDS.includes(f['kind'] as MeetingKind) ? (f['kind'] as MeetingKind) : '',
    );
    this.sort.set(
      MEETING_SORTS.includes(f['sort'] as MeetingSort)
        ? (f['sort'] as MeetingSort)
        : '-scheduled_at',
    );
    this.upcoming.set(f['upcoming'] === '1');
    this.includeReviews.set(f['reviews'] !== '0');
  }

  protected create(): void {
    void this.router.navigate(['/management-review/meetings/new']);
  }

  protected askStatus(): void {
    this.ask.showWith(this.language.translate('managementReview.ai.prompts.summariseMeetings'));
  }

  private load(orgId: string | null, query: MeetingListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listMeetings(orgId, query).subscribe({
      next: (page) => {
        this.meetings.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
