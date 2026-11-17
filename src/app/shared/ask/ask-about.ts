import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { loadSearchScope } from '../../core/search/search-scope';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { AiAvailability } from '../../core/ai/ai-availability';
import { Icon } from '../ui/icon/icon';

/**
 * `owner_name` / `riskOwner` → `Owner name` / `Risk owner`: a readable stand-in when
 * a host passes only a field key, so the assistant never sees (or repeats) a raw
 * identifier.
 */
export function humaniseField(field: string): string {
  const text = field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLocaleLowerCase();
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : field;
}

/**
 * Inline "Ask about this" icon button for records and complex fields. Opens the
 * assistant and asks `prompt` about the current page (whose context the page
 * registered with `providePageContext`), naming the field as the selection.
 *
 *   <app-ask-about [prompt]="'risk.ask.likelihood' | transloco" field="likelihood"
 *                  [fieldLabel]="'risk.fields.likelihood' | transloco"
 *                  [requirements]="['iso27001:6.1.2']" />
 *
 * - `prompt` is the already-translated question; without one a neutral "Explain
 *   this" question about the page (or the field) is used.
 * - `fieldLabel` is the field's translated label. It is what the assistant is told
 *   the user selected (P2: never a raw key). Without it the `field` key is made
 *   readable (`owner_name` → "Owner name").
 * - `requirements` are the canonical refs the field documents (field help passes
 *   its `requirements`), sent with the page context so "which requirement does
 *   this field prove?" can be answered.
 * - `labelKey` is the accessible label key (default `search.askAbout.label`).
 *
 * Hidden once AI is known to be off.
 */
@Component({
  selector: 'app-ask-about',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!availability.unavailable()) {
      <button
        type="button"
        (click)="ask()"
        [attr.aria-label]="label()"
        [title]="label()"
        class="inline-flex h-7 w-7 items-center justify-center rounded-md text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
      >
        <app-icon name="spark" [size]="15" />
      </button>
    }
  `,
})
export class AskAbout {
  private readonly panel = inject(AskPanelService);
  private readonly language = inject(LanguageService);
  protected readonly availability = inject(AiAvailability);

  /** The (translated) question to ask. */
  readonly prompt = input<string | null>(null);
  /** The field the question is about (its key; see `fieldLabel`). */
  readonly field = input<string | null>(null);
  /** The field's translated label, sent as the selection instead of the key. */
  readonly fieldLabel = input<string | null>(null);
  /** Canonical requirement refs the field or record documents. */
  readonly requirements = input<readonly string[] | null>(null);
  /** Accessible label key. */
  readonly labelKey = input<string | null>(null);

  /** Translated through the signal-tracked LanguageService, so a consumer key
   *  from a scope that loads later still refreshes. */
  protected readonly label = computed(() =>
    this.language.translate(this.labelKey() ?? 'search.askAbout.label'),
  );

  /** The field as the user knows it, or null when the question is about the page. */
  private readonly fieldName = computed<string | null>(() => {
    const label = this.fieldLabel()?.trim();
    if (label) {
      return label;
    }
    const field = this.field()?.trim();
    return field ? humaniseField(field) : null;
  });

  constructor() {
    loadSearchScope();
  }

  protected ask(): void {
    const field = this.fieldName();
    const prompt =
      this.prompt()?.trim() ||
      this.language.translate(field ? 'search.askAbout.fieldPrompt' : 'search.askAbout.prompt', {
        field: field ?? '',
      });
    this.panel.askAbout(prompt, field ? { field } : undefined, {
      requirements: this.requirements(),
    });
  }
}
