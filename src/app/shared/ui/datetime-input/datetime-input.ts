import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LanguageService } from '../../../core/i18n/language.service';
import { DateInput } from '../date-input/date-input';

const ISO_LOCAL = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/;
const TYPED_TIME = /^(\d{1,2})[:.\s](\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Parse a typed time of day (24 h): `9`, `0930`, `9:30`, `09.30` → `HH:mm`.
 * '' for empty input, null when it is not a valid time.
 */
export function parseTypedTime(text: string): string | null {
  const value = text.trim();
  if (!value) {
    return '';
  }
  let hours: number;
  let minutes: number;
  const separated = TYPED_TIME.exec(value);
  if (separated) {
    [hours, minutes] = [Number(separated[1]), Number(separated[2])];
  } else if (/^\d{1,4}$/.test(value)) {
    // Digits only: "9" / "09" are hours, "930" is 9:30, "0930" is 09:30.
    const split = value.length <= 2 ? value.length : value.length - 2;
    [hours, minutes] = [Number(value.slice(0, split)), Number(value.slice(split) || 0)];
  } else {
    return null;
  }
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return `${pad(hours)}:${pad(minutes)}`;
}

/** Split an ISO local date-time (`YYYY-MM-DDTHH:mm[:ss…]`) into its day and `HH:mm`. */
export function splitLocalDateTime(value: string | null | undefined): {
  day: string;
  time: string;
} {
  const match = value ? ISO_LOCAL.exec(value) : null;
  if (!match) {
    return { day: '', time: '' };
  }
  return { day: match[1], time: match[2] ? `${match[2]}:${match[3]}` : '' };
}

/**
 * A day-first date-time field: `app-date-input` (the day in the app language's order,
 * with the calendar button) next to a 24 h time field, both 40 px high. Use it instead
 * of `<input type="datetime-local">`, which shows the *browser's* format.
 *
 * The value is an ISO local date-time, `YYYY-MM-DDTHH:mm` – the same string
 * `datetime-local` produced – or '' when there is no day. A day without a time uses
 * `defaultTime` (`00:00` unless set). Typed times accept `9`, `930`, `9:30`, `09.30`.
 *
 *   <app-form-field [label]="'x.fields.occurredAt' | transloco" inputId="x-occurred">
 *     <app-datetime-input inputId="x-occurred" [(value)]="occurredAt" />
 *   </app-form-field>
 *
 * Also a form control (`formControlName` / `ngModel`). `inputId` labels the day field;
 * the time field gets `<inputId>-time` and its own accessible name ("Klokkeslett").
 */
@Component({
  selector: 'app-datetime-input',
  imports: [DateInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 gap-2', role: 'group' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateTimeInput), multi: true },
  ],
  template: `
    <app-date-input
      class="min-w-0 flex-1"
      data-testid="datetime-input-day"
      [inputId]="inputId()"
      [value]="day()"
      [ariaLabel]="ariaLabel()"
      [describedBy]="describedBy()"
      [invalid]="invalid()"
      [required]="required()"
      [disabled]="isDisabled()"
      [min]="minDay()"
      [max]="maxDay()"
      (valueChange)="onDay($event ?? '')"
      (changed)="onTouched()"
    />
    <input
      type="text"
      inputmode="numeric"
      autocomplete="off"
      maxlength="5"
      class="h-10 w-[88px] flex-none rounded-tile border border-border bg-bg px-3 text-ui text-fg tabular-nums"
      data-testid="datetime-input-time"
      [id]="inputId() ? inputId() + '-time' : null"
      [value]="timeDraft() ?? time()"
      [placeholder]="timePlaceholder()"
      [disabled]="isDisabled()"
      [attr.aria-label]="timeLabel()"
      [attr.aria-describedby]="describedBy() || null"
      [attr.aria-invalid]="invalid() || timeUnparsed() || null"
      (input)="onTimeTyped($any($event.target).value)"
      (blur)="onTimeBlur()"
    />
  `,
})
export class DateTimeInput implements ControlValueAccessor {
  private readonly language = inject(LanguageService);

  /** `YYYY-MM-DDTHH:mm`, or '' / null when empty. Two-way: `[(value)]`. */
  readonly value = model<string | null>('');
  /** id for the day field, so `<app-form-field [inputId]>` labels it. */
  readonly inputId = input('');
  readonly ariaLabel = input<string | null | undefined>(null);
  readonly describedBy = input<string | null | undefined>(null);
  readonly invalid = input(false);
  readonly required = input(false);
  readonly disabled = input(false);
  /** Earliest / latest allowed moment (`YYYY-MM-DD[THH:mm]`); limits the calendar's days. */
  readonly min = input<string | null | undefined>(null);
  readonly max = input<string | null | undefined>(null);
  /** Time used when a day is set without a time (`HH:mm`). */
  readonly defaultTime = input('00:00');
  /** Fires with the new value whenever it changes. */
  readonly changed = output<string>();

  private readonly cvaDisabled = signal(false);
  /** The time being typed, while it differs from the value's time. */
  protected readonly timeDraft = signal<string | null>(null);
  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());
  protected readonly day = computed(() => splitLocalDateTime(this.value()).day);
  protected readonly time = computed(() => splitLocalDateTime(this.value()).time);
  protected readonly minDay = computed(() => splitLocalDateTime(this.min()).day || null);
  protected readonly maxDay = computed(() => splitLocalDateTime(this.max()).day || null);
  protected readonly timeUnparsed = computed(() => {
    const draft = this.timeDraft();
    return draft !== null && parseTypedTime(draft) === null;
  });
  protected readonly timeLabel = computed(() => this.language.translate('ui.dateTimeInput.time'));
  protected readonly timePlaceholder = computed(() =>
    this.language.translate('ui.dateTimeInput.timePlaceholder'),
  );

  protected onDay(day: string): void {
    const time = parseTypedTime(this.timeDraft() ?? '') || this.time();
    this.commit(day, time);
  }

  protected onTimeTyped(text: string): void {
    this.timeDraft.set(text);
    // A complete "HH:mm" (or four digits) updates the value while typing; the rest on blur.
    if (!/^\d{1,2}[:.]\d{2}$|^\d{4}$/.test(text.trim())) {
      return;
    }
    const parsed = parseTypedTime(text);
    if (parsed && this.day()) {
      this.commit(this.day(), parsed);
    }
  }

  protected onTimeBlur(): void {
    const draft = this.timeDraft();
    const parsed = draft === null ? null : parseTypedTime(draft);
    if (parsed !== null) {
      this.timeDraft.set(null);
      if (this.day()) {
        this.commit(this.day(), parsed);
      }
    }
    this.onTouched();
  }

  private commit(day: string, time: string): void {
    const next = day ? `${day}T${time || this.defaultTime() || '00:00'}` : '';
    if (next !== (this.value() ?? '')) {
      this.value.set(next);
      this.onChange(next);
      this.changed.emit(next);
    }
  }

  writeValue(value: string | null | undefined): void {
    this.timeDraft.set(null);
    const { day, time } = splitLocalDateTime(value);
    this.value.set(day ? `${day}T${time || this.defaultTime() || '00:00'}` : '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.cvaDisabled.set(disabled);
  }
}
