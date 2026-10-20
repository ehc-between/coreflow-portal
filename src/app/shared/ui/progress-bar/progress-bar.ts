import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Thin horizontal progress bar for a 0–100 value in any CSS colour. */
@Component({
  selector: 'app-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="clamped()"
      [attr.aria-label]="label() || null"
    >
      <div
        class="h-full rounded-full transition-[width] duration-500"
        [style.width.%]="clamped()"
        [style.background]="color()"
      ></div>
    </div>
  `,
})
export class ProgressBar {
  /** 0–100. */
  readonly value = input.required<number>();
  readonly color = input('var(--accent)');
  readonly label = input('');

  protected readonly clamped = computed(() =>
    Math.max(0, Math.min(100, Math.round(this.value() || 0))),
  );
}
