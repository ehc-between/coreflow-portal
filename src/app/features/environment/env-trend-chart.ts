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

/** The short axis label: the month name ("okt."), the quarter or the year. */
export function axisLabel(period: string, bucket: TrendBucket, lang: string): string {
  const [y, m] = period.split('-').map(Number);
  if (bucket !== 'month') {
    return periodLabel(period, bucket, lang);
  }
  return new Intl.DateTimeFormat(bcp47ForLang(lang), { month: 'short' }).format(
    new Date(y, m - 1, 1),
  );
}

/** An annual target as a value per bucket (month: /12, quarter: /4). */
export function targetPerBucket(
  target: number | null | undefined,
  bucket: TrendBucket,
): number | null {
  if (target === null || target === undefined) {
    return null;
  }
  return bucket === 'month' ? target / 12 : bucket === 'quarter' ? target / 4 : target;
}

/** A "nice" axis maximum (1, 2, 2.5, 5 × 10^n) at or above `value`. */
export function niceMax(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * exp >= value) {
      return step * exp;
    }
  }
  return 10 * exp;
}

/**
 * A single-series column chart of a metric's trend: a y-axis in the metric's unit
 * (0, half and the top), every period labelled (the year under each January), and
 * the target per period as a dashed line when the metric has one. Each column is
 * focusable and shows its value (and CO₂e) on hover or focus; the same numbers are
 * available as a table below the chart.
 */
@Component({
  selector: 'app-env-trend-chart',
  imports: [TranslocoPipe, LocalNumberPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (points().length === 0) {
      <p class="py-4 text-ui text-fg-subtle" data-testid="trend-empty">
        {{ 'environment.metric.trendEmpty' | transloco }}
      </p>
    } @else {
      <div class="flex gap-2">
        <div
          class="relative w-12 flex-none text-right text-micro text-fg-subtle"
          [style.height.px]="height()"
          aria-hidden="true"
          data-testid="trend-axis"
        >
          @for (tick of ticks(); track tick.pct) {
            <span class="absolute right-0 translate-y-1/2" [style.bottom.%]="tick.pct">
              {{ tick.value | localNumber: '1.0-1' }}
            </span>
          }
        </div>
        <div class="relative min-w-0 flex-1">
          @for (tick of ticks(); track tick.pct) {
            <div
              class="pointer-events-none absolute inset-x-0 border-t border-border/60"
              [style.bottom.%]="tick.pct"
              aria-hidden="true"
            ></div>
          }
          @if (targetPct(); as pct) {
            <div
              class="pointer-events-none absolute inset-x-0 z-[1] border-t-2 border-dashed border-pass"
              [style.bottom.%]="pct"
              data-testid="trend-target"
              aria-hidden="true"
            >
              <span
                class="absolute -top-5 right-0 rounded bg-surface px-1 text-micro font-semibold text-pass-ink"
              >
                {{ 'environment.metric.targetLine' | transloco }}
              </span>
            </div>
          }
          <div
            class="relative flex items-end gap-[2px] border-b border-border"
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
                [attr.aria-label]="
                  label(p) + ': ' + (p.value | localNumber: '1.0-2') + ' ' + unit()
                "
              >
                <span
                  class="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-tile border border-border bg-surface px-2 py-1 text-meta whitespace-nowrap text-fg shadow-card group-hover:block group-focus:block"
                  aria-hidden="true"
                >
                  {{ label(p) }}: {{ p.value | localNumber: '1.0-2' }} {{ unit() }}
                  @if (p.co2e_kg !== null) {
                    · {{ p.co2e_kg | localNumber: '1.0-1' }} kg CO₂e
                  }
                </span>
                <div
                  class="w-full max-w-[40px] rounded-t bg-accent group-hover:opacity-80 group-focus:ring-2 group-focus:ring-accent"
                  [style.height.%]="columnHeight(p.value)"
                ></div>
              </div>
            }
          </div>
          <div class="mt-1 flex gap-[2px]" aria-hidden="true">
            @for (p of points(); track p.period; let i = $index) {
              <span
                class="min-w-0 flex-1 text-center text-micro leading-tight text-fg-subtle"
                [class.max-sm:invisible]="i % 2 === 1 && points().length > 12"
              >
                <span class="block truncate">{{ short(p) }}</span>
                @if (yearMark(p, i); as year) {
                  <span class="block font-semibold text-fg-muted">{{ year }}</span>
                }
              </span>
            }
          </div>
        </div>
      </div>
      <p class="mt-2 text-meta text-fg-subtle">
        {{ 'environment.metric.axisUnit' | transloco: { unit: unit() } }}
      </p>
      <details class="mt-3">
        <summary class="cursor-pointer text-ui font-semibold text-accent">
          {{ 'environment.metric.showTable' | transloco }}
        </summary>
        <div class="mt-2 overflow-x-auto">
          <table class="w-full text-left text-ui" data-testid="trend-table">
            <thead class="text-meta text-fg-subtle">
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
                    {{ p.co2e_kg === null ? '–' : (p.co2e_kg | localNumber: '1.2-2') }}
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
  /** The metric's annual target (shown per period), if it has one. */
  readonly target = input<number | null | undefined>(null);
  readonly height = input(180);

  private readonly targetValue = computed(() => targetPerBucket(this.target(), this.bucket()));

  /** The axis top: a round number above the largest value and the target. */
  private readonly max = computed(() =>
    niceMax(Math.max(0, this.targetValue() ?? 0, ...this.points().map((p) => p.value))),
  );

  protected readonly ticks = computed(() => {
    const max = this.max();
    return [0, 0.5, 1].map((f) => ({ pct: f * 100, value: f * max }));
  });

  protected readonly targetPct = computed(() => {
    const target = this.targetValue();
    return target === null ? null : Math.min(100, (target / this.max()) * 100);
  });

  protected columnHeight(value: number): number {
    const max = this.max();
    return max === 0 || value === 0 ? 0 : Math.max(1, (value / max) * 100);
  }

  protected label(p: TrendPoint): string {
    return periodLabel(p.period, this.bucket(), this.language.active());
  }

  protected short(p: TrendPoint): string {
    return axisLabel(p.period, this.bucket(), this.language.active());
  }

  /** The year under the first column and under each January (month bucket only). */
  protected yearMark(p: TrendPoint, index: number): string | null {
    if (this.bucket() !== 'month') {
      return null;
    }
    const [y, m] = p.period.split('-').map(Number);
    return index === 0 || m === 1 ? String(y) : null;
  }
}
