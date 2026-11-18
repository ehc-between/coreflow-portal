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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
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
  FEEDBACK_ENTITY,
  FEEDBACK_KINDS,
  FEEDBACK_SENTIMENTS,
  FEEDBACK_STATUSES,
  FeedbackStats,
  MonthlyStat,
} from '../data/feedback.models';
import { FeedbackExportMenu } from '../export-menu';
import { FEEDBACK_NAV, FEEDBACK_SETTINGS_LINK } from '../feedback-nav';
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

interface InsightTile {
  readonly key: string;
  readonly value: string | number;
  readonly tone: KpiTone;
  readonly hintKey: string;
  readonly hintParams: Record<string, unknown>;
  readonly link: string | null;
  readonly query: Readonly<Record<string, string | undefined>> | null;
}

/**
 * Customer satisfaction insights (`/feedback/insights`), the evidence for ISO 9001
 * 9.1.2 and the management review: tiles that say what each figure means (and open
 * the matching records), complaint handling (assessed, justified, answered),
 * breakdowns that drill down to the register, a monthly chart, the survey score
 * and NPS, an export for the audit file, and an AI summary of themes.
 */
@Component({
  selector: 'app-feedback-insights',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    WhyItMatters,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    ModuleNav,
    PageHeader,
    FeedbackExportMenu,
    FeedbackThemes,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="feedback.insights.title"
        descriptionKey="feedback.insights.subtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.feedback', link: '/feedback' },
          { labelKey: 'feedback.tabs.insights' },
        ]"
        [settingsLink]="settingsLink"
      >
        <a
          secondary
          routerLink="/management-review"
          class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          data-testid="to-management-review"
        >
          <app-icon name="reports" [size]="14" />
          {{ 'feedback.insights.toManagementReview' | transloco }}
        </a>
        <app-feedback-export-menu secondary [busy]="exporting()" (chosen)="export($event)" />
      </app-page-header>
      <app-module-nav labelKey="modules.names.feedback" [items]="nav" />
      <app-help-strip scope="feedback" page="insights" lesson="measuring-satisfaction" />

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <label for="cf-fb-period" class="text-ui font-semibold text-fg-muted">
          {{ 'feedback.insights.period' | transloco }}
        </label>
        <select
          id="cf-fb-period"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none"
          (change)="setPeriod($any($event.target).value)"
          data-testid="insights-period"
        >
          @for (p of periods; track p) {
            <option [value]="p" [selected]="period() === p">
              {{ 'feedback.insights.months' | transloco: { count: p } }}
            </option>
          }
        </select>
        @if (stats(); as s) {
          <span class="text-meta text-fg-muted" data-testid="insights-range">
            {{
              'feedback.insights.range'
                | transloco: { from: (s.from_date | localDay), to: (s.to_date | localDay) }
            }}
          </span>
        }
      </div>

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (stats(); as s) {
            <div
              class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              data-testid="insights-kpis"
            >
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

            <app-card class="mt-6 block">
              <h2 class="mb-1 font-display text-card font-bold text-fg">
                {{ 'feedback.insights.handling.title' | transloco }}
              </h2>
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
                    <li
                      class="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 text-ui sm:grid-cols-[220px_minmax(0,1fr)_88px]"
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
                      <span class="text-right text-fg-muted">{{
                        'feedback.insights.handling.ofTotal'
                          | transloco: { count: h.count, total: s.complaints, percent: h.percent }
                      }}</span>
                    </li>
                  }
                </ul>
                <a
                  routerLink="/feedback"
                  [queryParams]="{ kind: 'complaint', justified: 'yes' }"
                  class="mt-3 inline-block text-meta font-semibold text-accent hover:underline"
                >
                  {{ 'feedback.insights.handling.openJustified' | transloco }}
                </a>
              }
            </app-card>

            <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              @for (b of breakdowns(); track b.titleKey) {
                <app-card>
                  <h2 class="mb-3 font-display text-card font-bold text-fg">
                    {{ b.titleKey | transloco }}
                  </h2>
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

            <app-card class="mt-6 block">
              <h2 class="mb-1 font-display text-card font-bold text-fg">
                {{ 'feedback.insights.trend' | transloco }}
              </h2>
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
                  role="img"
                  [attr.aria-label]="'feedback.insights.chartLabel' | transloco"
                  data-testid="insights-chart"
                >
                  @for (m of months(); track m.month) {
                    <div class="flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1">
                      <span class="text-micro text-fg-muted">{{ m.total || '' }}</span>
                      <div
                        class="flex w-full max-w-10 flex-col justify-end overflow-hidden rounded-t-md"
                        [style.height.%]="barHeight(m.total)"
                      >
                        <span
                          class="block w-full bg-accent"
                          [style.flex-grow]="m.total - m.complaints"
                        ></span>
                        <span class="block w-full bg-warn" [style.flex-grow]="m.complaints"></span>
                      </div>
                    </div>
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
                            <td class="py-1.5 pr-3">{{ m.total }}</td>
                            <td class="py-1.5 pr-3">{{ m.complaints }}</td>
                            <td class="py-1.5 pr-3">{{ m.compliments }}</td>
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

      <app-card class="mt-6 block">
        <app-feedback-themes
          [assistInput]="themesInput()"
          [disabled]="(stats()?.total ?? 0) === 0"
        />
      </app-card>

      <div class="mt-6">
        <app-why-it-matters scope="feedback" page="insights" />
      </div>
    </div>
  `,
})
export class FeedbackInsights {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  protected readonly periods = PERIODS;
  protected readonly nav = FEEDBACK_NAV;
  protected readonly settingsLink = FEEDBACK_SETTINGS_LINK;

  protected readonly period = signal<Period>('12');
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly stats = signal<FeedbackStats | null>(null);
  protected readonly exporting = signal(false);

  protected readonly from = computed(() => periodStart(Number(this.period())));
  protected readonly themesInput = computed(() => ({ from: this.from() }));

  protected readonly tiles = computed<InsightTile[]>(() => {
    const s = this.stats();
    if (!s) {
      return [];
    }
    const dash = '–';
    const tiles: InsightTile[] = [
      {
        key: 'total',
        value: s.total,
        tone: 'neutral',
        hintKey: 'feedback.insights.hints.total',
        hintParams: { count: s.complaints ?? s.by_kind['complaint'] ?? 0 },
        link: '/feedback',
        query: null,
      },
      {
        key: 'openComplaints',
        value: s.open_complaints,
        tone: s.open_complaints ? 'warn' : 'pass',
        hintKey: 'feedback.insights.hints.openComplaints',
        hintParams: {},
        link: '/feedback',
        query: { kind: 'complaint', status: 'open' },
      },
      {
        key: 'overdue',
        value: s.overdue,
        tone: s.overdue ? 'warn' : 'pass',
        hintKey: 'feedback.insights.hints.overdue',
        hintParams: {},
        link: '/feedback',
        query: { overdue: '1' },
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
        key: 'satisfaction',
        value: round1(s.average_satisfaction) ?? dash,
        tone: 'accent',
        hintKey: 'feedback.insights.hints.satisfaction',
        hintParams: { count: s.satisfaction_count },
        link: null,
        query: null,
      },
      {
        key: 'surveyScore',
        value: round1(s.survey_average_score) ?? dash,
        tone: scoreLevel(s.survey_average_score),
        hintKey: 'feedback.insights.hints.surveyScore',
        hintParams: { count: s.survey_responses },
        link: '/feedback/surveys',
        query: null,
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
      {
        key: 'surveyResponses',
        value: s.survey_responses,
        tone: 'neutral',
        hintKey: 'feedback.insights.hints.surveyResponses',
        hintParams: {},
        link: '/feedback/surveys',
        query: null,
      },
    ];
    return tiles;
  });

  protected readonly handling = computed(() => {
    const s = this.stats();
    const total = s?.complaints ?? 0;
    const row = (key: string, count: number) => ({ key, count, percent: percentOf(count, total) });
    return [
      row('assessed', s?.complaints_assessed ?? 0),
      row('justified', s?.complaints_justified ?? 0),
      row('replied', s?.complaints_replied ?? 0),
    ];
  });

  protected readonly breakdowns = computed(() => {
    const s = this.stats();
    if (!s) {
      return [];
    }
    const groups = [
      {
        titleKey: 'feedback.insights.byKind',
        rows: breakdown(s.by_kind, FEEDBACK_KINDS, 'feedback.kinds', 'kind'),
      },
      {
        titleKey: 'feedback.insights.byStatus',
        rows: breakdown(s.by_status, FEEDBACK_STATUSES, 'feedback.status', 'status'),
      },
      {
        titleKey: 'feedback.insights.byChannel',
        rows: breakdown(s.by_channel, FEEDBACK_CHANNELS, 'feedback.channels', 'channel'),
      },
      {
        titleKey: 'feedback.insights.byCategory',
        rows: categoryRows(s.by_category),
      },
      {
        titleKey: 'feedback.insights.bySentiment',
        rows: breakdown(s.by_sentiment, FEEDBACK_SENTIMENTS, 'feedback.sentiments'),
      },
    ];
    return groups;
  });

  protected readonly months = computed<readonly MonthlyStat[]>(() =>
    trimmedMonths(this.stats()?.monthly ?? []),
  );
  private readonly maxMonthly = computed(() => Math.max(1, ...this.months().map((m) => m.total)));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'feedback',
      entityType: FEEDBACK_ENTITY,
      view: 'dashboard',
      title: this.language.translate('feedback.insights.title'),
    }));
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
