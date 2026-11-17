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
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
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
  MR_NAME_KEY,
  MR_NAV,
  MR_PERMISSIONS,
  MR_SCOPE,
  MR_SETTINGS_LINK,
  meetingKindKey,
  meetingStatusKey,
  minutesStatusKey,
  mrCrumbs,
  toneValue,
  utcNaive,
} from './management-review-display';

const PAGE_SIZE = 25;

const SELECT =
  'h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg outline-none focus:border-accent';

/**
 * `/management-review/meetings`: every meeting where decisions are taken — the
 * management review meetings, the safety committee (AMU), project, audit and
 * other meetings — with search, filters (status, type; sorting, upcoming only
 * and review meetings under "Flere filtre"), saved views and paging.
 */
@Component({
  selector: 'app-mr-meetings-list',
  imports: [
    TranslocoPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="managementReview.meetings.title"
      descriptionKey="managementReview.meetings.subtitle"
      [breadcrumbs]="crumbs"
      [settingsLink]="settingsLink"
      [scope]="scope"
      page="meetings"
      searchPlaceholderKey="managementReview.meetings.searchPlaceholder"
      [query]="q()"
      [filters]="savedFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="isEmptyRegister()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (canWrite()) {
        <app-button primary appTourStep="mtg-new" (click)="create()" data-testid="mr-new-meeting">
          <app-icon name="plus" [size]="14" />
          {{ 'managementReview.meetings.new' | transloco }}
        </app-button>
      }
      <app-button secondary variant="ghost" (click)="askStatus()">
        <app-icon name="spark" [size]="14" />
        {{ 'managementReview.ai.summariseMeetings' | transloco }}
      </app-button>

      <app-module-nav nav [labelKey]="nameKey" [items]="nav" />
      <app-help-strip help [scope]="scope" page="meetings" tour="meetings" lesson="good-minutes" />

      <ng-container filters>
        <label class="sr-only" for="mtg-status">{{
          'managementReview.filters.status' | transloco
        }}</label>
        <select
          id="mtg-status"
          [class]="select"
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
        <select id="mtg-kind" [class]="select" (change)="setKind($any($event.target).value)">
          <option value="" [selected]="!kind()">
            {{ 'managementReview.filters.allKinds' | transloco }}
          </option>
          @for (k of kinds; track k) {
            <option [value]="k" [selected]="kind() === k">{{ kindKey(k) | transloco }}</option>
          }
        </select>
      </ng-container>
      <ng-container more-filters>
        <div class="flex flex-col gap-1.5">
          <label for="mtg-sort" class="text-ui font-semibold text-fg-muted">{{
            'managementReview.filters.sort' | transloco
          }}</label>
          <select id="mtg-sort" [class]="select" (change)="setSort($any($event.target).value)">
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="sort() === s">
                {{ 'managementReview.filters.meetingSorts.' + s | transloco }}
              </option>
            }
          </select>
        </div>
        <label class="inline-flex min-h-9 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="upcoming()"
            (change)="setUpcoming($any($event.target).checked)"
          />
          {{ 'managementReview.filters.upcoming' | transloco }}
        </label>
        <label class="inline-flex min-h-9 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="includeReviews()"
            (change)="setIncludeReviews($any($event.target).checked)"
          />
          {{ 'managementReview.filters.includeReviews' | transloco }}
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
            @if (meetings().length === 0) {
              <app-empty-state
                titleKey="ui.empty.noResults"
                bodyKey="ui.empty.noResultsBody"
                ctaKey="ui.empty.clearFilters"
                ctaVariant="secondary"
                [compact]="true"
                (cta)="clearFilters()"
              />
            } @else {
              <div role="list" data-testid="meeting-rows">
                <app-record-row-header dateKind="date" [coverage]="false" />
                @for (m of meetings(); track m.id) {
                  <app-record-row
                    [code]="m.code"
                    [title]="m.title"
                    [subtitle]="subtitle(m)"
                    [link]="['/management-review/meetings', m.id]"
                    [owner]="m.chair?.name ?? null"
                    [date]="m.scheduled_at"
                    dateKind="date"
                  >
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      [value]="tone(m.status)"
                      [labelKey]="statusKey(m.status)"
                    />
                    @if (m.status === 'completed') {
                      <app-status-badge
                        badges
                        meaning="lifecycle"
                        [value]="m.minutes_status === 'approved' ? 'approved' : 'draft'"
                        [labelKey]="minutesKey(m.minutes_status)"
                      />
                    }
                  </app-record-row>
                }
              </div>
              @if (total() > pageSize) {
                <div class="px-4 py-2.5">
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
        }
      </app-card>

      <app-teaching-empty
        empty
        [scope]="scope"
        page="meetings"
        [showAction]="canWrite()"
        (action)="create()"
      />

      <app-why-it-matters below [scope]="scope" page="meetings" />
    </app-record-list-page>
  `,
})
export class MeetingsList {
  private readonly api = inject(ManagementReviewApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly scope = MR_SCOPE;
  protected readonly nameKey = MR_NAME_KEY;
  protected readonly nav = MR_NAV;
  protected readonly settingsLink = MR_SETTINGS_LINK;
  protected readonly crumbs = mrCrumbs({ labelKey: 'managementReview.nav.meetings' });
  protected readonly select = SELECT;
  protected readonly statuses = MEETING_STATUSES;
  protected readonly kinds = MEETING_KINDS;
  protected readonly sorts = MEETING_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = meetingStatusKey;
  protected readonly tone = toneValue;
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
  protected readonly isEmptyRegister = computed(
    () => this.state() === 'ready' && this.meetings().length === 0 && !this.isFiltered(),
  );
  protected readonly moreActive = computed(
    () =>
      (this.sort() !== '-scheduled_at' ? 1 : 0) +
      (this.upcoming() ? 1 : 0) +
      (this.includeReviews() ? 0 : 1),
  );
  protected readonly savedFilters = computed<Record<string, string>>(() => ({
    status: this.status(),
    kind: this.kind(),
    sort: this.sort(),
    upcoming: this.upcoming() ? '1' : '',
    reviews: this.includeReviews() ? '1' : '0',
  }));

  private readonly query = computed<MeetingListQuery>(() => {
    const status = this.status();
    const kind = this.kind();
    return {
      q: this.q() || undefined,
      status: status ? [status] : undefined,
      kind: kind ? [kind] : undefined,
      from: this.upcoming() ? utcNaive() : undefined,
      include_reviews: this.includeReviews(),
      sort: this.upcoming() && this.sort() === '-scheduled_at' ? 'scheduled_at' : this.sort(),
      limit: PAGE_SIZE,
      offset: this.offset(),
    };
  });

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
      const query = this.query();
      untracked(() => this.load(orgId, query));
    });
  }

  /** "Ledelsens gjennomgang · Hovedkontoret · 5 deltakere · 2 beslutninger". */
  protected subtitle(m: MeetingSummary): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [t(meetingKindKey(m.kind))];
    if (m.location) {
      parts.push(m.location);
    }
    parts.push(
      t('managementReview.meetings.counts', {
        attendees: m.attendee_count,
        decisions: m.decision_count,
      }),
    );
    return parts.join(' · ');
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

  protected clearFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.status.set('');
    this.kind.set('');
    this.upcoming.set(false);
    this.includeReviews.set(true);
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

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.query());
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
