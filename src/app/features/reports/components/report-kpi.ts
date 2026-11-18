import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LanguageService } from '../../../core/i18n/language.service';
import { trendDirection } from '../data/report-display';
import { TrendSeries } from '../data/reports.models';
import { pluralKey } from '../../../shared/i18n/plural';
import { Sparkline } from './sparkline';

export type ReportKpiTone = 'pass' | 'warn' | 'accent' | 'info' | 'neutral';

const DOT: Readonly<Record<ReportKpiTone, string>> = {
  pass: 'bg-pass',
  warn: 'bg-warn',
  accent: 'bg-accent',
  info: 'bg-info',
  neutral: 'bg-fg-subtle',
};

/**
 * A key number of the Reports overview: label, value, a one-line explanation (what
 * the number counts) and, once the monthly history exists, a 12-month sparkline
 * with the change since last month in plain words ("2 færre enn forrige måned",
 * coloured by whether that is good news). The whole tile links to the list behind
 * the number.
 */
@Component({
  selector: 'app-report-kpi',
  imports: [RouterLink, Sparkline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <a
      [routerLink]="link()"
      [queryParams]="queryParams()"
      class="flex h-full flex-col gap-1.5 rounded-card border border-border bg-surface px-4 py-3.5 shadow-card transition-colors hover:border-accent-border focus-visible:outline-2 focus-visible:outline-accent"
      [attr.data-testid]="testId()"
    >
      <span class="flex items-center gap-1.5 text-meta font-semibold text-fg-muted">
        <span class="h-2 w-2 flex-none rounded-full" [class]="dot()"></span>
        {{ label() }}
      </span>
      <span class="flex items-end justify-between gap-2">
        <span class="font-display text-page leading-none font-bold text-fg">{{ value() }}</span>
        @if (trend(); as t) {
          <app-sparkline [data]="t.points" [width]="84" [height]="26" />
        }
      </span>
      @if (hint()) {
        <span class="text-meta text-fg-muted">{{ hint() }}</span>
      }
      @if (deltaText(); as text) {
        <span
          class="text-meta font-semibold"
          [class.text-pass-ink]="direction() === 'better'"
          [class.text-warn-ink]="direction() === 'worse'"
          [class.text-fg-subtle]="direction() === 'same'"
          >{{ text }}</span
        >
      }
    </a>
  `,
})
export class ReportKpi {
  private readonly language = inject(LanguageService);

  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input('');
  readonly tone = input<ReportKpiTone>('neutral');
  readonly link = input.required<string>();
  readonly queryParams = input<Record<string, string> | null>(null);
  readonly trend = input<TrendSeries | null>(null);
  readonly testId = input<string | null>(null);

  protected readonly dot = computed(() => DOT[this.tone()]);
  protected readonly direction = computed(() => {
    const t = this.trend();
    return t ? trendDirection(t) : 'same';
  });

  /** "3 more than last month" / "2 percentage points lower" / "No change since last month". */
  protected readonly deltaText = computed(() => {
    const t = this.trend();
    if (!t || t.delta === null || t.delta === undefined || t.points.length < 2) {
      return '';
    }
    const amount = Math.abs(Math.round(t.delta));
    if (amount === 0) {
      return this.language.translate('reports.trends.same');
    }
    const unit = t.unit === 'percent' ? 'Points' : 'Count';
    const way = t.delta > 0 ? 'up' : 'down';
    return this.language.translate(pluralKey(`reports.trends.${way}${unit}`, amount), {
      count: amount,
    });
  });
}
