/** Annex A control themes we have translations for (ISO/IEC 27001:2022). */
const KNOWN_THEMES = ['organizational', 'people', 'physical', 'technological'] as const;

/**
 * i18n key for an Annex A theme, or null when the theme is not one we know
 * (the raw catalogue value is shown instead). Matches on the leading word, so
 * "organizational", "Organizational controls" and "organisational" all resolve.
 */
export function themeKey(theme: string): string | null {
  const head = theme
    .trim()
    .toLowerCase()
    .split(/[\s_-]+/)[0]
    ?.replace('organisational', 'organizational');
  return KNOWN_THEMES.find((t) => t === head) ? `standards.themes.${head}` : null;
}
