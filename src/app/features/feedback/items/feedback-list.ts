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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, map } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
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
import { FeedbackApi } from '../data/feedback-api';
import {
  feedbackChannelKey,
  feedbackKindKey,
  feedbackKindTone,
  feedbackStatusKey,
  feedbackStatusTone,
  sortKey,
} from '../data/feedback-display';
import {
  FEEDBACK_CHANNELS,
  FEEDBACK_ENTITY,
  FEEDBACK_KINDS,
  FEEDBACK_SORTS,
  FEEDBACK_STATUSES,
  FeedbackChannel,
  FeedbackKind,
  FeedbackListItem,
  FeedbackListQuery,
  FeedbackSort,
  FeedbackStatus,
  PERM_WRITE,
} from '../data/feedback.models';
import { FeedbackTabs } from '../feedback-tabs';
import { FeedbackLessonLink } from '../lesson-link';

const PAGE_SIZE = 25;

/** Status filter options: `open` = new, acknowledged or in progress. */
export const STATUS_FILTERS = ['all', 'open', ...FEEDBACK_STATUSES] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** The query for a status filter: `open` uses the server's `open` flag. */
export function statusQuery(filter: string): Pick<FeedbackListQuery, 'status' | 'open'> {
  if (filter === 'open') {
    return { open: true };
  }
  return (FEEDBACK_STATUSES as readonly string[]).includes(filter)
    ? { status: [filter as FeedbackStatus] }
    : {};
}

/**
 * The feedback register (`/feedback`): complaints, compliments, suggestions and
 * questions from customers, with search, filters, sorting, saved views and
 * paging. Overdue responses are highlighted.
 */
@Component({
  selector: 'app-feedback-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    GuideIntro,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    FeedbackTabs,
    FeedbackLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="feedback.list.title"
      scope="feedback"
      searchPlaceholderKey="feedback.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-2">
        <p class="text-[14px] text-fg-muted">{{ 'feedback.list.subtitle' | transloco }}</p>
        <app-feedback-tabs />
        <app-guide-intro scope="feedback" page="list" />
      </div>

      <app-tour-button toolbar scope="feedback" tour="list" />
      @if (canWrite()) {
        <app-button
          toolbar
          size="sm"
          (click)="newFeedback()"
          appTourStep="feedback-new"
          data-testid="new-feedback"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'feedback.list.new' | transloco }}
        </app-button>
      }

      <label filters class="sr-only" for="cf-fb-status">
        {{ 'feedback.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-fb-status"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setStatus($any($event.target).value)"
        appTourStep="feedback-filters"
        data-testid="filter-status"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ statusFilterKey(s) | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-fb-kind">
        {{ 'feedback.filters.kind' | transloco }}
      </label>
      <select
        filters
        id="cf-fb-kind"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setKind($any($event.target).value)"
        data-testid="filter-kind"
      >
        <option value="" [selected]="!kind()">{{ 'feedback.filters.allKinds' | transloco }}</option>
        @for (k of kinds; track k) {
          <option [value]="k" [selected]="kind() === k">{{ kindKey(k) | transloco }}</option>
        }
      </select>
      <label filters class="sr-only" for="cf-fb-channel">
        {{ 'feedback.filters.channel' | transloco }}
      </label>
      <select
        filters
        id="cf-fb-channel"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setChannel($any($event.target).value)"
      >
        <option value="" [selected]="!channel()">
          {{ 'feedback.filters.allChannels' | transloco }}
        </option>
        @for (c of channels; track c) {
          <option [value]="c" [selected]="channel() === c">{{ channelKey(c) | transloco }}</option>
        }
      </select>
      <label filters class="sr-only" for="cf-fb-owner">
        {{ 'feedback.filters.owner' | transloco }}
      </label>
      <select
        filters
        id="cf-fb-owner"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setOwner($any($event.target).value)"
      >
        <option value="" [selected]="!owner()">
          {{ 'feedback.filters.anyOwner' | transloco }}
        </option>
        <option value="me" [selected]="owner() === 'me'">
          {{ 'feedback.filters.mine' | transloco }}
        </option>
      </select>
      <label filters class="sr-only" for="cf-fb-sort">
        {{ 'feedback.filters.sort' | transloco }}
      </label>
      <select
        filters
        id="cf-fb-sort"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setSort($any($event.target).value)"
      >
        @for (s of sorts; track s) {
          <option [value]="s" [selected]="sort() === s">
            {{ 'feedback.sorts.' + sortKey(s) | transloco }}
          </option>
        }
      </select>
      <label
        filters
        class="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
      >
        <input
          type="checkbox"
          class="h-4 w-4 accent-[var(--accent)]"
          [checked]="overdue()"
          (change)="setOverdue($any($event.target).checked)"
          data-testid="filter-overdue"
        />
        {{ 'feedback.filters.overdue' | transloco }}
      </label>

      @if (surveyId()) {
        <p
          class="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted"
          data-testid="survey-filter"
        >
          {{ 'feedback.list.surveyFilter' | transloco }}
          <button
            type="button"
            class="font-semibold text-accent hover:underline"
            (click)="clearSurvey()"
          >
            {{ 'feedback.list.clearSurveyFilter' | transloco }}
          </button>
        </p>
      }

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
              {{ 'feedback.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'feedback.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-match">
                {{ 'feedback.list.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="feedback-rows">
                @for (f of rows(); track f.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/feedback/items', f.id]"
                        class="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                          f.code
                        }}</span>
                        <span class="truncate">{{ f.title }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{ channelKey(f.channel) | transloco }}</span>
                        @if (f.customer_name || f.customer_organisation) {
                          <span class="truncate">{{
                            customerLabel(f.customer_name, f.customer_organisation)
                          }}</span>
                        }
                        <span>{{
                          'feedback.list.received' | transloco: { date: (f.received_on | localDay) }
                        }}</span>
                        @if (f.satisfaction_score) {
                          <span>{{
                            'feedback.list.score' | transloco: { score: f.satisfaction_score }
                          }}</span>
                        }
                        @if (f.owner?.name; as ownerName) {
                          <span>{{ 'feedback.list.owner' | transloco: { name: ownerName } }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="kindTone(f.kind)">{{
                        kindKey(f.kind) | transloco
                      }}</app-badge>
                      <app-badge [tone]="statusTone(f.status)">{{
                        statusKey(f.status) | transloco
                      }}</app-badge>
                      <span
                        class="inline-flex min-w-[130px] items-center justify-end gap-1 text-right"
                        [class.text-fail]="f.overdue"
                        [class.font-semibold]="f.overdue"
                      >
                        @if (f.response_due_on) {
                          @if (f.overdue) {
                            <app-icon name="alert" [size]="13" />
                            <span class="sr-only">{{ 'feedback.common.overdue' | transloco }}</span>
                          }
                          {{
                            'feedback.list.due'
                              | transloco: { date: (f.response_due_on | localDay) }
                          }}
                        } @else {
                          {{ 'feedback.list.noDue' | transloco }}
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
                  [count]="rows().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="feedback" page="list" />
        <div class="flex flex-wrap gap-2">
          <app-feedback-lesson-link lesson="handling-complaints" />
          <app-feedback-lesson-link lesson="measuring-satisfaction" />
        </div>
      </div>

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="feedback"
            page="list"
            [showAction]="canWrite()"
            (action)="newFeedback()"
          />
        </app-card>
        <app-why-it-matters scope="feedback" page="list" />
        <div class="flex flex-wrap gap-2">
          <app-feedback-lesson-link lesson="handling-complaints" />
          <app-feedback-lesson-link lesson="measuring-satisfaction" />
        </div>
      </div>
    </app-record-list-page>
  `,
})
export class FeedbackList {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** `?survey=<id>`: only the follow-ups raised from one survey. */
  protected readonly surveyId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('survey') || '')),
    { initialValue: '' },
  );

  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly kinds = FEEDBACK_KINDS;
  protected readonly channels = FEEDBACK_CHANNELS;
  protected readonly sorts = FEEDBACK_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = feedbackStatusKey;
  protected readonly statusTone = feedbackStatusTone;
  protected readonly kindKey = feedbackKindKey;
  protected readonly kindTone = feedbackKindTone;
  protected readonly channelKey = feedbackChannelKey;
  protected readonly sortKey = sortKey;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  protected readonly q = signal('');
  protected readonly status = signal<string>('all');
  protected readonly kind = signal<FeedbackKind | ''>('');
  protected readonly channel = signal<FeedbackChannel | ''>('');
  protected readonly owner = signal<'' | 'me'>('');
  protected readonly overdue = signal(false);
  protected readonly sort = signal<FeedbackSort>('-received_on');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly FeedbackListItem[]>([]);
  protected readonly total = signal(0);

  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      !!this.surveyId() ||
      this.status() !== 'all' ||
      !!this.kind() ||
      !!this.channel() ||
      !!this.owner() ||
      this.overdue(),
  );
  /** The teaching empty state: the register itself is empty (not just this filter). */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    kind: this.kind(),
    channel: this.channel(),
    owner: this.owner(),
    overdue: this.overdue() ? '1' : '',
    sort: this.sort(),
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'feedback',
      entityType: FEEDBACK_ENTITY,
      view: 'list',
      title: this.language.translate('feedback.list.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: FeedbackListQuery = {
        q: this.q() || undefined,
        ...statusQuery(this.status()),
        kind: this.kind() ? [this.kind() as FeedbackKind] : undefined,
        channel: this.channel() ? [this.channel() as FeedbackChannel] : undefined,
        owner: this.owner() || undefined,
        overdue: this.overdue() ? true : undefined,
        survey_id: this.surveyId() || undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected statusFilterKey(filter: string): string {
    return filter === 'open' || filter === 'all'
      ? `feedback.filters.statusOptions.${filter}`
      : feedbackStatusKey(filter);
  }

  protected customerLabel(name: string | null, organisation: string | null): string {
    return [name, organisation].filter(Boolean).join(' · ');
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set((STATUS_FILTERS as readonly string[]).includes(value) ? value : 'all');
  }

  protected setKind(value: string): void {
    this.offset.set(0);
    this.kind.set(
      (FEEDBACK_KINDS as readonly string[]).includes(value) ? (value as FeedbackKind) : '',
    );
  }

  protected setChannel(value: string): void {
    this.offset.set(0);
    this.channel.set(
      (FEEDBACK_CHANNELS as readonly string[]).includes(value) ? (value as FeedbackChannel) : '',
    );
  }

  protected setOwner(value: string): void {
    this.offset.set(0);
    this.owner.set(value === 'me' ? 'me' : '');
  }

  protected setOverdue(value: boolean): void {
    this.offset.set(0);
    this.overdue.set(value);
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(
      (FEEDBACK_SORTS as readonly string[]).includes(value)
        ? (value as FeedbackSort)
        : '-received_on',
    );
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.setStatus(f['status'] ?? 'all');
    this.setKind(f['kind'] ?? '');
    this.setChannel(f['channel'] ?? '');
    this.setOwner(f['owner'] ?? '');
    this.setOverdue(f['overdue'] === '1');
    this.setSort(f['sort'] ?? '-received_on');
  }

  protected clearSurvey(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { survey: null } });
  }

  protected newFeedback(): void {
    void this.router.navigate(['/feedback/items/new']);
  }

  private load(orgId: string | null, query: FeedbackListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.list(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
