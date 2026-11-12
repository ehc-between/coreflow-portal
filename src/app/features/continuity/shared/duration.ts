import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DURATION_UNITS,
  DurationUnit,
  durationLabel,
  splitDuration,
  toMinutes,
} from '../data/continuity-display';

/** A duration in minutes, shown in the largest whole unit ("4 hours", "2 days"). */
@Component({
  selector: 'app-continuity-duration',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ label().key | transloco: label().params }}`,
})
export class ContinuityDuration {
  readonly minutes = input<number | null | undefined>(null);
  protected readonly label = computed(() => durationLabel(this.minutes()));
}

/**
 * A duration field: a number plus a unit (minutes, hours, days), valued in whole
 * minutes (null = not set). The number input carries `inputId` so a surrounding
 * `<app-form-field>` label points at it; the unit select has its own label.
 */
@Component({
  selector: 'app-continuity-duration-input',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex gap-2">
      <input
        [id]="inputId()"
        type="number"
        min="0"
        step="any"
        inputmode="decimal"
        class="min-w-0 flex-1"
        [disabled]="disabled()"
        [attr.aria-invalid]="invalid() || null"
        [attr.aria-describedby]="describedBy() || null"
        [value]="amount()"
        (input)="setAmount($any($event.target).value)"
      />
      <label class="sr-only" [for]="inputId() + '-unit'">
        {{ 'continuity.duration.unit' | transloco }}
      </label>
      <select
        [id]="inputId() + '-unit'"
        class="!w-[110px] shrink-0"
        [disabled]="disabled()"
        (change)="setUnit($any($event.target).value)"
      >
        @for (u of units; track u) {
          <option [value]="u" [selected]="unit() === u">
            {{ 'continuity.duration.units.' + u | transloco }}
          </option>
        }
      </select>
    </div>
  `,
})
export class ContinuityDurationInput {
  readonly inputId = input.required<string>();
  /** Minutes (null = not set). */
  readonly value = input<number | null>(null);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly describedBy = input('');
  readonly valueChange = output<number | null>();

  protected readonly units = DURATION_UNITS;
  protected readonly amount = signal('');
  protected readonly unit = signal<DurationUnit>('hours');

  constructor() {
    effect(() => {
      const minutes = this.value();
      untracked(() => {
        // Keep what the user typed while it still means the same number of minutes.
        if (toMinutes(this.amount(), this.unit()) === minutes) {
          return;
        }
        if (minutes === null) {
          this.amount.set('');
          return;
        }
        const split = splitDuration(minutes);
        this.amount.set(String(split.value));
        this.unit.set(split.unit);
      });
    });
  }

  protected setAmount(raw: string): void {
    this.amount.set(raw);
    this.valueChange.emit(toMinutes(raw, this.unit()));
  }

  protected setUnit(unit: DurationUnit): void {
    this.unit.set(unit);
    this.valueChange.emit(toMinutes(this.amount(), unit));
  }
}
