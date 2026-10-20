/**
 * The i18n key for a count: `<key>One` when the count is exactly 1, else
 * `<key>` (the repo's singular-variant convention, e.g. `fieldCount` /
 * `fieldCountOne`). Both variants must exist in every language file.
 */
export function pluralKey(key: string, count: number | null | undefined): string {
  return count === 1 ? `${key}One` : key;
}
