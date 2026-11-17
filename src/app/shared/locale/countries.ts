import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { bcp47ForLang } from '../../core/i18n/locale';

/** Region codes the backend accepts besides ISO 3166-1 alpha-2 (named via `ui.countries.<code>`). */
export const REGION_CODES = ['EU', 'EEA'] as const;

const displayNames = new Map<string, Intl.DisplayNames | null>();

function namesFor(locale: string): Intl.DisplayNames | null {
  if (!displayNames.has(locale)) {
    try {
      displayNames.set(locale, new Intl.DisplayNames([locale], { type: 'region' }));
    } catch {
      displayNames.set(locale, null);
    }
  }
  return displayNames.get(locale) ?? null;
}

/**
 * The name of an ISO 3166-1 alpha-2 country code in a BCP 47 locale (`IE` →
 * "Ireland" / "Irland"), or the code itself when the runtime has no name for it.
 * Regions (`EU`, `EEA`) are not handled here: they are translation keys.
 */
export function countryName(code: string, locale: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) {
    return upper;
  }
  try {
    return namesFor(locale)?.of(upper) ?? upper;
  } catch {
    return upper;
  }
}

/**
 * The display name of a data location / country code in the active language:
 * regions from `ui.countries.<code>`, countries from the runtime's region names.
 */
export function locationName(code: string, language: LanguageService): string {
  const upper = code.trim().toUpperCase();
  if ((REGION_CODES as readonly string[]).includes(upper)) {
    return language.translate(`ui.countries.${upper}`);
  }
  return countryName(upper, bcp47ForLang(language.active()));
}

/**
 * `{{ 'IE' | countryName }}` → "Ireland" (en) / "Irland" (nb); `EU` / `EEA` named
 * from the translations. Impure so it follows a runtime language switch.
 */
@Pipe({ name: 'countryName', pure: false })
export class CountryNamePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(code: string | null | undefined): string {
    return code ? locationName(code, this.language) : '';
  }
}
