import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';

/**
 * Dropdown that switches the active UI language at runtime. Reads/writes the
 * LanguageService; option labels are themselves translated.
 */
@Component({
  selector: 'app-language-switcher',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="sr-only" for="language-switcher">{{ 'language.label' | transloco }}</label>
    <select
      id="language-switcher"
      class="h-9 cursor-pointer rounded-[9px] border border-transparent bg-transparent px-2 text-[13px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg focus:border-accent focus:outline-none"
      [value]="language.active()"
      (change)="onChange($event)"
    >
      @for (lang of language.available; track lang) {
        <option [value]="lang">{{ 'language.' + lang | transloco }}</option>
      }
    </select>
  `,
})
export class LanguageSwitcher {
  protected readonly language = inject(LanguageService);

  protected onChange(event: Event): void {
    this.language.use((event.target as HTMLSelectElement).value);
  }
}
