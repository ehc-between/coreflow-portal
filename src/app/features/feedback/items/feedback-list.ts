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
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { FeedbackApi } from '../data/feedback-api';
import {
  exportFileName,
  feedbackChannelKey,
  feedbackKindKey,
  feedbackSeverityKey,
  feedbackStatusKey,
  round1,
  saveBlob,
  sortKey,
} from '../data/feedback-display';
import { feedbackErrorKey } from '../data/feedback-errors';
import {
  ExportFormat,
  FEEDBACK_CHANNELS,
  FEEDBACK_ENTITY,
  FEEDBACK_KINDS,
  FEEDBACK_SEVERITIES,
  FEEDBACK_SORTS,
  FEEDBACK_STATUSES,
  FeedbackChannel,
  FeedbackKind,
  FeedbackListItem,
  FeedbackListQuery,
  FeedbackSeverity,
  FeedbackSort,
  FeedbackStats,
  FeedbackStatus,
  PERM_WRITE,
} from '../data/feedback.models';
import { FeedbackExportMenu } from '../export-menu';
import { FEEDBACK_NAV, FEEDBACK_SETTINGS_LINK } from '../feedback-nav';
import { FulfilsRequirements } from '../../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;
const DEFAULT_SORT: FeedbackSort = '-received_on';

/** Status filter options: `open` = new, acknowledged or in progress. */
export const STATUS_FILTERS = ['all', 'open', ...FEEDBACK_STATUSES] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** "Was the complaint justified?" filter: any, yes, no. */
export const JUSTIFIED_FILTERS = ['', 'yes', 'no'] as const;
export type JustifiedFilter = (typeof JUSTIFIED_FILTERS)[number];

/** The summary tiles above the list; each one is a shortcut to a filter. */
export const LIST_KPIS = ['openComplaints', 'overdue', 'new', 'satisfaction'] as const;
export type ListKpi = (typeof LIST_KPIS)[number];

/** The query for a status filter: `open` uses the server's `open` flag. */
export function statusQuery(filter: string): Pick<FeedbackListQuery, 'status' | 'open'> {
  if (filter === 'open') {
    return { open: true };
  }
  return (FEEDBACK_STATUSES as readonly string[]).includes(filter)
    ? { status: [filter as FeedbackStatus] }
    : {};
}

function oneOf<T extends string>(values: readonly T[], value: string | null, fallback: T): T {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** The filters a link can open the register with (`/feedback?kind=complaint&status=new`). */
export interface ListFiltersFromUrl {
  readonly status: StatusFilter;
  readonly kind: FeedbackKind | '';
  readonly channel: FeedbackChannel | '';
  readonly severity: FeedbackSeverity | '';
  readonly owner: '' | 'me';
  readonly overdue: boolean;
  readonly category: string;
  readonly justified: JustifiedFilter;
  readonly department: string;
}

export function filtersFromParams(params: ParamMap): ListFiltersFromUrl {
  const open = params.get('open') === 'true' || params.get('open') === '1';
  return {
    status: open ? 'open' : oneOf<StatusFilter>(STATUS_FILTERS, params.get('status'), 'all'),
    kind: oneOf<FeedbackKind | ''>(FEEDBACK_KINDS, params.get('kind'), ''),
    channel: oneOf<FeedbackChannel | ''>(FEEDBACK_CHANNELS, params.get('channel'), ''),
    severity: oneOf<FeedbackSeverity | ''>(FEEDBACK_SEVERITIES, params.get('severity'), ''),
    owner: params.get('owner') === 'me' ? 'me' : '',
    overdue: params.get('overdue') === 'true' || params.get('overdue') === '1',
    category: (params.get('category') ?? '').slice(0, 64),
    justified:
      params.get('justified') === 'true'
        ? 'yes'
        : params.get('justified') === 'false'
          ? 'no'
          : oneOf<JustifiedFilter>(JUSTIFIED_FILTERS, params.get('justified'), ''),
    department: /^[0-9a-f-]{36}$/i.test(params.get('department') ?? '')
      ? (params.get('department') as string)
      : '',
  };
}

const SELECT =
  'h-10 max-w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none';

/**
 * The feedback register (`/feedback`): complaints, compliments, suggestions and
 * questions from customers. Summary tiles are shortcuts to the most useful filters;
 * search, three filters and "Flere filtre", saved views, paging and an export of
 * the log (with the same filters) for audits. Links can open it pre-filtered
 * (`?kind=complaint&status=new`, `?survey=<id>`, `?overdue=1`, …).
 */
@Component({
  selector: 'app-feedback-list',
  imports: [
    FulfilsRequirements,
    TranslocoPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    ModuleNav,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    FeedbackExportMenu,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="modules.names.feedback"
      descriptionKey="feedback.list.subtitle"
      [breadcrumbs]="[{ labelKey: 'modules.names.feedback' }]"
      [settingsLink]="settingsLink"
      scope="feedback"
      searchPlaceholderKey="feedback.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="feedback.items" />
      @if (canWrite()) {
        <app-button
          primary
          (click)="newFeedback()"
          appTourStep="feedback-new"
          data-testid="new-feedback"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'feedback.list.new' | transloco }}
        </app-button>
      }
      <app-feedback-export-menu secondary [busy]="exporting()" (chosen)="export($event)" />

      <app-module-nav nav labelKey="modules.names.feedback" [items]="nav" />
      <app-help-strip help scope="feedback" page="list" tour="list" lesson="handling-complaints" />

      <div kpis class="contents">
        @for (k of kpis(); track k.key) {
          <button
            type="button"
            class="block w-full rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [class.ring-2]="k.active"
            [class.ring-accent]="k.active"
            [attr.aria-pressed]="k.key === 'satisfaction' ? null : k.active"
            [attr.data-testid]="'kpi-' + k.key"
            (click)="focusKpi(k.key)"
          >
            <app-kpi-tile
              [label]="'feedback.kpis.' + k.key | transloco"
              [value]="k.value"
              [tone]="k.tone"
              [delta]="'feedback.kpis.' + k.key + 'Hint' | transloco: { count: k.hint }"
              deltaTone="neutral"
            />
          </button>
        }
      </div>

      <label filters class="sr-only" for="cf-fb-status">
        {{ 'feedback.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-fb-status"
        [class]="select"
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
        [class]="select"
        (change)="setKind($any($event.target).value)"
        data-testid="filter-kind"
      >
        <option value="" [selected]="!kind()">{{ 'feedback.filters.allKinds' | transloco }}</option>
        @for (k of kinds; track k) {
          <option [value]="k" [selected]="kind() === k">{{ kindKey(k) | transloco }}</option>
        }
      </select>
      <label filters class="sr-only" for="cf-fb-owner">
        {{ 'feedback.filters.owner' | transloco }}
      </label>
      <select
        filters
        id="cf-fb-owner"
        [class]="select + ' hidden sm:block'"
        (change)="setOwner($any($event.target).value)"
        data-testid="filter-owner"
      >
        <option value="" [selected]="!owner()">
          {{ 'feedback.filters.anyOwner' | transloco }}
        </option>
        <option value="me" [selected]="owner() === 'me'">
          {{ 'feedback.filters.mine' | transloco }}
        </option>
      </select>

      <div more-filters class="flex flex-col gap-3">
        <div class="flex flex-col gap-1 sm:hidden">
          <label for="cf-fb-owner-m" class="text-meta font-semibold text-fg-muted">{{
            'feedback.filters.owner' | transloco
          }}</label>
          <select
            id="cf-fb-owner-m"
            [class]="select"
            (change)="setOwner($any($event.target).value)"
          >
            <option value="" [selected]="!owner()">
              {{ 'feedback.filters.anyOwner' | transloco }}
            </option>
            <option value="me" [selected]="owner() === 'me'">
              {{ 'feedback.filters.mine' | transloco }}
            </option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="cf-fb-channel" class="text-meta font-semibold text-fg-muted">{{
            'feedback.filters.channel' | transloco
          }}</label>
          <select
            id="cf-fb-channel"
            [class]="select"
            (change)="setChannel($any($event.target).value)"
          >
            <option value="" [selected]="!channel()">
              {{ 'feedback.filters.allChannels' | transloco }}
            </option>
            @for (c of channels; track c) {
              <option [value]="c" [selected]="channel() === c">
                {{ channelKey(c) | transloco }}
              </option>
            }
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="cf-fb-severity" class="text-meta font-semibold text-fg-muted">{{
            'feedback.filters.severity' | transloco
          }}</label>
          <select
            id="cf-fb-severity"
            [class]="select"
            (change)="setSeverity($any($event.target).value)"
            data-testid="filter-severity"
          >
            <option value="" [selected]="!severity()">
              {{ 'feedback.filters.anySeverity' | transloco }}
            </option>
            @for (s of severities; track s) {
              <option [value]="s" [selected]="severity() === s">
                {{ severityKey(s) | transloco }}
              </option>
            }
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="cf-fb-justified" class="text-meta font-semibold text-fg-muted">{{
            'feedback.filters.justified' | transloco
          }}</label>
          <select
            id="cf-fb-justified"
            [class]="select"
            (change)="setJustified($any($event.target).value)"
            data-testid="filter-justified"
          >
            @for (j of justifiedFilters; track j) {
              <option [value]="j" [selected]="justified() === j">
                {{ 'feedback.filters.justifiedOptions.' + (j || 'any') | transloco }}
              </option>
            }
          </select>
        </div>
        @if (departments().length) {
          <div class="flex flex-col gap-1">
            <label for="cf-fb-dept" class="text-meta font-semibold text-fg-muted">{{
              'feedback.filters.department' | transloco
            }}</label>
            <select
              id="cf-fb-dept"
              [class]="select"
              (change)="setDepartment($any($event.target).value)"
              data-testid="filter-department"
            >
              <option value="" [selected]="!department()">
                {{ 'feedback.filters.anyDepartment' | transloco }}
              </option>
              @for (d of departments(); track d.id) {
                <option [value]="d.id" [selected]="department() === d.id">{{ d.label }}</option>
              }
            </select>
          </div>
        }
        <div class="flex flex-col gap-1">
          <label for="cf-fb-category" class="text-meta font-semibold text-fg-muted">{{
            'feedback.filters.category' | transloco
          }}</label>
          <input
            id="cf-fb-category"
            type="text"
            list="cf-fb-category-list"
            maxlength="64"
            [class]="select + ' px-3'"
            [value]="category()"
            (change)="setCategory($any($event.target).value)"
            [placeholder]="'feedback.filters.anyCategory' | transloco"
            data-testid="filter-category"
          />
          <datalist id="cf-fb-category-list">
            @for (c of categories(); track c) {
              <option [value]="c"></option>
            }
          </datalist>
        </div>
        <div class="flex flex-col gap-1">
          <label for="cf-fb-sort" class="text-meta font-semibold text-fg-muted">{{
            'feedback.filters.sort' | transloco
          }}</label>
          <select id="cf-fb-sort" [class]="select" (change)="setSort($any($event.target).value)">
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="sort() === s">
                {{ 'feedback.sorts.' + sortKey(s) | transloco }}
              </option>
            }
          </select>
        </div>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="overdue()"
            (change)="setOverdue($any($event.target).checked)"
            data-testid="filter-overdue"
          />
          {{ 'feedback.filters.overdue' | transloco }}
        </label>
      </div>

      @if (surveyId()) {
        <p
          class="mb-3 flex flex-wrap items-center gap-2 text-meta text-fg-muted"
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

      @if (state() === 'ready' && total() > 0) {
        <p class="mb-2 text-meta text-fg-muted" data-testid="count-line" aria-live="polite">
          {{ 'feedback.list.countOf' | transloco: { shown: rows().length, total: total() } }}
          @if (isFiltered()) {
            ·
            <button
              type="button"
              class="font-semibold text-accent hover:underline"
              (click)="resetFilters()"
              data-testid="reset-filters-inline"
            >
              {{ 'feedback.list.resetFilters' | transloco }}
            </button>
          }
        </p>
      }

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="5" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (rows().length === 0) {
              <app-empty-state
                icon="search"
                titleKey="feedback.list.noMatch"
                bodyKey="feedback.list.noMatchBody"
                ctaKey="feedback.list.resetFilters"
                ctaVariant="secondary"
                (cta)="resetFilters()"
                data-testid="no-match"
              />
            } @else {
              <div role="list" data-testid="feedback-rows">
                <app-record-row-header dateKind="due" />
                @for (f of rows(); track f.id) {
                  <app-record-row
                    [code]="f.code"
                    [title]="f.title"
                    [subtitle]="subtitle(f)"
                    [link]="['/feedback/items', f.id]"
                    [owner]="f.owner?.name"
                    [date]="f.response_due_on"
                    dateKind="due"
                    [overdue]="f.overdue"
                  >
                    <span coverage class="block max-w-full min-w-0 overflow-hidden">
                      <app-coverage-chip [entityType]="entityType" [entityId]="f.id" />
                    </span>
                    <span badges class="contents">
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="f.status"
                        [labelKey]="statusKey(f.status)"
                      />
                      <app-badge tone="neutral">{{ kindKey(f.kind) | transloco }}</app-badge>
                      @if (f.severity === 'high' || f.severity === 'critical') {
                        <app-status-badge
                          meaning="severity"
                          [value]="f.severity"
                          [labelKey]="severityKey(f.severity)"
                        />
                      }
                    </span>
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

      <app-why-it-matters below scope="feedback" page="list" />

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
      </div>
    </app-record-list-page>
  `,
})
export class FeedbackList {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly assignees = inject(AssigneeOptionsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly entityType = FEEDBACK_ENTITY;
  protected readonly nav = FEEDBACK_NAV;
  protected readonly settingsLink = FEEDBACK_SETTINGS_LINK;
  protected readonly select = SELECT;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly justifiedFilters = JUSTIFIED_FILTERS;
  protected readonly kinds = FEEDBACK_KINDS;
  protected readonly channels = FEEDBACK_CHANNELS;
  protected readonly severities = FEEDBACK_SEVERITIES;
  protected readonly sorts = FEEDBACK_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = feedbackStatusKey;
  protected readonly kindKey = feedbackKindKey;
  protected readonly channelKey = feedbackChannelKey;
  protected readonly severityKey = feedbackSeverityKey;
  protected readonly sortKey = sortKey;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  private readonly initial = filtersFromParams(this.route.snapshot.queryParamMap);
  /** `?survey=<id>`: only the follow-ups raised from one survey. */
  protected readonly surveyId = signal(this.route.snapshot.queryParamMap.get('survey') || '');

  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly status = signal<string>(this.initial.status);
  protected readonly kind = signal<FeedbackKind | ''>(this.initial.kind);
  protected readonly channel = signal<FeedbackChannel | ''>(this.initial.channel);
  protected readonly severity = signal<FeedbackSeverity | ''>(this.initial.severity);
  protected readonly owner = signal<'' | 'me'>(this.initial.owner);
  protected readonly overdue = signal(this.initial.overdue);
  protected readonly category = signal(this.initial.category);
  protected readonly justified = signal<JustifiedFilter>(this.initial.justified);
  protected readonly department = signal(this.initial.department);
  protected readonly sort = signal<FeedbackSort>(DEFAULT_SORT);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly FeedbackListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly stats = signal<FeedbackStats | null>(null);
  protected readonly categories = signal<readonly string[]>([]);
  protected readonly exporting = signal(false);
  private readonly reloads = signal(0);

  protected readonly departments = computed(() =>
    this.assignees.options().departments.map((o) => ({ id: o.value.slice(11), label: o.label })),
  );

  protected readonly query = computed<FeedbackListQuery>(() => ({
    q: this.q() || undefined,
    ...statusQuery(this.status()),
    kind: this.kind() ? [this.kind() as FeedbackKind] : undefined,
    channel: this.channel() ? [this.channel() as FeedbackChannel] : undefined,
    severity: this.severity() ? [this.severity() as FeedbackSeverity] : undefined,
    owner: this.owner() || undefined,
    overdue: this.overdue() ? true : undefined,
    category: this.category() || undefined,
    justified: this.justified() === '' ? undefined : this.justified() === 'yes',
    department_id: this.department() || undefined,
    survey_id: this.surveyId() || undefined,
    sort: this.sort(),
  }));

  /** Filters under "Flere filtre" that are set (its badge count). */
  protected readonly moreActive = computed(
    () =>
      [
        this.channel(),
        this.severity(),
        this.justified(),
        this.department(),
        this.category(),
        this.overdue() ? '1' : '',
        this.sort() !== DEFAULT_SORT ? '1' : '',
      ].filter(Boolean).length,
  );

  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      !!this.surveyId() ||
      this.status() !== 'all' ||
      !!this.kind() ||
      !!this.owner() ||
      this.moreActive() > 0,
  );
  /** The teaching empty state: the register itself is empty (not just this filter). */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    kind: this.kind(),
    channel: this.channel(),
    severity: this.severity(),
    owner: this.owner(),
    overdue: this.overdue() ? '1' : '',
    category: this.category(),
    justified: this.justified(),
    department: this.department(),
    sort: this.sort(),
  }));

  protected readonly kpis = computed(() => {
    const s = this.stats();
    const openComplaintsActive =
      this.kind() === 'complaint' && this.status() === 'open' && !this.overdue();
    const tiles: {
      key: ListKpi;
      value: string | number;
      tone: KpiTone;
      hint: number;
      active: boolean;
    }[] = [
      {
        key: 'openComplaints',
        value: s?.open_complaints ?? '–',
        tone: s?.open_complaints ? 'warn' : 'neutral',
        hint: s?.complaints ?? 0,
        active: openComplaintsActive,
      },
      {
        key: 'overdue',
        value: s?.overdue ?? '–',
        tone: s?.overdue ? 'warn' : 'neutral',
        hint: s?.total ?? 0,
        active: this.overdue() && this.status() === 'all' && !this.kind(),
      },
      {
        key: 'new',
        value: s?.by_status['new'] ?? (s ? 0 : '–'),
        tone: s?.by_status['new'] ? 'info' : 'neutral',
        hint: s?.total ?? 0,
        active: this.status() === 'new' && !this.kind() && !this.overdue(),
      },
      {
        key: 'satisfaction',
        value: round1(s?.average_satisfaction) ?? '–',
        tone: 'accent',
        hint: s?.satisfaction_count ?? 0,
        active: false,
      },
    ];
    return tiles;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    this.assignees.ensureLoaded();
    providePageContext(() => ({
      module: 'feedback',
      entityType: FEEDBACK_ENTITY,
      view: 'list',
      title: this.language.translate('modules.names.feedback'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: FeedbackListQuery = {
        ...this.query(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      this.reloads();
      untracked(() => this.load(orgId, query));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.loadSummary(orgId));
    });
  }

  protected statusFilterKey(filter: string): string {
    return filter === 'open' || filter === 'all'
      ? `feedback.filters.statusOptions.${filter}`
      : feedbackStatusKey(filter);
  }

  /** Channel · customer · category · department, in the UI language. */
  protected subtitle(f: FeedbackListItem): string {
    const parts = [this.language.translate(feedbackChannelKey(f.channel))];
    const customer = [f.customer_name, f.customer_organisation].filter(Boolean).join(', ');
    if (customer) {
      parts.push(customer);
    }
    if (f.category) {
      parts.push(this.language.translate('feedback.list.categoryValue', { category: f.category }));
    }
    if (f.department?.name) {
      parts.push(f.department.name);
    }
    return parts.join(' · ');
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set(oneOf<StatusFilter>(STATUS_FILTERS, value, 'all'));
  }

  protected setKind(value: string): void {
    this.offset.set(0);
    this.kind.set(oneOf<FeedbackKind | ''>(FEEDBACK_KINDS, value, ''));
  }

  protected setChannel(value: string): void {
    this.offset.set(0);
    this.channel.set(oneOf<FeedbackChannel | ''>(FEEDBACK_CHANNELS, value, ''));
  }

  protected setSeverity(value: string): void {
    this.offset.set(0);
    this.severity.set(oneOf<FeedbackSeverity | ''>(FEEDBACK_SEVERITIES, value, ''));
  }

  protected setOwner(value: string): void {
    this.offset.set(0);
    this.owner.set(value === 'me' ? 'me' : '');
  }

  protected setOverdue(value: boolean): void {
    this.offset.set(0);
    this.overdue.set(value);
  }

  protected setCategory(value: string): void {
    this.offset.set(0);
    this.category.set(value.trim().slice(0, 64));
  }

  protected setJustified(value: string): void {
    this.offset.set(0);
    this.justified.set(oneOf<JustifiedFilter>(JUSTIFIED_FILTERS, value, ''));
  }

  protected setDepartment(value: string): void {
    this.offset.set(0);
    this.department.set(value);
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(oneOf<FeedbackSort>(FEEDBACK_SORTS, value, DEFAULT_SORT));
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.setStatus(f['status'] ?? 'all');
    this.setKind(f['kind'] ?? '');
    this.setChannel(f['channel'] ?? '');
    this.setSeverity(f['severity'] ?? '');
    this.setOwner(f['owner'] ?? '');
    this.setOverdue(f['overdue'] === '1');
    this.setCategory(f['category'] ?? '');
    this.setJustified(f['justified'] ?? '');
    this.setDepartment(f['department'] ?? '');
    this.setSort(f['sort'] ?? DEFAULT_SORT);
  }

  protected resetFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.status.set('all');
    this.kind.set('');
    this.channel.set('');
    this.severity.set('');
    this.owner.set('');
    this.overdue.set(false);
    this.category.set('');
    this.justified.set('');
    this.department.set('');
    this.sort.set(DEFAULT_SORT);
    if (this.surveyId()) {
      this.clearSurvey();
    }
  }

  /** A summary tile: apply (or clear) its filter; satisfaction opens the insights. */
  protected focusKpi(key: ListKpi): void {
    if (key === 'satisfaction') {
      void this.router.navigate(['/feedback/insights']);
      return;
    }
    const tile = this.kpis().find((k) => k.key === key);
    const wasActive = !!tile?.active;
    this.resetFilters();
    if (wasActive) {
      return;
    }
    if (key === 'openComplaints') {
      this.kind.set('complaint');
      this.status.set('open');
    } else if (key === 'overdue') {
      this.overdue.set(true);
    } else {
      this.status.set('new');
    }
  }

  protected clearSurvey(): void {
    this.surveyId.set('');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { survey: null } });
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  protected newFeedback(): void {
    void this.router.navigate(['/feedback/items/new']);
  }

  protected export(format: ExportFormat): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    const lang = this.language.active();
    this.api.exportLog(orgId, this.query(), format, lang).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, exportFileName(this.language.translate('feedback.export.logFile'), format));
      },
      error: (error: unknown) => {
        this.exporting.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
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

  private loadSummary(orgId: string | null): void {
    if (!orgId) {
      return;
    }
    this.api.stats(orgId).subscribe({
      next: (stats) => this.stats.set(stats),
      error: () => this.stats.set(null),
    });
    this.api.categories(orgId).subscribe({
      next: (res) => this.categories.set(res.items.map((c) => c.value)),
      error: () => this.categories.set([]),
    });
  }
}
