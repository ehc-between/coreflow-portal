import { LocalizedText } from './record.models';

/** Languages a designer can write labels in (matches the backend `Lang`). */
export const LABEL_LANGS = ['en', 'nb'] as const;
export type LabelLang = (typeof LABEL_LANGS)[number];

/** Pick `lang` from a localized label, falling back to English, then any language. */
export function localize(value: LocalizedText | null | undefined, lang: string): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return value[lang] || value['en'] || Object.values(value).find((text) => !!text) || '';
}

/** A label as an editable `{en, nb}` pair (a plain string fills both). */
export function toLabelPair(value: LocalizedText | null | undefined): Record<LabelLang, string> {
  if (value === null || value === undefined) {
    return { en: '', nb: '' };
  }
  if (typeof value === 'string') {
    return { en: value, nb: value };
  }
  return { en: value['en'] ?? '', nb: value['nb'] ?? '' };
}

/**
 * The stored form of an edited `{en, nb}` pair: only the non-empty languages,
 * trimmed; null when every language is empty.
 */
export function fromLabelPair(pair: Partial<Record<LabelLang, string>>): LocalizedText | null {
  const out: Record<string, string> = {};
  for (const lang of LABEL_LANGS) {
    const text = (pair[lang] ?? '').trim();
    if (text) {
      out[lang] = text;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Whether a label has any non-empty text. */
export function hasLabel(value: LocalizedText | null | undefined): boolean {
  return localize(value, 'en').trim().length > 0;
}
