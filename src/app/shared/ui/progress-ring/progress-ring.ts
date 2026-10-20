import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Circular completeness indicator: a track ring with a coloured arc for
 * `value` (0–100) and the percentage in the centre. `color` is any CSS colour
 * (defaults to the accent token). `label` is the accessible name.
 */
@Component({
  selector: 'app-progress-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="relative inline-flex flex-none items-center justify-center"
      [style.width.px]="size()"
      [style.height.px]="size()"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="clamped()"
      [attr.aria-label]="label() || null"
    >
      <svg [attr.width]="size()" [attr.height]="size()" class="-rotate-90" aria-hidden="true">
        <circle
          [attr.cx]="center()"
          [attr.cy]="center()"
          [attr.r]="radius()"
          fill="none"
          stroke="var(--surface-2)"
          [attr.stroke-width]="stroke()"
        />
        <circle
          [attr.cx]="center()"
          [attr.cy]="center()"
          [attr.r]="radius()"
          fill="none"
          [attr.stroke]="color()"
          [attr.stroke-width]="stroke()"
          stroke-linecap="round"
          [attr.stroke-dasharray]="circumference()"
          [attr.stroke-dashoffset]="offset()"
          class="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span
        class="absolute font-display font-bold tracking-[-0.02em] text-fg"
        [style.font-size.px]="size() * 0.24"
        >{{ clamped() }}%</span
      >
    </div>
  `,
})
export class ProgressRing {
  /** 0–100. */
  readonly value = input.required<number>();
  readonly size = input(64);
  readonly stroke = input(6);
  readonly color = input('var(--accent)');
  readonly label = input('');

  protected readonly clamped = computed(() =>
    Math.max(0, Math.min(100, Math.round(this.value() || 0))),
  );
  protected readonly center = computed(() => this.size() / 2);
  protected readonly radius = computed(() => (this.size() - this.stroke()) / 2);
  protected readonly circumference = computed(() => 2 * Math.PI * this.radius());
  protected readonly offset = computed(() => this.circumference() * (1 - this.clamped() / 100));
}
