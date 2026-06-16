import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { TranslocoService, provideTransloco } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import { TranslocoHttpLoader } from './transloco-loader';

/** localStorage key under which the user's chosen language is persisted. */
export const LANGUAGE_STORAGE_KEY = 'coreflow.lang';

/**
 * Configures Transloco for runtime (no-rebuild) language switching and restores
 * the user's previously chosen language on startup.
 */
export function provideI18n(): (Provider | EnvironmentProviders)[] {
  const { defaultLanguage, availableLanguages } = environment.i18n;

  return [
    provideTransloco({
      config: {
        availableLangs: [...availableLanguages],
        defaultLang: defaultLanguage,
        fallbackLang: defaultLanguage,
        reRenderOnLangChange: true,
        prodMode: environment.production,
        missingHandler: { logMissingKey: !environment.production },
      },
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(() => {
      const transloco = inject(TranslocoService);
      const stored = readStoredLanguage();
      if (stored && availableLanguages.includes(stored)) {
        transloco.setActiveLang(stored);
      }
    }),
  ];
}

function readStoredLanguage(): string | null {
  try {
    return globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}
