import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { bcp47ForLang } from '../../../core/i18n/locale';
import { REGION_CODES, countryName, locationName } from '../../locale/countries';
import { Icon } from '../icon/icon';

interface Choice {
  readonly code: string;
  readonly name: string;
}

/** Normalise for matching typed text against names ("Irland" ~ "irland", accents ignored). */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/**
 * Resolve typed text to one of the offered codes: an exact name in the active
 * language, a code ("ie", "UK" → GB), or a name in English. Null when nothing matches.
 */
export function resolveCountry(
  text: string,
  choices: readonly Choice[],
  englishName: (code: string) => string,
): string | null {
  const t = fold(text);
  if (!t) {
    return null;
  }
  const upper = t.toUpperCase();
  const alias = upper === 'UK' ? 'GB' : upper === 'EL' ? 'GR' : upper;
  const byCode = choices.find((c) => c.code === alias);
  if (byCode) {
    return byCode.code;
  }
  const byName = choices.find((c) => fold(c.name) === t);
  if (byName) {
    return byName.code;
  }
  return choices.find((c) => fold(englishName(c.code)) === t)?.code ?? null;
}

/**
 * Country / region picker over a list of ISO 3166-1 alpha-2 codes (plus regions such
 * as `EU` / `EEA`), shown by name in the active language and stored as codes.
 * `multiple`: chips plus a type-ahead input (pick from the suggestions, or type a
 * name or code and press Enter); otherwise a single select. Codes in `flagged` are
 * highlighted for review. Text that matches no option is never stored.
 */
@Component({
  selector: 'app-country-picker',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (multiple()) {
      <div class="flex flex-col gap-2">
        @if (value().length) {
          <ul class="flex flex-wrap gap-1.5" [attr.aria-label]="label()">
            @for (code of value(); track code) {
              <li
                class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12.5px]"
                [class.border-warn]="flagged().includes(code)"
                [class.bg-warn-soft]="flagged().includes(code)"
                [class.border-border]="!flagged().includes(code)"
                [class.bg-surface-2]="!flagged().includes(code)"
                [attr.data-code]="code"
              >
                <span class="text-fg">{{ nameOf(code) }}</span>
                <span class="font-mono text-[11px] text-fg-subtle">{{ code }}</span>
                @if (flagged().includes(code)) {
                  <span class="sr-only">{{ 'ui.countryPicker.flagged' | transloco }}</span>
                  <app-icon name="alert" [size]="12" class="text-warn" />
                }
                <button
                  type="button"
                  class="ml-0.5 rounded-full px-1 text-fg-subtle hover:text-fg"
                  [attr.aria-label]="'ui.countryPicker.remove' | transloco: { name: nameOf(code) }"
                  (click)="remove(code)"
                >
                  ×
                </button>
              </li>
            }
          </ul>
        }
        <input
          [id]="inputId()"
          type="text"
          autocomplete="off"
          [attr.list]="inputId() + '-options'"
          [attr.aria-invalid]="invalid() || notFound() ? 'true' : null"
          [attr.aria-describedby]="inputId() + '-picker-hint'"
          [placeholder]="'ui.countryPicker.placeholder' | transloco"
          [value]="text()"
          (input)="onInput($any($event.target).value)"
          (change)="tryAdd()"
          (keydown.enter)="$event.preventDefault(); tryAdd()"
          data-testid="country-picker-input"
        />
        <datalist [id]="inputId() + '-options'">
          @for (c of available(); track c.code) {
            <option [value]="c.name">{{ c.code }}</option>
          }
        </datalist>
        <p
          [id]="inputId() + '-picker-hint'"
          class="text-[12px]"
          [class.text-fail]="notFound()"
          [class.text-fg-subtle]="!notFound()"
          [attr.role]="notFound() ? 'alert' : null"
        >
          @if (notFound()) {
            {{ 'ui.countryPicker.notFound' | transloco: { text: text() } }}
          } @else {
            {{ 'ui.countryPicker.hint' | transloco }}
          }
        </p>
      </div>
    } @else {
      <select
        [id]="inputId()"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        (change)="select($any($event.target).value)"
        data-testid="country-picker-select"
      >
        <option value="" [selected]="!value().length">
          {{ 'ui.countryPicker.none' | transloco }}
        </option>
        @for (c of singleChoices(); track c.code) {
          <option [value]="c.code" [selected]="value()[0] === c.code">
            {{ c.name }} ({{ c.code }})
          </option>
        }
      </select>
    }
  `,
})
export class CountryPicker {
  private readonly language = inject(LanguageService);

  /** The codes on offer (ISO 3166-1 alpha-2, plus regions in multiple mode). */
  readonly options = input<readonly string[]>([]);
  /** Selected codes (one at most in single mode). */
  readonly value = input<readonly string[]>([]);
  readonly multiple = input(true);
  readonly inputId = input('country-picker');
  /** Accessible name of the chip list. */
  readonly label = input('');
  readonly invalid = input(false);
  /** Codes to highlight for review (e.g. a legacy value that may be wrong). */
  readonly flagged = input<readonly string[]>([]);
  readonly valueChange = output<readonly string[]>();

  protected readonly text = signal('');
  protected readonly notFound = signal(false);

  private readonly choices = computed<readonly Choice[]>(() => {
    const collator = new Intl.Collator(bcp47ForLang(this.language.active()));
    const regions = this.options().filter((c) => (REGION_CODES as readonly string[]).includes(c));
    const countries = this.options()
      .filter((c) => !(REGION_CODES as readonly string[]).includes(c))
      .map((code) => ({ code, name: locationName(code, this.language) }))
      .sort((a, b) => collator.compare(a.name, b.name));
    return [
      ...regions.map((code) => ({ code, name: locationName(code, this.language) })),
      ...countries,
    ];
  });

  protected readonly available = computed(() =>
    this.choices().filter((c) => !this.value().includes(c.code)),
  );

  /** Single mode: countries only, plus the current value if it is not on offer. */
  protected readonly singleChoices = computed<readonly Choice[]>(() => {
    const list = this.choices().filter(
      (c) => !(REGION_CODES as readonly string[]).includes(c.code),
    );
    const current = this.value()[0];
    return current && !list.some((c) => c.code === current)
      ? [{ code: current, name: this.nameOf(current) }, ...list]
      : list;
  });

  protected nameOf(code: string): string {
    return locationName(code, this.language);
  }

  protected onInput(value: string): void {
    this.text.set(value);
    this.notFound.set(false);
  }

  protected tryAdd(): void {
    const text = this.text();
    if (!text.trim()) {
      return;
    }
    const code = resolveCountry(text, this.choices(), (c) => countryName(c, 'en'));
    if (!code) {
      this.notFound.set(true);
      return;
    }
    this.text.set('');
    this.notFound.set(false);
    if (!this.value().includes(code)) {
      this.valueChange.emit([...this.value(), code]);
    }
  }

  protected remove(code: string): void {
    this.valueChange.emit(this.value().filter((c) => c !== code));
  }

  protected select(code: string): void {
    this.valueChange.emit(code ? [code] : []);
  }
}
