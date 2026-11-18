import { formatDate, formatNumber } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { KpiSeries, SeriesPoint } from '../data/objectives.models';
import { healthColor, healthKey } from '../objectives-display';

const W = 640;
const H = 240;
const PAD = { top: 16, right: 72, bottom: 28, left: 52 };
const TICKS = 4;

interface PlotPoint {
  readonly x: number;
  readonly y: number;
  readonly point: SeriesPoint;
  readonly color: string;
  readonly label: string;
}

/** Round tick values over [min, max] (a "nice" step of 1/2/5 × 10^n). */
export function niceTicks(min: number, max: number, count = TICKS): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

/**
 * A step line through the thresholds in force at each measurement (they are stored
 * per period), continuing with the current value to the right edge. Null when no
 * period nor the KPI has the threshold.
 */
export function stepPath(
  points: readonly { readonly x: number; readonly point: SeriesPoint }[],
  pick: (p: SeriesPoint) => number | null,
  current: number | null,
  y: (v: number) => number,
  left: number,
  right: number,
): string | null {
  // Ranges [from, to] with the threshold that applied there; the boundary between
  // two periods is half-way between their markers, and after the last marker the
  // KPI's current threshold applies.
  const ranges: { from: number; to: number; value: number | null }[] = points.map((p, i) => ({
    from: i === 0 ? left : (points[i - 1].x + p.x) / 2,
    to: i === points.length - 1 ? p.x : (p.x + points[i + 1].x) / 2,
    value: pick(p.point) ?? current,
  }));
  if (points.length > 0) {
    ranges.push({
      from: points[points.length - 1].x,
      to: right,
      value: current ?? pick(points[points.length - 1].point),
    });
  }
  let d = '';
  let drawing = false;
  for (const r of ranges) {
    if (r.value === null) {
      drawing = false;
      continue;
    }
    d += drawing ? ` V${y(r.value)} H${r.to}` : `${d ? ' ' : ''}M${r.from},${y(r.value)} H${r.to}`;
    drawing = true;
  }
  return d || null;
}

/**
 * Line chart of a KPI's measurements over time: one line (2px) with a marker per
 * period coloured and labelled by its status, the target as a dashed step
 * line and the warning threshold as a dotted one, each following the thresholds in
 * force per period (labelled directly), the baseline as a faint reference line,
 * a legend for the marker colours, and a y-axis that starts at zero for
 * non-negative data. Each
 * marker is focusable and shows its period, value and status on hover/focus.
 * The measurement table on the page is the accessible table view of the data.
 */
@Component({
  selector: 'app-kpi-chart',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (plot(); as p) {
      <div class="relative">
        <svg
          [attr.viewBox]="'0 0 ' + width + ' ' + height"
          class="h-auto w-full"
          role="group"
          [attr.aria-label]="'objectives.chart.label' | transloco: { count: p.points.length }"
          data-testid="kpi-chart"
        >
          @for (t of p.ticks; track t.value) {
            <line
              [attr.x1]="pad.left"
              [attr.x2]="width - pad.right"
              [attr.y1]="t.y"
              [attr.y2]="t.y"
              stroke="var(--border)"
              stroke-width="1"
            />
            <text
              [attr.x]="pad.left - 8"
              [attr.y]="t.y + 4"
              text-anchor="end"
              font-size="11"
              fill="var(--fg-subtle)"
            >
              {{ t.label }}
            </text>
          }
          @if (p.baselineY !== null) {
            <line
              [attr.x1]="pad.left"
              [attr.x2]="width - pad.right"
              [attr.y1]="p.baselineY"
              [attr.y2]="p.baselineY"
              stroke="var(--fg-subtle)"
              stroke-width="1"
              stroke-dasharray="1 3"
              data-testid="kpi-chart-baseline"
            />
            <text
              [attr.x]="width - pad.right + 6"
              [attr.y]="p.baselineY + 4"
              font-size="11"
              fill="var(--fg-muted)"
            >
              {{ 'objectives.chart.baseline' | transloco }}
            </text>
          }
          @if (p.targetPath) {
            <path
              [attr.d]="p.targetPath"
              fill="none"
              stroke="var(--pass)"
              stroke-width="1.5"
              stroke-dasharray="6 4"
              data-testid="kpi-chart-target"
            />
            <text
              [attr.x]="width - pad.right + 6"
              [attr.y]="p.targetLabelY + 4"
              font-size="11"
              fill="var(--fg-muted)"
            >
              {{ 'objectives.chart.target' | transloco }}
            </text>
          }
          @if (p.warningPath) {
            <path
              [attr.d]="p.warningPath"
              fill="none"
              stroke="var(--warn)"
              stroke-width="1.5"
              stroke-dasharray="2 4"
              data-testid="kpi-chart-warning"
            />
            <text
              [attr.x]="width - pad.right + 6"
              [attr.y]="p.warningLabelY + 4"
              font-size="11"
              fill="var(--fg-muted)"
            >
              {{ 'objectives.chart.warning' | transloco }}
            </text>
          }
          @if (p.points.length > 1) {
            <polyline
              [attr.points]="p.line"
              fill="none"
              stroke="var(--accent)"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          }
          @for (pt of p.points; track pt.point.period_end; let i = $index) {
            <g
              tabindex="0"
              role="img"
              class="cursor-default outline-none"
              [attr.aria-label]="pt.label"
              (mouseenter)="active.set(i)"
              (mouseleave)="active.set(null)"
              (focus)="active.set(i)"
              (blur)="active.set(null)"
            >
              <circle [attr.cx]="pt.x" [attr.cy]="pt.y" r="12" fill="transparent" />
              <circle
                [attr.cx]="pt.x"
                [attr.cy]="pt.y"
                [attr.r]="active() === i ? 6 : 4.5"
                [attr.fill]="pt.color"
                stroke="var(--surface)"
                stroke-width="2"
              />
            </g>
          }
          @if (p.first; as first) {
            <text [attr.x]="first.x" [attr.y]="height - 8" font-size="11" fill="var(--fg-subtle)">
              {{ first.date }}
            </text>
          }
          @if (p.last; as last) {
            <text
              [attr.x]="last.x"
              [attr.y]="height - 8"
              text-anchor="end"
              font-size="11"
              fill="var(--fg-subtle)"
            >
              {{ last.date }}
            </text>
          }
        </svg>
        <ul
          class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-meta text-fg-muted"
          data-testid="kpi-chart-legend"
        >
          @for (item of legend; track item.key) {
            <li class="inline-flex items-center gap-1.5">
              <span
                class="h-2.5 w-2.5 rounded-full"
                [style.background]="item.color"
                aria-hidden="true"
              ></span>
              {{ item.key | transloco }}
            </li>
          }
          <li class="inline-flex items-center gap-1.5">
            <span class="w-4 border-t-2 border-dashed border-pass" aria-hidden="true"></span>
            {{ 'objectives.chart.targetLegend' | transloco }}
          </li>
          <li class="inline-flex items-center gap-1.5">
            <span class="w-4 border-t-2 border-dotted border-warn" aria-hidden="true"></span>
            {{ 'objectives.chart.warningLegend' | transloco }}
          </li>
        </ul>
        @if (tooltip(); as tip) {
          <div
            class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-tile border border-border bg-surface px-2.5 py-1.5 text-meta whitespace-nowrap text-fg shadow-card"
            [style.left.%]="tip.left"
            [style.top.%]="tip.top"
            role="status"
            data-testid="kpi-chart-tooltip"
          >
            {{ tip.label }}
          </div>
        }
      </div>
    } @else {
      <p class="py-8 text-center text-body text-fg-muted" data-testid="kpi-chart-empty">
        {{ 'objectives.chart.empty' | transloco }}
      </p>
    }
  `,
})
export class KpiChart {
  private readonly language = inject(LanguageService);

  readonly series = input<KpiSeries | null>(null);

  protected readonly width = W;
  protected readonly height = H;
  protected readonly pad = PAD;
  protected readonly active = signal<number | null>(null);
  protected readonly legend = [
    { key: 'objectives.health.on_track', color: healthColor('on_track') },
    { key: 'objectives.health.at_risk', color: healthColor('at_risk') },
    { key: 'objectives.health.off_track', color: healthColor('off_track') },
  ];

  protected readonly plot = computed(() => {
    const series = this.series();
    const points = series?.points ?? [];
    if (!series || points.length === 0) {
      return null;
    }
    const locale = this.language.locale();
    const num = (v: number) => formatNumber(v, locale, '1.0-2');
    const day = (d: string) => formatDate(d, 'mediumDate', locale);
    const unit = series.unit ? ` ${series.unit}` : '';

    const values = points.map((p) => p.value);
    for (const ref of [series.target_value, series.warning_value, series.baseline_value]) {
      if (ref !== null) {
        values.push(ref);
      }
    }
    for (const p of points) {
      for (const ref of [p.target_value, p.warning_value]) {
        if (ref !== null) {
          values.push(ref);
        }
      }
    }
    // Start at zero for non-negative data, so a small change does not look dramatic.
    const min = Math.min(...values);
    const ticks = niceTicks(min >= 0 ? 0 : min, Math.max(...values));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
    const x = (i: number) =>
      points.length === 1 ? PAD.left + plotW / 2 : PAD.left + (i / (points.length - 1)) * plotW;

    const plotted: PlotPoint[] = points.map((point, i) => ({
      x: x(i),
      y: y(point.value),
      point,
      color: healthColor(point.status),
      label: this.language.translate('objectives.chart.point', {
        period: day(point.period_end),
        value: `${num(point.value)}${unit}`,
        status: this.language.translate(healthKey(point.status)),
      }),
    }));
    const first = plotted[0];
    const last = plotted[plotted.length - 1];
    return {
      points: plotted,
      line: plotted.map((p) => `${p.x},${p.y}`).join(' '),
      ticks: ticks.map((value) => ({ value, y: y(value), label: num(value) })),
      baselineY: series.baseline_value !== null ? y(series.baseline_value) : null,
      targetPath: stepPath(
        plotted,
        (p) => p.target_value,
        series.target_value,
        y,
        PAD.left,
        W - PAD.right,
      ),
      targetLabelY: y(series.target_value ?? points[points.length - 1].target_value ?? 0),
      warningPath: stepPath(
        plotted,
        (p) => p.warning_value,
        series.warning_value,
        y,
        PAD.left,
        W - PAD.right,
      ),
      warningLabelY: y(series.warning_value ?? points[points.length - 1].warning_value ?? 0),
      first: { x: first.x, date: day(first.point.period_end) },
      last: plotted.length > 1 ? { x: last.x, date: day(last.point.period_end) } : null,
    };
  });

  protected readonly tooltip = computed(() => {
    const index = this.active();
    const p = this.plot();
    const pt = index !== null ? p?.points[index] : null;
    if (!pt) {
      return null;
    }
    return { left: (pt.x / W) * 100, top: ((pt.y - 10) / H) * 100, label: pt.label };
  });
}
