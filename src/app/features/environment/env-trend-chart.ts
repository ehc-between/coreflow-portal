import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { bcp47ForLang } from '../../core/i18n/locale';
import { LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { TrendBucket, TrendPoint } from './data/environment.models';

/** The label of a trend period (`YYYY-MM-DD`, first day of the bucket). */
export function periodLabel(period: string, bucket: TrendBucket, lang: string): string {
  const [y, m] = period.split('-').map(Number);
  if (bucket === 'year') {
    return String(y);
  }
  if (bucket === 'quarter') {
    return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  }
  return new Intl.DateTimeFormat(bcp47ForLang(lang), { month: 'short', year: '2-digit' }).format(
    new Date(y, m - 1, 1),
  );
}

/**
 * A single-series column chart of a metric's trend (one accent hue, columns
 * anchored to the baseline with rounded tops). Each column is focusable and has
 * a tooltip; the same numbers are available as a table below the chart.
 */
@Component({
  selector: 'app-env-trend-chart',
  imports: [TranslocoPipe, LocalNumberPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (points().length === 0) {
      <p class="py-4 text-[13px] text-fg-subtle" data-testid="trend-empty">
        {{ 'environment.metric.trendEmpty' | transloco }}
      </p>
    } @else {
      <div
        class="flex items-end gap-[2px] border-b border-border"
        [style.height.px]="height()"
        role="list"
        [attr.aria-label]="'environment.metric.trendLabel' | transloco: { unit: unit() }"
        data-testid="trend-chart"
      >
        @for (p of points(); track p.period) {
          <div
            class="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none"
            role="listitem"
            tabindex="0"
            [attr.aria-label]="label(p) + ': ' + (p.value | localNumber: '1.0-2') + ' ' + unit()"
          >
            <span
              class="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-[6px] border border-border bg-surface px-2 py-1 text-[11.5px] whitespace-nowrap text-fg shadow-card group-hover:block group-focus:block"
              aria-hidden="true"
            >
              {{ label(p) }}: {{ p.value | localNumber: '1.0-2' }} {{ unit() }}
              @if (p.co2e_kg !== null) {
                · {{ p.co2e_kg | localNumber: '1.0-1' }} kg CO₂e
              }
            </span>
            <div
              class="w-full max-w-[40px] rounded-t-[4px] bg-accent group-hover:opacity-80 group-focus:ring-2 group-focus:ring-accent"
              [style.height.%]="columnHeight(p.value)"
            ></div>
          </div>
        }
      </div>
      <div class="mt-1 flex gap-[2px]" aria-hidden="true">
        @for (p of points(); track p.period; let i = $index) {
          <span class="min-w-0 flex-1 truncate text-center text-[10.5px] text-fg-subtle">
            {{ showLabel(i) ? label(p) : '' }}
          </span>
        }
      </div>

      <details class="mt-3">
        <summary class="cursor-pointer text-[12.5px] font-semibold text-accent">
          {{ 'environment.metric.showTable' | transloco }}
        </summary>
        <div class="mt-2 overflow-x-auto">
          <table class="w-full text-left text-[12.5px]" data-testid="trend-table">
            <thead class="text-fg-subtle">
              <tr>
                <th scope="col" class="py-1 pr-3 font-semibold">
                  {{ 'environment.metric.period' | transloco }}
                </th>
                <th scope="col" class="py-1 pr-3 text-right font-semibold">
                  {{ 'environment.metric.value' | transloco }} ({{ unit() }})
                </th>
                <th scope="col" class="py-1 pr-3 text-right font-semibold">kg CO₂e</th>
                <th scope="col" class="py-1 text-right font-semibold">
                  {{ 'environment.metric.change' | transloco }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border text-fg">
              @for (p of points(); track p.period) {
                <tr>
                  <td class="py-1 pr-3">{{ label(p) }}</td>
                  <td class="py-1 pr-3 text-right">{{ p.value | localNumber: '1.0-2' }}</td>
                  <td class="py-1 pr-3 text-right">
                    {{ p.co2e_kg === null ? '–' : (p.co2e_kg | localNumber: '1.0-1') }}
                  </td>
                  <td class="py-1 text-right">
                    {{ p.change_pct === null ? '–' : (p.change_pct | localNumber: '1.0-1') + ' %' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </details>
    }
  `,
})
export class EnvTrendChart {
  private readonly language = inject(LanguageService);

  readonly points = input.required<readonly TrendPoint[]>();
  readonly bucket = input<TrendBucket>('month');
  readonly unit = input('');
  readonly height = input(160);

  private readonly max = computed(() => Math.max(0, ...this.points().map((p) => p.value)));
  /** Show every n-th axis label so they do not collide on narrow screens. */
  private readonly labelStep = computed(() => Math.max(1, Math.ceil(this.points().length / 8)));

  protected columnHeight(value: number): number {
    const max = this.max();
    return max === 0 || value === 0 ? 0 : Math.max(1, Math.round((value / max) * 100));
  }

  protected label(p: TrendPoint): string {
    return periodLabel(p.period, this.bucket(), this.language.active());
  }

  protected showLabel(index: number): boolean {
    return index % this.labelStep() === 0;
  }
}
