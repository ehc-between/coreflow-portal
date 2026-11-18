import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { sparklinePoints } from '../data/report-display';
import { TrendPoint } from '../data/reports.models';

/**
 * A small inline trend line (pure SVG, no dependency). Decorative: the numbers it
 * shows are always written next to it, so it is hidden from screen readers.
 */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex', 'aria-hidden': 'true' },
  template: `
    @if (points(); as line) {
      <svg
        [attr.width]="width()"
        [attr.height]="height()"
        [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
        class="overflow-visible"
        data-testid="sparkline"
      >
        <polyline
          [attr.points]="line"
          fill="none"
          [attr.stroke]="color()"
          stroke-width="1.75"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
    }
  `,
})
export class Sparkline {
  readonly data = input<readonly TrendPoint[]>([]);
  readonly width = input(96);
  readonly height = input(28);
  readonly color = input('var(--accent)');

  protected readonly points = computed(() =>
    this.data().length > 1 ? sparklinePoints(this.data(), this.width(), this.height()) : '',
  );
}
