import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  LABEL_LANGS,
  LabelLang,
  fromLabelPair,
  toLabelPair,
} from '../../../core/records/localized';
import { LocalizedText } from '../../../core/records/record.models';

let nextId = 0;

/** The languages with any non-blank text, untrimmed. */
function keepFilled(pair: Record<LabelLang, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(pair).filter(([, text]) => text.trim() !== ''));
}

/**
 * Edits a label in every label language at once (English + Norwegian side by
 * side, stacked on small screens). Emits the stored shape: only the non-empty
 * languages, or null when all are empty.
 */
@Component({
  selector: 'app-localized-input',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="min-w-0">
      <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
        {{ label() }}
        @if (required()) {
          <span class="text-fail" aria-hidden="true">*</span>
        }
      </legend>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        @for (lang of langs; track lang) {
          <div class="flex items-start gap-2">
            <label
              [attr.for]="id + '-' + lang"
              class="mt-2.5 w-6 flex-none text-[11px] font-bold text-fg-subtle uppercase"
              [attr.title]="'records.langs.' + lang | transloco"
            >
              {{ lang }}
              <span class="sr-only">{{ 'records.langs.' + lang | transloco }}</span>
            </label>
            @if (multiline()) {
              <textarea
                [id]="id + '-' + lang"
                rows="2"
                [attr.maxlength]="maxLength()"
                [value]="pair()[lang]"
                (input)="update(lang, $event)"
                [attr.aria-required]="(required() && lang === 'en') || null"
                class="min-w-0 flex-1 rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
              ></textarea>
            } @else {
              <input
                [id]="id + '-' + lang"
                type="text"
                autocomplete="off"
                [attr.maxlength]="maxLength()"
                [value]="pair()[lang]"
                (input)="update(lang, $event)"
                [attr.aria-required]="(required() && lang === 'en') || null"
                class="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
              />
            }
          </div>
        }
      </div>
    </fieldset>
  `,
})
export class LocalizedInput {
  readonly label = input('');
  readonly value = input<LocalizedText | null | undefined>(null);
  readonly required = input(false);
  readonly multiline = input(false);
  readonly maxLength = input(500);

  readonly valueChange = output<LocalizedText | null>();

  protected readonly id = `loc-input-${nextId++}`;
  protected readonly langs = LABEL_LANGS;
  protected readonly pair = computed(() => toLabelPair(this.value()));

  protected update(lang: LabelLang, event: Event): void {
    const text = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    // Not trimmed while typing (a trailing space must survive the round trip);
    // `fromLabelPair` decides only whether anything is left at all.
    const next = { ...this.pair(), [lang]: text };
    this.valueChange.emit(fromLabelPair(next) === null ? null : keepFilled(next));
  }
}
