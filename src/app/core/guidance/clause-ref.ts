/**
 * Clause references in guidance content are `"<framework>:<clause>"`, e.g. `hs:6.1`,
 * `iso27001:A.5.24`, `gdpr:32`, `eu_ai_act:4`. The framework part is translated from
 * `guidance.frameworks.<framework>`; unknown frameworks show the raw reference.
 */
export const KNOWN_FRAMEWORKS: ReadonlySet<string> = new Set([
  'hs',
  'iso9001',
  'iso27001',
  'iso14001',
  'iso42001',
  'iso45001',
  'iso19011',
  'iso22301',
  'gdpr',
  'eu_ai_act',
  'nis2',
]);

export interface ClauseRef {
  readonly ref: string;
  /** Known framework key, or null when the reference is not recognised. */
  readonly framework: string | null;
  readonly clause: string;
}

export function parseClauseRef(ref: string): ClauseRef {
  const at = ref.indexOf(':');
  if (at <= 0) {
    return { ref, framework: null, clause: ref };
  }
  const framework = ref.slice(0, at);
  const clause = ref.slice(at + 1);
  return KNOWN_FRAMEWORKS.has(framework) && clause
    ? { ref, framework, clause }
    : { ref, framework: null, clause: ref };
}

/** Translate-function shape (e.g. `LanguageService.translate`). */
export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

/** Human label for a clause reference ("ISO/IEC 27001 A.6.3"), or the raw ref if unknown. */
export function formatClause(ref: string, t: TranslateFn): string {
  const parsed = parseClauseRef(ref);
  return parsed.framework
    ? t('guidance.clause', {
        framework: t(`guidance.frameworks.${parsed.framework}`),
        clause: parsed.clause,
      })
    : ref;
}
