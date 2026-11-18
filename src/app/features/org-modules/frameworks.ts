/**
 * Framework and clause helpers for the F1 pages. Framework names live in the
 * `modules` scope (`modules.frameworks.<key>.{name,short,description}`); the
 * extra `hs` key labels ISO Harmonised Structure clauses shared by every ISO
 * management system standard.
 */

/** A clause reference, `framework:number` (e.g. `hs:6.1`, `iso27001:A.5.24`). */
export type ClauseRef = string;

export function clauseFramework(ref: ClauseRef): string {
  const index = ref.indexOf(':');
  return index > 0 ? ref.slice(0, index) : ref;
}

export function clauseNumber(ref: ClauseRef): string {
  const index = ref.indexOf(':');
  return index > 0 ? ref.slice(index + 1) : '';
}

/** i18n key of a framework's short label (e.g. "ISO 27001"). */
export function frameworkShortKey(key: string): string {
  return `modules.frameworks.${key}.short`;
}

/** i18n key of a framework's full name. */
export function frameworkNameKey(key: string): string {
  return `modules.frameworks.${key}.name`;
}

/** i18n key of a framework's one-line description. */
export function frameworkDescriptionKey(key: string): string {
  return `modules.frameworks.${key}.description`;
}
