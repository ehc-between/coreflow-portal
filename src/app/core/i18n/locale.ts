import { registerLocaleData } from '@angular/common';
import localeNb from '@angular/common/locales/nb';

// Angular ships `en` (en-US) built in; every other UI language needs its
// locale data registered before DatePipe / formatDate / formatNumber use it.
registerLocaleData(localeNb, 'nb');

/** UI language (Transloco lang code) → Angular / Intl locale id. */
const LOCALE_BY_LANG: Readonly<Record<string, string>> = {
  en: 'en',
  nb: 'nb',
};

/** BCP-47 tags for `Intl` and `<html lang>` (nb → nb-NO). */
const BCP47_BY_LANG: Readonly<Record<string, string>> = {
  en: 'en',
  nb: 'nb-NO',
};

/** The Angular locale id to format dates / numbers with for a UI language. */
export function localeForLang(lang: string): string {
  return LOCALE_BY_LANG[lang] ?? 'en';
}

/** The BCP-47 tag for a UI language, for `Intl.*` and the `<html lang>` attribute. */
export function bcp47ForLang(lang: string): string {
  return BCP47_BY_LANG[lang] ?? lang;
}

/**
 * Append `Z` to an ISO date-time that carries no timezone designator. The
 * backend serialises naive UTC datetimes ("2026-10-19T10:00:00"), which `Date`
 * (and Angular's formatDate) would otherwise read as *local* time. Date-only
 * strings ("2026-10-19") are left alone so they stay on the same calendar day.
 */
export function withUtcDefault(iso: string): string {
  return /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso) ? `${iso}Z` : iso;
}
