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
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Card } from '../../../shared/ui/card/card';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { FeedbackApi } from '../data/feedback-api';
import { addDays, npsTone, percentOf, round1 } from '../data/feedback-display';
import {
  FEEDBACK_CHANNELS,
  FEEDBACK_KINDS,
  FEEDBACK_SENTIMENTS,
  FEEDBACK_STATUSES,
  FeedbackStats,
} from '../data/feedback.models';
import { FeedbackTabs } from '../feedback-tabs';
import { FeedbackLessonLink } from '../lesson-link';
import { FeedbackThemes } from '../themes-panel';

export const PERIODS = ['3', '6', '12', '24'] as const;
export type Period = (typeof PERIODS)[number];

export interface BreakdownRow {
  readonly key: string;
  readonly labelKey: string;
  readonly count: number;
  readonly percent: number;
}

/** A breakdown in a fixed order (every known value, zeros included). */
export function breakdown(
  counts: Readonly<Record<string, number>>,
  keys: readonly string[],
  prefix: string,
): BreakdownRow[] {
  const total = keys.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
  return keys.map((key) => ({
    key,
    labelKey: `${prefix}.${key}`,
    count: counts[key] ?? 0,
    percent: percentOf(counts[key] ?? 0, total),
  }));
}

/** The first day of the month `months` months before today (ISO day). */
export function periodStart(months: number, today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);
  return addDays(0, d);
}

/**
 * Customer satisfaction insights (`/feedback/insights`), the evidence for ISO 9001
 * 9.1.2: volumes by kind, status, channel and sentiment, open and overdue
 * complaints, average satisfaction, time to resolve, a monthly trend, survey
 * responses and NPS, plus an AI summary of themes and trends.
 */
@Component({
  selector: 'app-feedback-insights',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    GuideIntro,
    WhyItMatters,
    Card,
    KpiTile,
    FeedbackTabs,
    FeedbackLessonLink,
    FeedbackThemes,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ 'feedback.insights.title' | transloco }}
      </h1>
      <p class="mt-1 mb-3 text-[14px] text-fg-muted">
        {{ 'feedback.insights.subtitle' | transloco }}
      </p>
      <app-feedback-tabs />
      <div class="mb-4"><app-guide-intro scope="feedback" page="insights" /></div>

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <label for="cf-fb-period" class="text-[13px] font-semibold text-fg-muted">
          {{ 'feedback.insights.period' | transloco }}
        </label>
        <select
          id="cf-fb-period"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          <span class="text-[12.5px] text-fg-subtle">
            {{
              'feedback.insights.range'
                | transloco: { from: (s.from_date | localDay), to: (s.to_date | localDay) }
            }}
          </span>
        }
      </div>

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
          @if (stats(); as s) {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="insights-kpis">
              <app-kpi-tile [label]="'feedback.insights.total' | transloco" [value]="s.total" />
              <app-kpi-tile
                [label]="'feedback.insights.openComplaints' | transloco"
                [value]="s.open_complaints"
                [tone]="s.open_complaints ? 'warn' : 'pass'"
              />
              <app-kpi-tile
                [label]="'feedback.insights.overdue' | transloco"
                [value]="s.overdue"
                [tone]="s.overdue ? 'fail' : 'pass'"
              />
              <app-kpi-tile
                [label]="'feedback.insights.satisfaction' | transloco"
                [value]="round1(s.average_satisfaction) ?? '–'"
                [delta]="
                  'feedback.insights.satisfactionCount' | transloco: { count: s.satisfaction_count }
                "
                tone="accent"
              />
              <app-kpi-tile
                [label]="'feedback.insights.daysToResolve' | transloco"
                [value]="round1(s.average_days_to_resolve) ?? '–'"
              />
              <app-kpi-tile
                [label]="'feedback.insights.surveyResponses' | transloco"
                [value]="s.survey_responses"
              />
              <app-kpi-tile
                [label]="'feedback.insights.surveyScore' | transloco"
                [value]="round1(s.survey_average_score) ?? '–'"
              />
              <app-kpi-tile
                [label]="'feedback.insights.nps' | transloco"
                [value]="round1(s.nps) ?? '–'"
                [tone]="npsTone(s.nps)"
              />
            </div>

            <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              @for (b of breakdowns(); track b.titleKey) {
                <app-card>
                  <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                    {{ b.titleKey | transloco }}
                  </h2>
                  <ul class="flex flex-col gap-1.5">
                    @for (row of b.rows; track row.key) {
                      <li class="grid grid-cols-[120px_1fr_64px] items-center gap-2 text-[12.5px]">
                        <span class="truncate text-fg">{{ row.labelKey | transloco }}</span>
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
                      </li>
                    }
                  </ul>
                </app-card>
              }
            </div>

            <app-card class="mt-6 block">
              <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                {{ 'feedback.insights.trend' | transloco }}
              </h2>
              @if (s.monthly.length === 0) {
                <p class="text-[13px] text-fg-muted">
                  {{ 'feedback.insights.noData' | transloco }}
                </p>
              } @else {
                <div class="overflow-x-auto">
                  <table
                    class="w-full min-w-[480px] text-left text-[12.5px]"
                    data-testid="insights-trend"
                  >
                    <thead class="text-fg-subtle">
                      <tr>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">
                          {{ 'feedback.insights.month' | transloco }}
                        </th>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">
                          {{ 'feedback.insights.total' | transloco }}
                        </th>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">
                          {{ 'feedback.kinds.complaint' | transloco }}
                        </th>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">
                          {{ 'feedback.kinds.compliment' | transloco }}
                        </th>
                        <th scope="col" class="py-1.5 font-semibold">
                          {{ 'feedback.insights.satisfaction' | transloco }}
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                      @for (m of s.monthly; track m.month) {
                        <tr>
                          <th scope="row" class="py-1.5 pr-3 font-mono font-normal text-fg">
                            {{ m.month }}
                          </th>
                          <td class="py-1.5 pr-3">
                            <span class="inline-flex items-center gap-2">
                              <span
                                class="inline-block h-2 rounded-full bg-accent"
                                [style.width.px]="barWidth(m.total)"
                                aria-hidden="true"
                              ></span>
                              {{ m.total }}
                            </span>
                          </td>
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

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="feedback" page="insights" />
        <app-feedback-lesson-link lesson="measuring-satisfaction" />
      </div>
    </div>
  `,
})
export class FeedbackInsights {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly periods = PERIODS;
  protected readonly round1 = round1;
  protected readonly npsTone = npsTone;

  protected readonly period = signal<Period>('12');
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly stats = signal<FeedbackStats | null>(null);

  protected readonly from = computed(() => periodStart(Number(this.period())));
  protected readonly themesInput = computed(() => ({ from: this.from() }));
  protected readonly breakdowns = computed(() => {
    const s = this.stats();
    if (!s) {
      return [];
    }
    return [
      {
        titleKey: 'feedback.insights.byKind',
        rows: breakdown(s.by_kind, FEEDBACK_KINDS, 'feedback.kinds'),
      },
      {
        titleKey: 'feedback.insights.byStatus',
        rows: breakdown(s.by_status, FEEDBACK_STATUSES, 'feedback.status'),
      },
      {
        titleKey: 'feedback.insights.byChannel',
        rows: breakdown(s.by_channel, FEEDBACK_CHANNELS, 'feedback.channels'),
      },
      {
        titleKey: 'feedback.insights.bySentiment',
        rows: breakdown(s.by_sentiment, FEEDBACK_SENTIMENTS, 'feedback.sentiments'),
      },
    ];
  });
  private readonly maxMonthly = computed(() =>
    Math.max(1, ...(this.stats()?.monthly ?? []).map((m) => m.total)),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'feedback',
      entityType: 'customer_feedback',
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

  protected barWidth(total: number): number {
    return Math.round((total / this.maxMonthly()) * 120);
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
