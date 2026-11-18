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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { FeedbackApi } from '../data/feedback-api';
import {
  addDays,
  exportFileName,
  npsLevel,
  percentOf,
  round1,
  saveBlob,
  scoreLevel,
  trimmedMonths,
} from '../data/feedback-display';
import { feedbackErrorKey } from '../data/feedback-errors';
import {
  ExportFormat,
  FEEDBACK_CHANNELS,
  FEEDBACK_KINDS,
  FEEDBACK_SENTIMENTS,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
  FeedbackStats,
  MonthlyStat,
} from '../data/feedback.models';
import { FeedbackExportMenu } from '../export-menu';
import { FeedbackThemes } from '../themes-panel';

export const PERIODS = ['3', '6', '12', '24'] as const;
export type Period = (typeof PERIODS)[number];

export interface BreakdownRow {
  readonly key: string;
  readonly labelKey: string;
  /** Literal label (categories are the organisation's own words). */
  readonly label?: string;
  readonly count: number;
  readonly percent: number;
  /** Query params that open the register filtered on this row. */
  readonly query: Readonly<Record<string, string>>;
}

/** A breakdown in a fixed order (every known value, zeros included). */
export function breakdown(
  counts: Readonly<Record<string, number>>,
  keys: readonly string[],
  prefix: string,
  param?: string,
): BreakdownRow[] {
  const total = keys.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
  return keys.map((key) => ({
    key,
    labelKey: `${prefix}.${key}`,
    count: counts[key] ?? 0,
    percent: percentOf(counts[key] ?? 0, total),
    query: param ? { [param]: key } : {},
  }));
}

/** The most used categories (the organisation's own words), largest first. */
export function categoryRows(
  counts: Readonly<Record<string, number>> | undefined,
  limit = 8,
): BreakdownRow[] {
  const entries = Object.entries(counts ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  return entries.map(([key, count]) => ({
    key,
    labelKey: '',
    label: key,
    count,
    percent: percentOf(count, total),
    query: { category: key },
  }));
}

/** The first day of the month `months` months before today (ISO day). */
export function periodStart(months: number, today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);
  return addDays(0, d);
}

/** The period's received-on window, added to every drill-down so counts match the list. */
export function periodQuery(
  stats: Pick<FeedbackStats, 'from_date' | 'to_date'> | null,
): Readonly<Record<string, string>> {
  return stats ? { received_from: stats.from_date, received_to: stats.to_date } : {};
}

/**
 * One month of the trend as a received-on window, clamped to the period so the
 * list it opens counts exactly the month's bar (`month` is `YYYY-MM`).
 */
export function monthQuery(
  month: string,
  stats: Pick<FeedbackStats, 'from_date' | 'to_date'> | null,
): Readonly<Record<string, string>> {
  const [year, mon] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = addDays(0, new Date(year, mon, 0));
  const from = stats && stats.from_date > first ? stats.from_date : first;
  const to = stats && stats.to_date < last ? stats.to_date : last;
  return { received_from: from, received_to: to };
}

/** The complaint-handling rows; each opens the complaints it counts in the period. */
export const HANDLING_ROWS = ['assessed', 'justified', 'replied'] as const;
export type HandlingRow = (typeof HANDLING_ROWS)[number];

/** The register filter behind a complaint-handling row (the same rules as the stats). */
export function handlingQuery(key: HandlingRow): Readonly<Record<string, string>> {
  if (key === 'justified') {
    return { kind: 'complaint', justified: 'yes' };
  }
  return { kind: 'complaint', [key]: 'true' };
}

interface PanelTile {
  readonly key: string;
  readonly value: string | number;
  readonly tone: KpiTone;
  readonly hintKey: string;
  readonly hintParams: Record<string, unknown>;
  /** Null for an average: there is no list behind it. */
  readonly link: string | null;
  readonly query: Readonly<Record<string, string>> | null;
}

/**
 * The register's statistics, folded out under the KPI band (`/feedback?stats=1`;
 * `/feedback/insights` redirects here). The evidence for ISO 9001 9.1.2 and the
 * management review: the period's totals, complaint handling, breakdowns that each
 * open the register filtered on the row and the period, the monthly trend, the
 * survey score and NPS, an export, and the themes in what customers wrote.
 */
@Component({
  selector: 'app-feedback-stats-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Card,
    ErrorState,
    Icon,
    KpiTile,
    LoadingState,
    FeedbackExportMenu,
    FeedbackThemes,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="mb-6 rounded-card border border-border bg-surface-2 p-3 sm:p-4"
      [attr.aria-labelledby]="headingId"
      data-testid="stats-panel"
    >
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <h2 [id]="headingId" class="mr-auto font-display text-card font-bold text-fg">
          {{ 'feedback.stats.title' | transloco }}
        </h2>
        <label for="cf-fb-period" class="sr-only">
          {{ 'feedback.insights.period' | transloco }}
        </label>
        <select
          id="cf-fb-period"
          class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none"
          (change)="setPeriod($any($event.target).value)"
          data-testid="insights-period"
        >
          @for (p of periods; track p) {
            <option [value]="p" [selected]="period() === p">
              {{ 'feedback.insights.months' | transloco: { count: p } }}
            </option>
          }
        </select>
        <app-feedback-export-menu [busy]="exporting()" (chosen)="export($event)" />
        <a
          routerLink="/management-review"
          class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          data-testid="to-management-review"
        >
          <app-icon name="reports" [size]="14" />
          <span class="hidden sm:inline">{{
            'feedback.insights.toManagementReview' | transloco
          }}</span>
        </a>
      </div>
      @if (stats(); as s) {
        <p class="mb-3 text-meta text-fg-muted" data-testid="insights-range">
          {{
            'feedback.insights.range'
              | transloco: { from: (s.from_date | localDay), to: (s.to_date | localDay) }
          }}
        </p>
      }

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="4" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (stats(); as s) {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="insights-kpis">
              @for (t of tiles(); track t.key) {
                @if (t.link) {
                  <a
                    [routerLink]="t.link"
                    [queryParams]="t.query"
                    class="block rounded-card focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    [attr.data-testid]="'tile-' + t.key"
                  >
                    <app-kpi-tile
                      [label]="'feedback.insights.tiles.' + t.key | transloco"
                      [value]="t.value"
                      [tone]="t.tone"
                      [delta]="t.hintKey | transloco: t.hintParams"
                      deltaTone="neutral"
                    />
                  </a>
                } @else {
                  <div [attr.data-testid]="'tile-' + t.key">
                    <app-kpi-tile
                      noLink="average"
                      [label]="'feedback.insights.tiles.' + t.key | transloco"
                      [value]="t.value"
                      [tone]="t.tone"
                      [delta]="t.hintKey | transloco: t.hintParams"
                      deltaTone="neutral"
                    />
                  </div>
                }
              }
            </div>
            <p class="mt-2 text-meta text-fg-muted">{{ 'feedback.insights.scales' | transloco }}</p>

            <app-card class="mt-4 block">
              <h3 class="mb-1 font-display text-card font-bold text-fg">
                {{ 'feedback.insights.handling.title' | transloco }}
              </h3>
              <p class="mb-3 text-meta text-fg-muted">
                {{ 'feedback.insights.handling.intro' | transloco }}
              </p>
              @if (!s.complaints) {
                <p class="text-ui text-fg-muted">
                  {{ 'feedback.insights.handling.none' | transloco }}
                </p>
              } @else {
                <ul class="flex flex-col gap-2" data-testid="complaint-handling">
                  @for (h of handling(); track h.key) {
                    <li>
                      <a
                        routerLink="/feedback"
                        [queryParams]="h.query"
                        class="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 rounded-tile px-1 py-1 text-ui hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none sm:grid-cols-[220px_minmax(0,1fr)_88px]"
                        [attr.data-testid]="'handling-' + h.key"
                      >
                        <span class="text-fg">{{
                          'feedback.insights.handling.' + h.key | transloco
                        }}</span>
                        <span
                          class="hidden h-2.5 overflow-hidden rounded-full bg-surface-2 sm:block"
                          aria-hidden="true"
                        >
                          <span
                            class="block h-full rounded-full bg-accent"
                            [style.width.%]="h.percent"
                          ></span>
                        </span>
                        <span class="text-right font-semibold text-accent">{{
                          'feedback.insights.handling.ofTotal'
                            | transloco: { count: h.count, total: s.complaints, percent: h.percent }
                        }}</span>
                      </a>
                    </li>
                  }
                </ul>
              }
            </app-card>

            <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              @for (b of breakdowns(); track b.titleKey) {
                <app-card>
                  <h3 class="mb-3 font-display text-card font-bold text-fg">
                    {{ b.titleKey | transloco }}
                  </h3>
                  @if (b.rows.length === 0) {
                    <p class="text-ui text-fg-muted">
                      {{ 'feedback.insights.noData' | transloco }}
                    </p>
                  } @else {
                    <ul class="flex flex-col gap-1">
                      @for (row of b.rows; track row.key) {
                        <li>
                          <a
                            routerLink="/feedback"
                            [queryParams]="row.query"
                            class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_40px] items-center gap-2 rounded-tile px-1 py-1 text-meta hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                            [attr.aria-label]="
                              'feedback.insights.rowLabel'
                                | transloco
                                  : {
                                      label: row.label ?? (row.labelKey | transloco),
                                      count: row.count,
                                    }
                            "
                          >
                            <span class="truncate text-fg">{{
                              row.label ?? (row.labelKey | transloco)
                            }}</span>
                            <span
                              class="h-2.5 overflow-hidden rounded-full bg-surface-2"
                              aria-hidden="true"
                            >
                              <span
                                class="block h-full rounded-full bg-accent"
                                [style.width.%]="row.percent"
                              ></span>
                            </span>
                            <span class="text-right text-fg-muted">{{ row.count }}</span>
                          </a>
                        </li>
                      }
                    </ul>
                  }
                </app-card>
              }
            </div>

            <app-card class="mt-4 block">
              <h3 class="mb-1 font-display text-card font-bold text-fg">
                {{ 'feedback.insights.trend' | transloco }}
              </h3>
              @if (months().length === 0) {
                <p class="text-ui text-fg-muted">{{ 'feedback.insights.noData' | transloco }}</p>
              } @else {
                <p class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-fg-muted">
                  <span class="inline-flex items-center gap-1.5">
                    <span
                      class="inline-block h-2.5 w-2.5 rounded-sm bg-accent"
                      aria-hidden="true"
                    ></span>
                    {{ 'feedback.insights.legendOther' | transloco }}
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                    <span
                      class="inline-block h-2.5 w-2.5 rounded-sm bg-warn"
                      aria-hidden="true"
                    ></span>
                    {{ 'feedback.kinds.complaint' | transloco }}
                  </span>
                </p>
                <div
                  class="flex h-40 items-end gap-1.5 overflow-x-auto border-b border-border pb-0.5 sm:gap-3"
                  role="group"
                  [attr.aria-label]="'feedback.insights.chartLabel' | transloco"
                  data-testid="insights-chart"
                >
                  @for (m of months(); track m.month) {
                    @if (m.total) {
                      <a
                        routerLink="/feedback"
                        [queryParams]="m.query"
                        class="group flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1 rounded-t-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        [attr.aria-label]="
                          'feedback.insights.monthLabel'
                            | transloco
                              : {
                                  month: (m.month + '-01' | localDay: 'MMMM y'),
                                  count: m.total,
                                  complaints: m.complaints,
                                }
                        "
                        [attr.data-testid]="'month-' + m.month"
                      >
                        <span class="text-micro font-semibold text-accent">{{ m.total }}</span>
                        <span
                          class="flex w-full max-w-10 flex-col justify-end overflow-hidden rounded-t-md group-hover:opacity-80"
                          [style.height.%]="barHeight(m.total)"
                        >
                          <span
                            class="block w-full bg-accent"
                            [style.flex-grow]="m.total - m.complaints"
                          ></span>
                          <span
                            class="block w-full bg-warn"
                            [style.flex-grow]="m.complaints"
                          ></span>
                        </span>
                      </a>
                    } @else {
                      <span class="min-w-8 flex-1" aria-hidden="true"></span>
                    }
                  }
                </div>
                <div class="mt-1 flex gap-1.5 overflow-x-auto sm:gap-3" aria-hidden="true">
                  @for (m of months(); track m.month) {
                    <span class="min-w-8 flex-1 text-center text-micro text-fg-muted">{{
                      m.month + '-01' | localDay: 'MMM yy'
                    }}</span>
                  }
                </div>
                <details class="mt-4">
                  <summary class="cursor-pointer text-meta font-semibold text-accent">
                    {{ 'feedback.insights.showTable' | transloco }}
                  </summary>
                  <div class="mt-2 overflow-x-auto">
                    <table
                      class="w-full min-w-[480px] text-left text-meta"
                      data-testid="insights-trend"
                    >
                      <thead class="text-fg-muted">
                        <tr>
                          <th scope="col" class="py-1.5 pr-3 font-semibold">
                            {{ 'feedback.insights.month' | transloco }}
                          </th>
                          <th scope="col" class="py-1.5 pr-3 font-semibold">
                            {{ 'feedback.insights.tiles.total' | transloco }}
                          </th>
                          <th scope="col" class="py-1.5 pr-3 font-semibold">
                            {{ 'feedback.kinds.complaint' | transloco }}
                          </th>
                          <th scope="col" class="py-1.5 pr-3 font-semibold">
                            {{ 'feedback.kinds.compliment' | transloco }}
                          </th>
                          <th scope="col" class="py-1.5 font-semibold">
                            {{ 'feedback.insights.tiles.satisfaction' | transloco }}
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-border">
                        @for (m of months(); track m.month) {
                          <tr>
                            <th scope="row" class="py-1.5 pr-3 font-normal text-fg">
                              {{ m.month + '-01' | localDay: 'MMMM y' }}
                            </th>
                            @for (c of m.cells; track c.key) {
                              <td class="py-1.5 pr-3">
                                @if (c.count) {
                                  <a
                                    routerLink="/feedback"
                                    [queryParams]="c.query"
                                    class="font-semibold text-accent hover:underline"
                                    [attr.data-testid]="'trend-' + m.month + '-' + c.key"
                                    >{{ c.count }}</a
                                  >
                                } @else {
                                  0
                                }
                              </td>
                            }
                            <td class="py-1.5">
                              {{
                                m.average_satisfaction === null
                                  ? '–'
                                  : (m.average_satisfaction | localNumber: '1.1-1')
                              }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </details>
              }
            </app-card>
          }
        }
      }

      <app-card class="mt-4 block">
        <app-feedback-themes
          [assistInput]="themesInput()"
          [disabled]="(stats()?.total ?? 0) === 0 && (stats()?.survey_responses ?? 0) === 0"
        />
      </app-card>
    </section>
  `,
})
export class FeedbackStatsPanel {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  private static nextId = 0;
  protected readonly headingId = `cf-fb-stats-${FeedbackStatsPanel.nextId++}`;
  protected readonly periods = PERIODS;

  protected readonly period = signal<Period>('12');
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly stats = signal<FeedbackStats | null>(null);
  protected readonly exporting = signal(false);

  protected readonly from = computed(() => periodStart(Number(this.period())));
  protected readonly themesInput = computed(() => ({ from: this.from() }));
  private readonly window = computed(() => periodQuery(this.stats()));

  protected readonly tiles = computed<PanelTile[]>(() => {
    const s = this.stats();
    if (!s) {
      return [];
    }
    const dash = '–';
    return [
      {
        key: 'total',
        value: s.total,
        tone: 'neutral',
        hintKey: 'feedback.insights.hints.total',
        hintParams: { count: s.complaints ?? s.by_kind['complaint'] ?? 0 },
        link: '/feedback',
        query: this.window(),
      },
      {
        key: 'daysToResolve',
        value: round1(s.average_days_to_resolve) ?? dash,
        tone: 'neutral',
        hintKey: 'feedback.insights.hints.daysToResolve',
        hintParams: {},
        link: null,
        query: null,
      },
      {
        key: 'surveyScore',
        value: round1(s.survey_average_score) ?? dash,
        tone: scoreLevel(s.survey_average_score),
        hintKey: 'feedback.insights.hints.surveyScore',
        hintParams: { count: s.survey_responses },
        // The answers the score is built from, in the same period (the hint's count).
        link: '/feedback/answers',
        query: { submitted_from: s.from_date, submitted_to: s.to_date },
      },
      {
        key: 'nps',
        value: round1(s.nps) ?? dash,
        tone: npsLevel(s.nps),
        hintKey: 'feedback.insights.hints.nps',
        hintParams: { count: s.nps_responses ?? 0 },
        link: '/feedback/surveys',
        query: null,
      },
    ];
  });

  protected readonly handling = computed(() => {
    const s = this.stats();
    const total = s?.complaints ?? 0;
    const counts: Record<HandlingRow, number> = {
      assessed: s?.complaints_assessed ?? 0,
      justified: s?.complaints_justified ?? 0,
      replied: s?.complaints_replied ?? 0,
    };
    const win = this.window();
    return HANDLING_ROWS.map((key) => ({
      key,
      count: counts[key],
      percent: percentOf(counts[key], total),
      query: { ...win, ...handlingQuery(key) },
    }));
  });

  protected readonly breakdowns = computed(() => {
    const s = this.stats();
    if (!s) {
      return [];
    }
    const win = this.window();
    const withWindow = (rows: BreakdownRow[]) =>
      rows.map((r) => ({ ...r, query: { ...win, ...r.query } }));
    return [
      {
        titleKey: 'feedback.insights.byKind',
        rows: withWindow(breakdown(s.by_kind, FEEDBACK_KINDS, 'feedback.kinds', 'kind')),
      },
      {
        titleKey: 'feedback.insights.byStatus',
        rows: withWindow(breakdown(s.by_status, FEEDBACK_STATUSES, 'feedback.status', 'status')),
      },
      {
        titleKey: 'feedback.insights.bySource',
        rows: withWindow(
          breakdown(s.by_source ?? {}, FEEDBACK_SOURCES, 'feedback.sources', 'source'),
        ),
      },
      {
        titleKey: 'feedback.insights.byChannel',
        rows: withWindow(
          breakdown(s.by_channel, FEEDBACK_CHANNELS, 'feedback.channels', 'channel'),
        ),
      },
      {
        titleKey: 'feedback.insights.bySentiment',
        rows: withWindow(
          breakdown(s.by_sentiment, FEEDBACK_SENTIMENTS, 'feedback.sentiments', 'sentiment'),
        ),
      },
      {
        titleKey: 'feedback.insights.byCategory',
        rows: withWindow(categoryRows(s.by_category)),
      },
    ];
  });

  /** The trend months; each bar and table count opens that month's records. */
  protected readonly months = computed(() => {
    const s = this.stats();
    return trimmedMonths(s?.monthly ?? []).map((m: MonthlyStat) => {
      const query = monthQuery(m.month, s);
      return {
        ...m,
        query,
        cells: [
          { key: 'total', count: m.total, query },
          { key: 'complaints', count: m.complaints, query: { ...query, kind: 'complaint' } },
          { key: 'compliments', count: m.compliments, query: { ...query, kind: 'compliment' } },
        ],
      };
    });
  });
  private readonly maxMonthly = computed(() => Math.max(1, ...this.months().map((m) => m.total)));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const from = this.from();
      untracked(() => this.load(orgId, from));
    });
  }

  protected setPeriod(value: string): void {
    this.period.set((PERIODS as readonly string[]).includes(value) ? (value as Period) : '12');
  }

  /** Bar height in % of the chart (an empty month keeps a thin baseline). */
  protected barHeight(total: number): number {
    return total > 0 ? Math.max(4, Math.round((total / this.maxMonthly()) * 82)) : 0;
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.from());
  }

  protected export(format: ExportFormat): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.api.exportStats(orgId, format, this.language.active(), this.from()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(
          blob,
          exportFileName(this.language.translate('feedback.export.insightsFile'), format),
        );
      },
      error: (error: unknown) => {
        this.exporting.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, from: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.stats(orgId, from).subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
