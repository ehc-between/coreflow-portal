import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { bcp47ForLang } from '../../../core/i18n/locale';
import { LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { StatsMonthCount } from '../../../core/deviations/deviation.models';
import { maxCount } from './stats-bars';

/**
 * Dependency-free monthly column chart for a `YYYY-MM` trend series (e.g.
 * deviations opened over time). Columns scale to the tallest bucket; month
 * labels are localised to the active language. Shared by the deviation stats
 * page and the dashboard.
 */
@Component({
  selector: 'app-trend-chart',
  imports: [TranslocoPipe, LocalNumberPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (points().length === 0) {
      <p class="py-2 text-[13px] text-fg-subtle">
        {{ 'deviations.stats.noData' | transloco }}
      </p>
    } @else {
      <div class="flex items-end gap-2" [style.height.px]="height()">
        @for (point of points(); track point.month) {
          <div class="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span class="text-[11px] font-semibold text-fg-muted">{{
              point.count | localNumber
            }}</span>
            <div
              class="w-full max-w-[40px] rounded-t-[4px] bg-accent"
              [style.height.%]="columnHeight(point.count)"
              [title]="point.count"
            ></div>
            <span class="text-[10.5px] whitespace-nowrap text-fg-subtle">{{
              monthLabel(point.month)
            }}</span>
          </div>
        }
      </div>
    }
  `,
})
export class TrendChart {
  private readonly language = inject(LanguageService);

  readonly points = input.required<readonly StatsMonthCount[]>();
  /** Chart height in px. */
  readonly height = input(160);

  private readonly max = computed(() => maxCount(this.points()));

  protected columnHeight(count: number): number {
    const max = this.max();
    return max === 0 ? 0 : Math.round((count / max) * 100);
  }

  protected monthLabel(month: string): string {
    // `month` is `YYYY-MM`; render as a short localised month + 2-digit year.
    const [year, m] = month.split('-');
    const date = new Date(Number(year), Number(m) - 1, 1);
    return new Intl.DateTimeFormat(bcp47ForLang(this.language.active()), {
      month: 'short',
      year: '2-digit',
    }).format(date);
  }
}
