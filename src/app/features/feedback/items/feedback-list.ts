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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink, convertToParamMap } from '@angular/router';
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
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { FulfilsRequirements } from '../../../shared/requirement-locations/fulfils-requirements';
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
  FEEDBACK_SENTIMENTS,
  FEEDBACK_SEVERITIES,
  FEEDBACK_SORTS,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
  FeedbackBulkResult,
  FeedbackChannel,
  FeedbackKind,
  FeedbackListItem,
  FeedbackListQuery,
  FeedbackSentiment,
  FeedbackSeverity,
  FeedbackSort,
  FeedbackSource,
  FeedbackStats,
  FeedbackStatus,
  PERM_WRITE,
  UNANSWERED_DAYS,
} from '../data/feedback.models';
import { FeedbackExportMenu } from '../export-menu';
import { FEEDBACK_NAV, FEEDBACK_SETTINGS_LINK } from '../feedback-nav';
import { FeedbackStatsPanel } from '../insights/feedback-stats-panel';
import { ComplaintDeviations } from './complaint-deviations';
import { FeedbackBulkBar } from './feedback-bulk-bar';

const PAGE_SIZE = 25;
const DEFAULT_SORT: FeedbackSort = '-received_on';
/** A satisfaction score at or under this (1–5) is flagged in the list. */
export const LOW_SCORE = 2;

/** The plain status words of the list: Ny · Under behandling · Ferdig. */
export const STATUS_WORDS = ['new', 'in_work', 'done'] as const;
export type StatusWord = (typeof STATUS_WORDS)[number];

/** The status filter the select offers: all, still open, and the three words. */
export const PLAIN_STATUS_FILTERS = ['all', 'open', ...STATUS_WORDS] as const;

/** Every status filter a link may carry (the exact statuses still work in URLs). */
export const STATUS_FILTERS = [
  ...PLAIN_STATUS_FILTERS,
  ...FEEDBACK_STATUSES.filter((s) => s !== 'new'),
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** "Was the complaint justified?" filter: any, yes, no. */
export const JUSTIFIED_FILTERS = ['', 'yes', 'no'] as const;
export type JustifiedFilter = (typeof JUSTIFIED_FILTERS)[number];

/** The KPI band (≤ 4 tiles); each count opens the list it counts. */
export const LIST_KPIS = ['open', 'complaints', 'unanswered', 'satisfaction'] as const;
export type ListKpi = (typeof LIST_KPIS)[number];

/** The plain word of a status: acknowledged and in progress are both "Under behandling". */
export function statusWord(status: FeedbackStatus | string): StatusWord {
  if (status === 'new') {
    return 'new';
  }
  return status === 'resolved' || status === 'closed' ? 'done' : 'in_work';
}

/** The query for a status filter: `open` uses the server's `open` flag. */
export function statusQuery(filter: string): Pick<FeedbackListQuery, 'status' | 'open'> {
  if (filter === 'open') {
    return { open: true };
  }
  if (filter === 'in_work') {
    return { status: ['acknowledged', 'in_progress'] };
  }
  if (filter === 'done') {
    return { status: ['resolved', 'closed'] };
  }
  return (FEEDBACK_STATUSES as readonly string[]).includes(filter)
    ? { status: [filter as FeedbackStatus] }
    : {};
}

function oneOf<T extends string>(values: readonly T[], value: string | null, fallback: T): T {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoDayOrEmpty(value: string | null): string {
  return value && ISO_DAY.test(value) ? value : '';
}

function flag(value: string | null): boolean {
  return value === 'true' || value === '1';
}

/** `?unanswered_days=14` (or `?unanswered=1` for the default): 0 when absent. */
function unansweredDays(params: ParamMap): number {
  const raw = params.get('unanswered_days');
  if (raw !== null && /^\d{1,4}$/.test(raw)) {
    return Math.min(3650, Number(raw));
  }
  return flag(params.get('unanswered')) ? UNANSWERED_DAYS : 0;
}

/** The filters a link can open the register with (`/feedback?kind=complaint&status=new`). */
export interface ListFiltersFromUrl {
  readonly status: StatusFilter;
  readonly kind: FeedbackKind | '';
  readonly channel: FeedbackChannel | '';
  readonly severity: FeedbackSeverity | '';
  readonly sentiment: FeedbackSentiment | '';
  readonly source: FeedbackSource | '';
  readonly owner: '' | 'me';
  readonly overdue: boolean;
  readonly unanswered: number;
  readonly category: string;
  readonly justified: JustifiedFilter;
  readonly department: string;
  readonly from: string;
  readonly to: string;
}

export function filtersFromParams(params: ParamMap): ListFiltersFromUrl {
  const open = flag(params.get('open'));
  return {
    status: open ? 'open' : oneOf<StatusFilter>(STATUS_FILTERS, params.get('status'), 'all'),
    kind: oneOf<FeedbackKind | ''>(FEEDBACK_KINDS, params.get('kind'), ''),
    channel: oneOf<FeedbackChannel | ''>(FEEDBACK_CHANNELS, params.get('channel'), ''),
    severity: oneOf<FeedbackSeverity | ''>(FEEDBACK_SEVERITIES, params.get('severity'), ''),
    sentiment: oneOf<FeedbackSentiment | ''>(FEEDBACK_SENTIMENTS, params.get('sentiment'), ''),
    source: oneOf<FeedbackSource | ''>(FEEDBACK_SOURCES, params.get('source'), ''),
    owner: params.get('owner') === 'me' ? 'me' : '',
    overdue: flag(params.get('overdue')),
    unanswered: unansweredDays(params),
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
    from: isoDayOrEmpty(params.get('received_from')),
    to: isoDayOrEmpty(params.get('received_to')),
  };
}

/** The URL parameters that decide the list (`stats` only folds the statistics out). */
export function filterParamsKey(params: ParamMap): string {
  return params.keys
    .filter((k) => k !== 'stats')
    .sort()
    .map((k) => `${k}=${params.getAll(k).join(',')}`)
    .join('&');
}

const SELECT =
  'h-10 max-w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none';

interface BandTile {
  readonly key: ListKpi;
  readonly value: string | number;
  readonly tone: KpiTone;
  readonly hintKey: string;
  readonly hintParams: Record<string, unknown>;
  readonly active: boolean;
  /** The list the count opens; null for the average (it folds out the statistics). */
  readonly query: Readonly<Record<string, string>> | null;
}

/**
 * The customer feedback register (`/feedback`, "Kundetilbakemeldinger og svar"):
 * every complaint, compliment, suggestion, question and survey follow-up, newest
 * first. A KPI band of four tiles, each opening the list it counts (the average
 * folds out the statistics, `?stats=1`); search, status and source filters plus
 * "Flere filtre"; ready-made views (Klager, Ubesvart > 14 dager); bulk status and
 * assignment; complaints recorded as deviations cross-listed under Klager; and an
 * export of the log with the same filters. Links open it pre-filtered
 * (`?kind=complaint`, `?open=true`, `?unanswered_days=14`, `?source=survey`,
 * `?survey=<id>`, `?received_from=…&received_to=…`).
 */
@Component({
  selector: 'app-feedback-list',
  imports: [
    RouterLink,
    FulfilsRequirements,
    TranslocoPipe,
    LocalDayPipe,
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
    FeedbackStatsPanel,
    ComplaintDeviations,
    FeedbackBulkBar,
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
      [presetViews]="presetViews()"
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
        @for (k of band(); track k.key) {
          @if (k.query) {
            <a
              routerLink="/feedback"
              [queryParams]="k.query"
              class="block rounded-card focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [class.ring-2]="k.active"
              [class.ring-accent]="k.active"
              [attr.aria-current]="k.active ? 'true' : null"
              [attr.data-testid]="'kpi-' + k.key"
              (click)="applyTile(k.key)"
            >
              <app-kpi-tile
                [label]="'feedback.kpis.' + k.key | transloco: { days: unansweredDays }"
                [value]="k.value"
                [tone]="k.tone"
                [delta]="k.hintKey | transloco: k.hintParams"
                deltaTone="neutral"
              />
            </a>
          } @else {
            <button
              type="button"
              class="block w-full rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [class.ring-2]="showStats()"
              [class.ring-accent]="showStats()"
              [attr.aria-expanded]="showStats()"
              [attr.aria-controls]="statsId"
              [attr.data-testid]="'kpi-' + k.key"
              (click)="toggleStats()"
            >
              <app-kpi-tile
                [label]="'feedback.kpis.' + k.key | transloco"
                [value]="k.value"
                [tone]="k.tone"
                [delta]="k.hintKey | transloco: k.hintParams"
                deltaTone="neutral"
              />
            </button>
          }
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
        @for (s of statusOptions(); track s) {
          <option [value]="s" [selected]="status() === s">
            {{ statusFilterKey(s) | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-fb-source">
        {{ 'feedback.filters.source' | transloco }}
      </label>
      <select
        filters
        id="cf-fb-source"
        [class]="select"
        (change)="setSource($any($event.target).value)"
        data-testid="filter-source"
      >
        <option value="" [selected]="!source()">
          {{ 'feedback.filters.allSources' | transloco }}
        </option>
        @for (s of sources; track s) {
          <option [value]="s" [selected]="source() === s">
            {{ 'feedback.sources.' + s | transloco }}
          </option>
        }
      </select>

      <div more-filters class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label for="cf-fb-kind" class="text-meta font-semibold text-fg-muted">{{
            'feedback.filters.kind' | transloco
          }}</label>
          <select
            id="cf-fb-kind"
            [class]="select"
            (change)="setKind($any($event.target).value)"
            data-testid="filter-kind"
          >
            <option value="" [selected]="!kind()">
              {{ 'feedback.filters.allKinds' | transloco }}
            </option>
            @for (k of kinds; track k) {
              <option [value]="k" [selected]="kind() === k">{{ kindKey(k) | transloco }}</option>
            }
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="cf-fb-owner" class="text-meta font-semibold text-fg-muted">{{
            'feedback.filters.owner' | transloco
          }}</label>
          <select
            id="cf-fb-owner"
            [class]="select"
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
        </div>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="unanswered() > 0"
            (change)="setUnanswered($any($event.target).checked)"
            data-testid="filter-unanswered"
          />
          {{ 'feedback.filters.unanswered' | transloco: { days: unanswered() || unansweredDays } }}
        </label>
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
        <div class="flex flex-col gap-1">
          <label for="cf-fb-sentiment" class="text-meta font-semibold text-fg-muted">{{
            'feedback.filters.sentiment' | transloco
          }}</label>
          <select
            id="cf-fb-sentiment"
            [class]="select"
            (change)="setSentiment($any($event.target).value)"
            data-testid="filter-sentiment"
          >
            <option value="" [selected]="!sentiment()">
              {{ 'feedback.filters.anySentiment' | transloco }}
            </option>
            @for (s of sentiments; track s) {
              <option [value]="s" [selected]="sentiment() === s">
                {{ 'feedback.sentiments.' + s | transloco }}
              </option>
            }
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
      </div>

      @if (showStats()) {
        <div [id]="statsId">
          <app-feedback-stats-panel />
        </div>
      }

      @if (surveyId() || from() || to()) {
        <p
          class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-muted"
          data-testid="scope-filters"
        >
          @if (surveyId()) {
            <span data-testid="survey-filter">
              {{ 'feedback.list.surveyFilter' | transloco }}
              <button
                type="button"
                class="font-semibold text-accent hover:underline"
                (click)="clearSurvey()"
              >
                {{ 'feedback.list.clearSurveyFilter' | transloco }}
              </button>
            </span>
          }
          @if (from() || to()) {
            <span data-testid="period-filter">
              {{
                'feedback.list.periodFilter'
                  | transloco
                    : {
                        from: from() ? (from() | localDay) : '…',
                        to: to() ? (to() | localDay) : '…',
                      }
              }}
              <button
                type="button"
                class="font-semibold text-accent hover:underline"
                (click)="clearPeriod()"
              >
                {{ 'feedback.list.clearPeriod' | transloco }}
              </button>
            </span>
          }
        </p>
      }

      @if (selectedIds().length) {
        <app-feedback-bulk-bar
          [ids]="selectedIds()"
          [users]="users()"
          (applied)="onBulkApplied($event)"
          (cleared)="selected.set(emptySelection)"
        />
      }

      @if (state() === 'ready' && total() > 0) {
        <div
          class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-muted"
          data-testid="count-line"
        >
          @if (canWrite()) {
            <label class="inline-flex min-h-8 items-center gap-2">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [checked]="allSelected()"
                (change)="selectPage($any($event.target).checked)"
                data-testid="select-page"
              />
              {{ 'feedback.bulk.selectPage' | transloco }}
            </label>
          }
          <span aria-live="polite">
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
          </span>
        </div>
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
                <!-- The header lines up with the rows behind the selection column. -->
                <app-record-row-header dateKind="due" [class.pl-10]="canWrite()" />
                @for (f of rows(); track f.id) {
                  <div class="flex items-stretch" [class.bg-accent-soft]="isSelected(f.id)">
                    @if (canWrite()) {
                      <label
                        class="flex w-10 flex-none cursor-pointer justify-center border-b border-border pt-[15px] sm:items-center sm:pt-0"
                      >
                        <span class="sr-only">{{
                          'feedback.bulk.selectRow' | transloco: { code: f.code }
                        }}</span>
                        <input
                          type="checkbox"
                          class="h-4 w-4 accent-[var(--accent)]"
                          [checked]="isSelected(f.id)"
                          (change)="toggle(f.id, $any($event.target).checked)"
                          [attr.data-testid]="'select-' + f.code"
                        />
                      </label>
                    }
                    <app-record-row
                      class="min-w-0 flex-1"
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
                          [labelKey]="'feedback.statusWords.' + word(f.status)"
                        />
                        <app-badge tone="neutral">{{ kindKey(f.kind) | transloco }}</app-badge>
                        @if (isLow(f)) {
                          <app-badge tone="warn" data-testid="low-score">{{
                            'feedback.list.lowScore' | transloco: { score: f.satisfaction_score }
                          }}</app-badge>
                        }
                        @if (f.severity === 'high' || f.severity === 'critical') {
                          <app-status-badge
                            meaning="severity"
                            [value]="f.severity"
                            [labelKey]="severityKey(f.severity)"
                          />
                        }
                      </span>
                    </app-record-row>
                  </div>
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

      @if (showComplaintDeviations()) {
        <app-complaint-deviations [q]="q()" [open]="status() === 'open'" />
      }

      <app-why-it-matters below scope="feedback" page="list" />

      <div empty class="flex flex-col gap-6">
        @if (showStats()) {
          <app-feedback-stats-panel />
        }
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
  protected readonly justifiedFilters = JUSTIFIED_FILTERS;
  protected readonly kinds = FEEDBACK_KINDS;
  protected readonly channels = FEEDBACK_CHANNELS;
  protected readonly severities = FEEDBACK_SEVERITIES;
  protected readonly sentiments = FEEDBACK_SENTIMENTS;
  protected readonly sources = FEEDBACK_SOURCES;
  protected readonly sorts = FEEDBACK_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly unansweredDays = UNANSWERED_DAYS;
  protected readonly kindKey = feedbackKindKey;
  protected readonly channelKey = feedbackChannelKey;
  protected readonly severityKey = feedbackSeverityKey;
  protected readonly sortKey = sortKey;
  protected readonly word = statusWord;
  protected readonly statsId = 'cf-fb-stats-panel';
  protected readonly emptySelection: ReadonlySet<string> = new Set();

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  private readonly initial = filtersFromParams(this.route.snapshot.queryParamMap);
  private lastParamsKey = filterParamsKey(this.route.snapshot.queryParamMap);
  /** `?survey=<id>`: only the follow-ups raised from one survey. */
  protected readonly surveyId = signal(this.route.snapshot.queryParamMap.get('survey') || '');
  /** `?stats=1`: the statistics folded out under the band. */
  protected readonly showStats = signal(flag(this.route.snapshot.queryParamMap.get('stats')));

  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly status = signal<StatusFilter>(this.initial.status);
  protected readonly kind = signal<FeedbackKind | ''>(this.initial.kind);
  protected readonly channel = signal<FeedbackChannel | ''>(this.initial.channel);
  protected readonly severity = signal<FeedbackSeverity | ''>(this.initial.severity);
  protected readonly sentiment = signal<FeedbackSentiment | ''>(this.initial.sentiment);
  protected readonly source = signal<FeedbackSource | ''>(this.initial.source);
  protected readonly owner = signal<'' | 'me'>(this.initial.owner);
  protected readonly overdue = signal(this.initial.overdue);
  protected readonly unanswered = signal(this.initial.unanswered);
  protected readonly category = signal(this.initial.category);
  protected readonly justified = signal<JustifiedFilter>(this.initial.justified);
  protected readonly department = signal(this.initial.department);
  protected readonly from = signal(this.initial.from);
  protected readonly to = signal(this.initial.to);
  protected readonly sort = signal<FeedbackSort>(DEFAULT_SORT);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly FeedbackListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly stats = signal<FeedbackStats | null>(null);
  protected readonly categories = signal<readonly string[]>([]);
  protected readonly exporting = signal(false);
  protected readonly selected = signal<ReadonlySet<string>>(this.emptySelection);
  private readonly reloads = signal(0);

  protected readonly departments = computed(() =>
    this.assignees.options().departments.map((o) => ({ id: o.value.slice(11), label: o.label })),
  );
  protected readonly users = computed(() =>
    this.assignees.options().users.map((o) => ({ id: o.value.slice(5), label: o.label })),
  );

  /** The plain choices, plus an exact status a link opened the list with. */
  protected readonly statusOptions = computed<readonly StatusFilter[]>(() => {
    const current = this.status();
    return (PLAIN_STATUS_FILTERS as readonly string[]).includes(current)
      ? PLAIN_STATUS_FILTERS
      : [...PLAIN_STATUS_FILTERS, current];
  });

  protected readonly query = computed<FeedbackListQuery>(() => ({
    q: this.q() || undefined,
    ...statusQuery(this.status()),
    kind: this.kind() ? [this.kind() as FeedbackKind] : undefined,
    channel: this.channel() ? [this.channel() as FeedbackChannel] : undefined,
    severity: this.severity() ? [this.severity() as FeedbackSeverity] : undefined,
    sentiment: this.sentiment() ? [this.sentiment() as FeedbackSentiment] : undefined,
    source: this.source() ? [this.source() as FeedbackSource] : undefined,
    owner: this.owner() || undefined,
    overdue: this.overdue() ? true : undefined,
    unanswered_days: this.unanswered() || undefined,
    category: this.category() || undefined,
    justified: this.justified() === '' ? undefined : this.justified() === 'yes',
    department_id: this.department() || undefined,
    survey_id: this.surveyId() || undefined,
    received_from: this.from() || undefined,
    received_to: this.to() || undefined,
    sort: this.sort(),
  }));

  /** Filters under "Flere filtre" that are set (its badge count). */
  protected readonly moreActive = computed(
    () =>
      [
        this.kind(),
        this.owner(),
        this.channel(),
        this.severity(),
        this.sentiment(),
        this.justified(),
        this.department(),
        this.category(),
        this.overdue() ? '1' : '',
        this.unanswered() ? '1' : '',
        this.sort() !== DEFAULT_SORT ? '1' : '',
      ].filter(Boolean).length,
  );

  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      !!this.surveyId() ||
      !!this.from() ||
      !!this.to() ||
      this.status() !== 'all' ||
      !!this.source() ||
      this.moreActive() > 0,
  );
  /** The teaching empty state: the register itself is empty (not just this filter). */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  /** Complaints recorded as deviations belong in "all complaints" (KLG-1, task 11). */
  protected readonly showComplaintDeviations = computed(
    () =>
      this.kind() === 'complaint' &&
      !this.source() &&
      !this.surveyId() &&
      this.state() !== 'loading',
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    kind: this.kind(),
    channel: this.channel(),
    severity: this.severity(),
    sentiment: this.sentiment(),
    source: this.source(),
    owner: this.owner(),
    overdue: this.overdue() ? '1' : '',
    unanswered: this.unanswered() ? String(this.unanswered()) : '',
    category: this.category(),
    justified: this.justified(),
    department: this.department(),
    sort: this.sort(),
  }));

  /** Ready-made views: Klager, Ubesvart > 14 dager, Fra undersøkelser. */
  protected readonly presetViews = computed<readonly SavedView[]>(() => {
    const views: SavedView[] = [
      {
        id: 'complaints',
        name: this.language.translate('feedback.views.complaints'),
        query: '',
        filters: { kind: 'complaint' },
      },
      {
        id: 'unanswered',
        name: this.language.translate('feedback.views.unanswered', { days: UNANSWERED_DAYS }),
        query: '',
        filters: { unanswered: String(UNANSWERED_DAYS) },
      },
      {
        id: 'from-surveys',
        name: this.language.translate('feedback.views.fromSurveys'),
        query: '',
        filters: { source: 'survey' },
      },
    ];
    return views;
  });

  protected readonly band = computed<BandTile[]>(() => {
    const s = this.stats();
    const b = s?.band ?? null;
    const dash = '–';
    const onlyStatusOpen =
      this.status() === 'open' && !this.kind() && !this.unanswered() && !this.source();
    const deviations = b?.complaint_deviations ?? 0;
    const tiles: BandTile[] = [
      {
        key: 'open',
        value: b ? b.open : dash,
        tone: b?.open ? 'info' : 'neutral',
        hintKey: 'feedback.kpis.openHint',
        hintParams: {},
        active: onlyStatusOpen,
        query: { open: 'true' },
      },
      {
        key: 'complaints',
        value: b ? b.complaints : dash,
        tone: b?.complaints ? 'warn' : 'neutral',
        hintKey: deviations
          ? 'feedback.kpis.complaintsHintDeviations'
          : 'feedback.kpis.complaintsHint',
        hintParams: { count: deviations },
        active: this.kind() === 'complaint' && this.status() === 'all' && !this.unanswered(),
        query: { kind: 'complaint' },
      },
      {
        key: 'unanswered',
        value: b ? b.unanswered : dash,
        tone: b?.unanswered ? 'warn' : 'neutral',
        hintKey: 'feedback.kpis.unansweredHint',
        hintParams: {},
        active: this.unanswered() === (b?.unanswered_days ?? UNANSWERED_DAYS) && !this.kind(),
        query: { unanswered_days: String(b?.unanswered_days ?? UNANSWERED_DAYS) },
      },
      {
        key: 'satisfaction',
        value: round1(b ? b.average_satisfaction : s?.average_satisfaction) ?? dash,
        tone: 'accent',
        hintKey: this.showStats() ? 'feedback.kpis.hideStats' : 'feedback.kpis.showStats',
        hintParams: {},
        active: this.showStats(),
        query: null,
      },
    ];
    return tiles;
  });

  protected readonly selectedIds = computed(() => [...this.selected()]);
  protected readonly allSelected = computed(
    () => this.rows().length > 0 && this.rows().every((r) => this.selected().has(r.id)),
  );

  private request = new Subscription();
  private lastQueryKey = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    this.assignees.ensureLoaded();
    providePageContext(() => ({
      module: 'feedback',
      entityType: FEEDBACK_ENTITY,
      view: 'list',
      title: this.language.translate('modules.names.feedback'),
    }));

    // Tiles, statistics rows and other pages link here with filters: follow the URL.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.showStats.set(flag(params.get('stats')));
      const key = filterParamsKey(params);
      if (key === this.lastParamsKey) {
        return;
      }
      this.lastParamsKey = key;
      this.applyFilters(filtersFromParams(params));
      this.q.set(params.get('q') ?? '');
      this.surveyId.set(params.get('survey') || '');
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: FeedbackListQuery = {
        ...this.query(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      this.reloads();
      untracked(() => {
        // A new filter or page starts a new selection; a reload after a bulk change keeps it.
        const key = JSON.stringify(query);
        if (key !== this.lastQueryKey) {
          this.lastQueryKey = key;
          this.selected.set(this.emptySelection);
        }
        this.load(orgId, query);
      });
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.loadSummary(orgId));
    });
  }

  protected statusFilterKey(filter: string): string {
    if (filter === 'open' || filter === 'all') {
      return `feedback.filters.statusOptions.${filter}`;
    }
    return (STATUS_WORDS as readonly string[]).includes(filter)
      ? `feedback.statusWords.${filter}`
      : `feedback.status.${filter}`;
  }

  protected isLow(f: FeedbackListItem): boolean {
    return f.satisfaction_score !== null && f.satisfaction_score <= LOW_SCORE;
  }

  /** Channel · source (when it adds something) · customer · category · department. */
  protected subtitle(f: FeedbackListItem): string {
    const parts = [this.language.translate(feedbackChannelKey(f.channel))];
    if (f.source && f.source !== 'manual' && !(f.source === 'survey' && f.channel === 'survey')) {
      parts.push(this.language.translate(`feedback.sources.${f.source}`));
    }
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

  protected setSource(value: string): void {
    this.offset.set(0);
    this.source.set(oneOf<FeedbackSource | ''>(FEEDBACK_SOURCES, value, ''));
  }

  protected setChannel(value: string): void {
    this.offset.set(0);
    this.channel.set(oneOf<FeedbackChannel | ''>(FEEDBACK_CHANNELS, value, ''));
  }

  protected setSeverity(value: string): void {
    this.offset.set(0);
    this.severity.set(oneOf<FeedbackSeverity | ''>(FEEDBACK_SEVERITIES, value, ''));
  }

  protected setSentiment(value: string): void {
    this.offset.set(0);
    this.sentiment.set(oneOf<FeedbackSentiment | ''>(FEEDBACK_SENTIMENTS, value, ''));
  }

  protected setOwner(value: string): void {
    this.offset.set(0);
    this.owner.set(value === 'me' ? 'me' : '');
  }

  protected setOverdue(value: boolean): void {
    this.offset.set(0);
    this.overdue.set(value);
  }

  protected setUnanswered(value: boolean): void {
    this.offset.set(0);
    this.unanswered.set(value ? UNANSWERED_DAYS : 0);
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
    this.setSource(f['source'] ?? '');
    this.setChannel(f['channel'] ?? '');
    this.setSeverity(f['severity'] ?? '');
    this.setSentiment(f['sentiment'] ?? '');
    this.setOwner(f['owner'] ?? '');
    this.setOverdue(f['overdue'] === '1');
    this.unanswered.set(/^\d{1,4}$/.test(f['unanswered'] ?? '') ? Number(f['unanswered']) : 0);
    this.setCategory(f['category'] ?? '');
    this.setJustified(f['justified'] ?? '');
    this.setDepartment(f['department'] ?? '');
    this.setSort(f['sort'] ?? DEFAULT_SORT);
  }

  protected resetFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.applyFilters(filtersFromParams(convertToParamMap({})));
    this.sort.set(DEFAULT_SORT);
    if (this.surveyId() || this.from() || this.to()) {
      this.clearScope({ survey: null, received_from: null, received_to: null });
    }
  }

  /** A band tile: show exactly the records it counts (its link updates the URL too). */
  protected applyTile(key: ListKpi): void {
    this.offset.set(0);
    this.q.set('');
    this.surveyId.set('');
    this.applyFilters({
      ...filtersFromParams(convertToParamMap({})),
      status: key === 'open' ? 'open' : 'all',
      kind: key === 'complaints' ? 'complaint' : '',
      unanswered:
        key === 'unanswered' ? (this.stats()?.band?.unanswered_days ?? UNANSWERED_DAYS) : 0,
    });
    this.sort.set(DEFAULT_SORT);
  }

  protected toggleStats(): void {
    const next = !this.showStats();
    this.showStats.set(next);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { stats: next ? '1' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearSurvey(): void {
    this.clearScope({ survey: null });
  }

  protected clearPeriod(): void {
    this.clearScope({ received_from: null, received_to: null });
  }

  protected isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  protected toggle(id: string, on: boolean): void {
    const next = new Set(this.selected());
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.selected.set(next);
  }

  protected selectPage(on: boolean): void {
    this.selected.set(on ? new Set(this.rows().map((r) => r.id)) : this.emptySelection);
  }

  /** Keep the refused rows selected (their reasons stay on the bar); refresh list and band. */
  protected onBulkApplied(result: FeedbackBulkResult): void {
    this.selected.set(new Set(result.failed.map((f) => f.id)));
    this.reload();
    this.loadSummary(this.selectedOrg.currentOrgId());
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

  private applyFilters(f: ListFiltersFromUrl): void {
    this.offset.set(0);
    this.status.set(f.status);
    this.kind.set(f.kind);
    this.channel.set(f.channel);
    this.severity.set(f.severity);
    this.sentiment.set(f.sentiment);
    this.source.set(f.source);
    this.owner.set(f.owner);
    this.overdue.set(f.overdue);
    this.unanswered.set(f.unanswered);
    this.category.set(f.category);
    this.justified.set(f.justified);
    this.department.set(f.department);
    this.from.set(f.from);
    this.to.set(f.to);
  }

  /** Drop URL-only scopes (survey, period) without resetting the other filters. */
  private clearScope(params: Record<string, null>): void {
    if ('survey' in params) {
      this.surveyId.set('');
    }
    if ('received_from' in params) {
      this.from.set('');
      this.to.set('');
    }
    this.offset.set(0);
    const tree = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
    // The URL change must not re-apply the URL's filters over the ones set here.
    this.lastParamsKey = filterParamsKey(tree.queryParamMap);
    void this.router.navigateByUrl(tree);
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
