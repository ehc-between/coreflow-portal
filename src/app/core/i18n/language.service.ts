import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { filter, merge, tap } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { LANGUAGE_STORAGE_KEY } from './i18n.providers';
import { bcp47ForLang, localeForLang } from './locale';

/**
 * Signal-based facade for reading and switching the active UI language.
 * Switching is instant (Transloco re-renders) and persisted to localStorage so
 * the choice survives reloads.
 *
 * Also the single source for locale-aware formatting: `locale()` is the
 * Angular locale id for the active language, and `translate()` is a
 * signal-tracked synchronous translation that is safe to call inside
 * `computed()` — it re-evaluates when the language switches *and* when the
 * language file finishes loading (a bare `TranslocoService.translate()` in a
 * computed freezes on the raw key if it runs before the file has arrived).
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  /** Languages the app supports, from configuration. */
  readonly available: readonly string[] = inject(APP_CONFIG).i18n?.availableLanguages ?? [];

  private readonly activeLang = signal(this.transloco.getActiveLang());
  /** Bumps whenever the active language changes or a translation file loads. */
  private readonly revision = signal(0);

  /** The currently active language, reactive to changes from anywhere. */
  readonly active: Signal<string> = this.activeLang.asReadonly();

  /** Angular locale id for the active language (`en`, `nb`), for formatDate / formatNumber. */
  readonly locale: Signal<string> = computed(() => localeForLang(this.active()));

  constructor() {
    // Transloco's streams can emit while a template renders (on subscribe, or
    // when a pipe triggers a synchronous load), where signal writes are not
    // allowed — so write outside the reactive context.
    const subscription = merge(
      this.transloco.langChanges$.pipe(tap((lang) => untracked(() => this.activeLang.set(lang)))),
      this.transloco.events$.pipe(filter((e) => e.type === 'translationLoadSuccess')),
    ).subscribe(() => untracked(() => this.revision.update((n) => n + 1)));
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());

    // Keep <html lang> in step so screen readers, hyphenation and native
    // date inputs follow the chosen language.
    effect(() => {
      this.document.documentElement.lang = bcp47ForLang(this.active());
    });
  }

  /**
   * Translate `key` synchronously, tracked by signals: inside a `computed()` or
   * a template the result refreshes on language switch / file load.
   */
  translate(key: string, params?: Record<string, unknown>): string {
    this.revision();
    return this.transloco.translate(key, params);
  }

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
