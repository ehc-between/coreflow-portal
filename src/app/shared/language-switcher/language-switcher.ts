import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';

let nextId = 0;

/**
 * Dropdown that switches the active UI language at runtime. Reads/writes the
 * LanguageService. Option labels are language autonyms ("Norsk (bokmål)",
 * "English"), the same in every UI language, so a user can always find their own.
 *
 * The selection is bound per option (`[selected]`): binding `[value]` on the
 * <select> runs before the `@for` options exist, so the first option used to win.
 */
@Component({
  selector: 'app-language-switcher',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="sr-only" [attr.for]="id">{{ 'language.label' | transloco }}</label>
    <select
      [id]="id"
      data-testid="language-switcher"
      class="h-9 cursor-pointer rounded-tile border border-transparent bg-transparent px-2 text-ui font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg focus:border-accent focus:outline-none"
      (change)="onChange($event)"
    >
      @for (lang of language.available; track lang) {
        <option [value]="lang" [selected]="lang === language.active()" [attr.lang]="lang">
          {{ 'language.' + lang | transloco }}
        </option>
      }
    </select>
  `,
})
export class LanguageSwitcher {
  protected readonly language = inject(LanguageService);
  protected readonly id = `language-switcher-${++nextId}`;

  protected onChange(event: Event): void {
    this.language.use((event.target as HTMLSelectElement).value);
  }
}
