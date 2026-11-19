import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LanguageService } from '../../../core/i18n/language.service';
import { Icon } from '../icon/icon';

/** Typed-date order per UI language: nb "03.12.2026", en "12/03/2026". */
const ORDER: Readonly<Record<string, 'dmy' | 'mdy'>> = { nb: 'dmy', en: 'mdy' };

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;
const TYPED = /^(\d{1,2})[./\-\s](\d{1,2})[./\-\s](\d{2}|\d{4})$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** A real calendar day as `YYYY-MM-DD`, or null. */
function isoDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Parse what a user typed into a date field in `lang`: ISO (`2026-12-03`) always,
 * else nb day-first (`3.12.2026`, `03.12.26`) or en month-first (`12/3/2026`).
 * '' for empty input, null when it is not a real date.
 */
export function parseTypedDate(text: string, lang: string): string | null {
  const value = text.trim();
  if (!value) {
    return '';
  }
  const iso = ISO_DAY.exec(value);
  if (iso) {
    return isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const typed = TYPED.exec(value);
  if (!typed) {
    return null;
  }
  const [a, b, rawYear] = [Number(typed[1]), Number(typed[2]), typed[3]];
  const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
  return (ORDER[lang] ?? 'dmy') === 'mdy' ? isoDay(year, a, b) : isoDay(year, b, a);
}

/** Show a `YYYY-MM-DD` day in `lang`'s numeric order (nb "03.12.2026", en "12/03/2026"). */
export function formatTypedDate(value: string | null | undefined, lang: string): string {
  const iso = value ? ISO_DAY.exec(value) : null;
  if (!iso) {
    return '';
  }
  const [, y, m, d] = iso;
  return (ORDER[lang] ?? 'dmy') === 'mdy' ? `${m}/${d}/${y}` : `${d}.${m}.${y}`;
}

/**
 * A date field that follows the *app* language, not the browser's: a native
 * `<input type="date">` always shows the browser locale's format (an English
 * browser shows "12/03/2026" in the Norwegian UI). This shows and accepts the
 * date in the UI language's order and keeps the browser's calendar picker
 * behind the calendar button. The value is a calendar day, `YYYY-MM-DD` ('' when empty).
 *
 *   <app-form-field [label]="…" [inputId]="'due'">
 *     <app-date-input inputId="due" [(value)]="due" />
 *   </app-form-field>
 *
 * Also a form control (`formControlName` / `ngModel`).
 */
@Component({
  selector: 'app-date-input',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateInput), multi: true },
  ],
  template: `
    <input
      #text
      type="text"
      inputmode="numeric"
      autocomplete="off"
      class="h-9 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg"
      style="padding-right: 38px"
      data-testid="date-input-text"
      [id]="inputId() || null"
      [value]="shown()"
      [placeholder]="placeholder()"
      [disabled]="isDisabled()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-describedby]="describedBy() || null"
      [attr.aria-invalid]="invalid() || unparsed() || null"
      [attr.aria-required]="required() || null"
      (input)="onType($any($event.target).value)"
      (blur)="onBlur()"
    />
    <button
      type="button"
      class="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
      [attr.aria-label]="pickLabel()"
      [title]="pickLabel()"
      [disabled]="isDisabled()"
      (click)="openPicker()"
    >
      <app-icon name="calendar" [size]="16" />
    </button>
    <input
      #native
      type="date"
      tabindex="-1"
      aria-hidden="true"
      style="position: absolute; right: 0; bottom: 0; width: 1px; height: 1px; padding: 0; border: 0; opacity: 0; pointer-events: none"
      [value]="value() || ''"
      [attr.min]="min() || null"
      [attr.max]="max() || null"
      [disabled]="isDisabled()"
      (change)="onPicked($any($event.target).value)"
    />
  `,
})
export class DateInput implements ControlValueAccessor {
  private readonly language = inject(LanguageService);

  /** The calendar day, `YYYY-MM-DD`; '' (or null) when empty. Two-way: `[(value)]`. */
  readonly value = model<string | null>('');
  /** id for the visible field, so `<app-form-field [inputId]>` labels it. */
  readonly inputId = input('');
  readonly ariaLabel = input<string | null | undefined>(null);
  readonly describedBy = input<string | null | undefined>(null);
  readonly invalid = input(false);
  readonly required = input(false);
  readonly disabled = input(false);
  readonly min = input<string | null | undefined>(null);
  readonly max = input<string | null | undefined>(null);
  /** Fires once the user commits a value (typed and left the field, or picked a day). */
  readonly changed = output<string>();

  private readonly native = viewChild<ElementRef<HTMLInputElement>>('native');
  private readonly cvaDisabled = signal(false);
  /** What the user is typing, while it differs from the formatted value. */
  private readonly draft = signal<string | null>(null);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());
  protected readonly formatted = computed(() =>
    formatTypedDate(this.value(), this.language.active()),
  );
  protected readonly shown = computed(() => this.draft() ?? this.formatted());
  protected readonly unparsed = computed(() => {
    const draft = this.draft();
    return draft !== null && parseTypedDate(draft, this.language.active()) === null;
  });
  protected readonly placeholder = computed(() =>
    this.language.translate('ui.dateInput.placeholder'),
  );
  protected readonly pickLabel = computed(() => this.language.translate('ui.dateInput.pick'));

  constructor() {
    // A language switch re-renders the formatted value; drop a stale draft.
    effect(() => {
      this.language.active();
      untracked(() => this.draft.set(null));
    });
  }

  protected onType(text: string): void {
    this.draft.set(text);
    // Only a complete date (four-digit year) updates the value while typing, so
    // "3.12.20" on its way to "3.12.2026" never passes through 2020; the rest on blur.
    if (!/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(text.trim())) {
      return;
    }
    const parsed = parseTypedDate(text, this.language.active());
    if (parsed && parsed !== (this.value() ?? '')) {
      this.set(parsed, false);
    }
  }

  protected onBlur(): void {
    const draft = this.draft();
    const parsed = draft === null ? null : parseTypedDate(draft, this.language.active());
    if (parsed !== null) {
      this.draft.set(null);
      if (parsed !== (this.value() ?? '')) {
        this.value.set(parsed);
        this.onChange(parsed);
      }
      this.changed.emit(parsed);
    }
    this.onTouched();
  }

  protected onPicked(day: string): void {
    this.draft.set(null);
    this.set(day ?? '', true);
  }

  protected openPicker(): void {
    const el = this.native()?.nativeElement;
    if (!el) {
      return;
    }
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  private set(day: string, commit: boolean): void {
    this.value.set(day);
    this.onChange(day);
    if (commit) {
      this.changed.emit(day);
    }
  }

  writeValue(value: string | null | undefined): void {
    this.draft.set(null);
    this.value.set(value ? (ISO_DAY.exec(value)?.[0] ?? '') : '');
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
