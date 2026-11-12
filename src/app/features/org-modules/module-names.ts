/** Global i18n key of a module's display name. */
export function moduleNameKey(key: string): string {
  return `modules.names.${key}`;
}

/** Global i18n key of a module's one-line description. */
export function moduleDescriptionKey(key: string): string {
  return `modules.descriptions.${key}`;
}

/**
 * The translated names of `keys` as one locale-aware list ("Risk, Audits and
 * Documents"). Unknown keys fall back to the key itself. Pass the signal-tracked
 * `LanguageService.translate` so the list refreshes once the language file loads.
 */
export function moduleNameList(
  translate: (key: string) => string,
  lang: string,
  keys: readonly string[],
): string {
  const names = keys.map((key) => {
    const name = translate(moduleNameKey(key));
    return name && name !== moduleNameKey(key) ? name : key;
  });
  try {
    return new Intl.ListFormat(lang, {
      style: 'long',
      type: 'conjunction',
    }).format(names);
  } catch {
    return names.join(', ');
  }
}
