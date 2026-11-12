import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { loadSearchScope } from '../../core/search/search-scope';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { AiAvailability } from '../../core/ai/ai-availability';
import { Icon } from '../ui/icon/icon';

/**
 * Inline "Ask about this" icon button for records and complex fields. Opens the
 * assistant and asks `prompt` about the current page (whose context the page
 * registered with `providePageContext`), naming `field` as the selection when set.
 *
 *   <app-ask-about [prompt]="'risk.ask.likelihood' | transloco" field="likelihood" />
 *
 * `prompt` is the already-translated question; without one a neutral
 * "Explain this" question about the page (or the field) is used. `labelKey` is
 * the accessible label key (default `search.askAbout.label`). Hidden once AI is
 * known to be off.
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
        class="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
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
  /** The field the question is about (sent as the page selection). */
  readonly field = input<string | null>(null);
  /** Accessible label key. */
  readonly labelKey = input<string | null>(null);

  /** Translated through the signal-tracked LanguageService, so a consumer key
   *  from a scope that loads later still refreshes. */
  protected readonly label = computed(() =>
    this.language.translate(this.labelKey() ?? 'search.askAbout.label'),
  );

  constructor() {
    loadSearchScope();
  }

  protected ask(): void {
    const field = this.field();
    const prompt =
      this.prompt()?.trim() ||
      this.language.translate(field ? 'search.askAbout.fieldPrompt' : 'search.askAbout.prompt', {
        field: field ?? '',
      });
    this.panel.askAbout(prompt, field ? { field } : undefined);
  }
}
