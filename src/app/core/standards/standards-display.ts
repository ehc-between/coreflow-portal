import type { BadgeTone } from '../../shared/ui/badge/badge';
import { localized } from './standards-data';
import {
  ClauseNode,
  EvidenceQuality,
  EvidenceState,
  ExclusionRule,
  LegalForm,
  StandardKind,
  StandardSummary,
} from './standards.models';

/**
 * Display rules of the standards area (A03), kept pure so they are trivially
 * testable: the standard's name and legal form in the UI language, the one
 * headline score, localised clause labels and URL slugs, and how evidence
 * quality, freshness and ownership read.
 */

/** The standard's name in the UI language: our Norwegian name in nb, else the catalogue name. */
export function standardName(
  std: Pick<StandardSummary, 'name' | 'name_nb'> | null | undefined,
  lang: string,
): string {
  if (!std) {
    return '';
  }
  return lang === 'nb' && std.name_nb ? std.name_nb : std.name;
}

/** "ISO 27001", "KI-forordningen", … in the UI language; null when the API has none. */
export function standardShortName(
  std: Pick<StandardSummary, 'short_name'> | null | undefined,
  lang: string,
): string | null {
  const text = std?.short_name ? localized(std.short_name, lang) : '';
  return text || null;
}

/**
 * ISO standard, EU regulation or EU directive. Older backends only send `kind`
 * (`standard` | `regulation`), so NIS2 reads as a regulation there.
 */
export function legalFormOf(
  std: { readonly legal_form?: LegalForm; readonly kind?: StandardKind } | null | undefined,
  kind?: StandardKind | null,
): LegalForm {
  if (std?.legal_form) {
    return std.legal_form;
  }
  return (std?.kind ?? kind) === 'regulation' ? 'regulation' : 'standard';
}

/** i18n key of the legal-form badge ("ISO-standard", "EU-forordning", "EU-direktiv"). */
export function legalFormKey(form: LegalForm): string {
  return `standards.legalForm.${form}`;
}

/** Badge tone of the legal form: EU acts are informational, ISO standards neutral. */
export function legalFormTone(form: LegalForm): BadgeTone {
  return form === 'standard' ? 'neutral' : 'info';
}

/** "Utgave 2022" for ISO standards; "Vedtatt 2016" for EU acts. */
export function editionKey(form: LegalForm): string {
  return form === 'standard' ? 'standards.edition' : 'standards.adopted';
}

/**
 * THE headline number of a standard (one number everywhere): the API's `score`,
 * else the readiness score, else the plain covered share (older backends).
 */
export function headlineScore(
  std: { readonly score?: number | null; readonly completeness: { readonly pct: number } },
  readiness?: number | null,
): number {
  if (typeof std.score === 'number') {
    return std.score;
  }
  if (typeof readiness === 'number') {
    return readiness;
  }
  return std.completeness.pct;
}

/** A clause number as shown in the UI language ("Kapittel II", "Art. 21"); the raw number otherwise. */
export function clauseLabel(
  node: Pick<ClauseNode, 'number' | 'label'> | null | undefined,
  lang: string,
): string {
  if (!node) {
    return '';
  }
  const label = node.label ? localized(node.label, lang) : '';
  return label || node.number;
}

/** The URL segment of a clause: its slug ("chapter-ii") when the API has one, else the number. */
export function clauseSegment(node: Pick<ClauseNode, 'number' | 'slug'>): string {
  return node.slug || node.number;
}

/** Index of every clause by number and slug, so `/standards/:key/:clause` accepts both. */
export function resolveClause(
  nodes: ReadonlyMap<string, Pick<ClauseNode, 'number' | 'slug'>>,
  segment: string | null | undefined,
): string | null {
  if (!segment) {
    return null;
  }
  if (nodes.has(segment)) {
    return segment;
  }
  const wanted = segment.toLowerCase();
  for (const node of nodes.values()) {
    if (node.slug && node.slug.toLowerCase() === wanted) {
      return node.number;
    }
  }
  // Old links may carry an encoded number ("Chapter%20II").
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Malformed escape: keep it as typed.
  }
  return decoded !== segment && nodes.has(decoded) ? decoded : null;
}

/** Weak document evidence (draft, past review, obsolete): it counts as partial only. */
export function isWeakQuality(quality: EvidenceQuality | null | undefined): boolean {
  return quality === 'draft' || quality === 'review_overdue' || quality === 'obsolete';
}

/** i18n key of a document's evidence quality ("Godkjent", "Utkast", "Gjennomgang forfalt", …). */
export function qualityKey(quality: EvidenceQuality): string {
  return `standards.quality.${quality}`;
}

export function qualityTone(quality: EvidenceQuality): BadgeTone {
  return quality === 'current' ? 'pass' : 'warn';
}

/** i18n key of the evidence freshness chip; null when fresh or unknown (nothing to flag). */
export function evidenceStateKey(state: EvidenceState | null | undefined): string | null {
  return state === 'stale' || state === 'weak' ? `standards.evidenceState.${state}` : null;
}

/** Whether a YYYY-MM-DD (or ISO) date lies before today (local time). */
export function isPastDate(date: string | null | undefined, today: Date = new Date()): boolean {
  if (!date) {
    return false;
  }
  const day = date.slice(0, 10);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const now = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return day < now;
}

/** Up to two initials of a person's name, for the owner avatar. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * Explanation key for a clause's exclusion rule, shown where "Gjelder" is
 * decided: null when the requirement may be excluded freely.
 */
export function exclusionHintKey(rule: ExclusionRule | null | undefined): string | null {
  switch (rule) {
    case 'not_allowed':
      return 'standards.exclusion.notAllowed';
    case 'conditional':
      return 'standards.exclusion.conditional';
    default:
      return null;
  }
}
