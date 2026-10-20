import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * A labelled on/off switch row (`role="switch"`): track + knob, the label, and
 * an optional trailing count. The host owns the state (`checked` in,
 * `checkedChange` out).
 */
@Component({
  selector: 'app-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      role="switch"
      class="flex w-full items-center gap-2.5 rounded-[8px] px-1 py-1 text-left text-[13px] text-fg"
      [attr.aria-checked]="checked()"
      (click)="checkedChange.emit(!checked())"
    >
      <span
        class="relative inline-flex h-[18px] w-8 flex-none rounded-full transition-colors motion-reduce:transition-none"
        [class]="checked() ? 'bg-accent' : 'bg-border-strong'"
        aria-hidden="true"
      >
        <span
          class="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left] motion-reduce:transition-none"
          [style.left.px]="checked() ? 16 : 2"
        ></span>
      </span>
      <span class="flex-1 font-medium"><ng-content /></span>
      @if (count() !== null) {
        <span class="text-[12px] font-semibold text-fg-subtle tabular-nums">{{ count() }}</span>
      }
    </button>
  `,
})
export class Switch {
  readonly checked = input(false);
  /** Trailing count (e.g. how many items the filter keeps); hidden when null. */
  readonly count = input<number | null>(null);
  readonly checkedChange = output<boolean>();
}
