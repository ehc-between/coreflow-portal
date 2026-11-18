import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { bcp47ForLang } from '../../../core/i18n/locale';
import { LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { StatsMonthCount } from '../../../core/deviations/deviation.models';
import { maxCount } from './stats-bars';

/** One month of the chart: the opened count and (optionally) the closed count. */
interface MonthColumn {
  readonly month: string;
  readonly opened: number;
  readonly closed: number | null;
}

/**
 * Dependency-free monthly column chart for `YYYY-MM` series: deviations opened per
 * month and, when given, closed per month as a second column (the API zero-fills
 * the months, so quiet months show as empty columns instead of disappearing).
 * Month labels follow the active language.
 */
@Component({
  selector: 'app-trend-chart',
  imports: [TranslocoPipe, LocalNumberPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (columns().length === 0) {
      <p class="py-2 text-ui text-fg-muted">
        {{ 'deviations.stats.noData' | transloco }}
      </p>
    } @else {
      @if (hasSecondary()) {
        <div class="mb-3 flex flex-wrap gap-4 text-meta text-fg-muted" aria-hidden="true">
          <span class="inline-flex items-center gap-1.5"
            ><span class="h-2.5 w-2.5 rounded-sm bg-accent"></span
            >{{ 'deviations.stats.trend.opened' | transloco }}</span
          >
          <span class="inline-flex items-center gap-1.5"
            ><span class="h-2.5 w-2.5 rounded-sm bg-pass"></span
            >{{ 'deviations.stats.trend.closed' | transloco }}</span
          >
        </div>
      }
      <div class="overflow-x-auto">
        <div
          class="flex min-w-[480px] items-end gap-1.5"
          [style.height.px]="height()"
          role="img"
          [attr.aria-label]="summary()"
        >
          @for (c of columns(); track c.month) {
            <div class="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span class="text-micro font-semibold text-fg-muted">{{
                c.opened | localNumber
              }}</span>
              <div class="flex h-full w-full max-w-[44px] items-end justify-center gap-0.5">
                <div
                  class="w-full rounded-t bg-accent"
                  [style.height.%]="columnHeight(c.opened)"
                  [title]="c.opened"
                ></div>
                @if (c.closed !== null) {
                  <div
                    class="w-full rounded-t bg-pass"
                    [style.height.%]="columnHeight(c.closed)"
                    [title]="c.closed"
                  ></div>
                }
              </div>
              <span class="text-micro whitespace-nowrap text-fg-muted">{{
                monthLabel(c.month)
              }}</span>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class TrendChart {
  private readonly language = inject(LanguageService);

  readonly points = input.required<readonly StatsMonthCount[]>();
  /** A second series (e.g. closed per month), drawn next to the first. */
  readonly secondary = input<readonly StatsMonthCount[] | null>(null);
  /** Chart height in px. */
  readonly height = input(160);

  protected readonly hasSecondary = computed(() => !!this.secondary()?.length);

  protected readonly columns = computed<MonthColumn[]>(() => {
    const closed = new Map((this.secondary() ?? []).map((p) => [p.month, p.count]));
    const months = [...new Set([...this.points().map((p) => p.month), ...closed.keys()])].sort();
    const opened = new Map(this.points().map((p) => [p.month, p.count]));
    return months.map((month) => ({
      month,
      opened: opened.get(month) ?? 0,
      closed: this.hasSecondary() ? (closed.get(month) ?? 0) : null,
    }));
  });

  private readonly max = computed(() =>
    Math.max(maxCount(this.points()), maxCount(this.secondary() ?? [])),
  );

  protected readonly summary = computed(() =>
    this.language.translate('deviations.stats.trend.aria', {
      months: this.columns().length,
      opened: this.columns().reduce((a, c) => a + c.opened, 0),
      closed: this.columns().reduce((a, c) => a + (c.closed ?? 0), 0),
    }),
  );

  protected columnHeight(count: number): number {
    const max = this.max();
    return max === 0 ? 0 : Math.round((count / max) * 100);
  }

  protected monthLabel(month: string): string {
    const [year, m] = month.split('-');
    const date = new Date(Number(year), Number(m) - 1, 1);
    return new Intl.DateTimeFormat(bcp47ForLang(this.language.active()), {
      month: 'short',
      year: '2-digit',
    }).format(date);
  }
}
