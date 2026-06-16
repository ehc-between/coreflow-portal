import { Injectable, Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { APP_CONFIG } from '../config/app-config';
import { LANGUAGE_STORAGE_KEY } from './i18n.providers';

/**
 * Signal-based facade for reading and switching the active UI language.
 * Switching is instant (Transloco re-renders) and persisted to localStorage so
 * the choice survives reloads.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);

  /** Languages the app supports, from configuration. */
  readonly available: readonly string[] = inject(APP_CONFIG).i18n.availableLanguages;

  /** The currently active language, reactive to changes from anywhere. */
  readonly active: Signal<string> = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  /** Switch the active language (ignored if not in `available`). */
  use(lang: string): void {
    if (!this.available.includes(lang) || lang === this.active()) {
      return;
    }
    this.transloco.setActiveLang(lang);
    try {
      globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // Persistence is best-effort (e.g. private mode / storage disabled).
    }
  }
}
