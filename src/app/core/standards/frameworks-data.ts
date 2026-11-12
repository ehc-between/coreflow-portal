import { localized } from './standards-data';
import {
  BuiltinLinkEntityType,
  ClauseKind,
  ClauseMappingItem,
  ClauseMeta,
  EvidenceSuggestion,
  FrameworkReadiness,
  FrameworkSummary,
  LinkEntityType,
  MappingRelation,
  StandardKind,
  StandardSummary,
} from './standards.models';

/** Platform framework keys in display order (mirrors the backend's FRAMEWORK_KEYS). */
export const FRAMEWORK_KEYS = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso42001',
  'iso45001',
  'gdpr',
  'eu_ai_act',
  'nis2',
] as const;

/** One framework card of the overview: the catalogue entry, the org's state and its readiness. */
export interface FrameworkView {
  /** Platform framework key, or null for a catalogue standard outside the framework list. */
  readonly framework: string | null;
  readonly standardKey: string;
  readonly name: string;
  readonly kind: StandardKind;
  readonly enabled: boolean;
  readonly inProfile: boolean;
  /** 0–100 for an enabled framework once readiness is known, else null. */
  readonly readiness: number | null;
  readonly breakdown: FrameworkReadiness | null;
  /** The matching `GET standards` row (edition, completeness), when listed. */
  readonly standard: StandardSummary | null;
}

function frameworkRank(framework: string | null): number {
  const i = framework ? (FRAMEWORK_KEYS as readonly string[]).indexOf(framework) : -1;
  return i === -1 ? FRAMEWORK_KEYS.length : i;
}

/**
 * Merge `GET frameworks`, `GET standards` and `GET frameworks/readiness` into
 * one list in framework order. When the frameworks endpoint is unavailable
 * (`frameworks` null) the list is derived from the standards alone, so the
 * overview keeps working against an older backend.
 */
export function mergeFrameworks(
  frameworks: readonly FrameworkSummary[] | null,
  standards: readonly StandardSummary[],
  readiness: readonly FrameworkReadiness[],
): FrameworkView[] {
  const byKey = new Map(standards.map((s) => [s.key, s]));
  const breakdowns = new Map(readiness.map((r) => [r.standard_key, r]));
  const out: FrameworkView[] = [];
  const seen = new Set<string>();

  for (const f of frameworks ?? []) {
    const standard = byKey.get(f.standard_key) ?? null;
    const breakdown = breakdowns.get(f.standard_key) ?? null;
    const enabled = standard?.enabled ?? f.enabled;
    seen.add(f.standard_key);
    out.push({
      framework: f.framework,
      standardKey: f.standard_key,
      name: standard?.name ?? f.name,
      kind: f.kind,
      enabled,
      inProfile: f.in_profile,
      readiness: enabled ? (breakdown?.score ?? f.readiness) : null,
      breakdown: enabled ? breakdown : null,
      standard,
    });
  }
  // Catalogue standards the frameworks list does not cover (or all of them as a fallback).
  for (const s of standards) {
    if (seen.has(s.key)) {
      continue;
    }
    const breakdown = breakdowns.get(s.key) ?? null;
    out.push({
      framework: s.framework ?? null,
      standardKey: s.key,
      name: s.name,
      kind: s.kind ?? 'standard',
      enabled: s.enabled,
      inProfile: false,
      readiness: s.enabled ? (breakdown?.score ?? null) : null,
      breakdown: s.enabled ? breakdown : null,
      standard: s,
    });
  }
  return out
    .map((view, index) => ({ view, index }))
    .sort(
      (a, b) =>
        frameworkRank(a.view.framework) - frameworkRank(b.view.framework) || a.index - b.index,
    )
    .map(({ view }) => view);
}

/** The four readiness segments of a standard, as counts of applicable requirements. */
export interface ReadinessParts {
  /** Covered, with evidence confirmed or updated within a year (weight 1.0). */
  readonly fresh: number;
  /** Covered, but the evidence is older (weight 0.6). */
  readonly stale: number;
  /** Marked partial (weight 0.5). */
  readonly partial: number;
  /** Not started (weight 0). */
  readonly missing: number;
}

export function readinessParts(r: FrameworkReadiness): ReadinessParts {
  const fresh = Math.max(0, Math.min(r.fresh, r.covered));
  const stale = Math.max(0, r.covered - fresh);
  const partial = Math.max(0, r.partial);
  const missing = Math.max(0, r.applicable - r.covered - partial);
  return { fresh, stale, partial, missing };
}

/** Share (0–100) of `part` in `total`, rounded; 0 when there is nothing to count. */
export function sharePct(part: number, total: number): number {
  return total > 0 ? Math.round((100 * part) / total) : 0;
}

const RELATION_ORDER: readonly MappingRelation[] = ['equivalent', 'related', 'supports'];

/** Mappings grouped by relation (equivalent → related → supports), keeping the API order inside. */
export function groupMappings(
  items: readonly ClauseMappingItem[],
): { readonly relation: MappingRelation; readonly items: readonly ClauseMappingItem[] }[] {
  return RELATION_ORDER.map((relation) => ({
    relation,
    items: items.filter((i) => i.relation === relation),
  })).filter((g) => g.items.length > 0);
}

/** i18n key of a clause-kind badge, or null for plain clauses (no badge). */
export function clauseKindKey(kind: ClauseKind): string | null {
  switch (kind) {
    case 'annex_control':
      return 'standards.clause.control';
    case 'article':
    case 'recital':
    case 'annex':
      return `standards.kinds.${kind}`;
    default:
      return null;
  }
}

/** The AI Act roles / risk classes of a clause, each with its i18n key. */
export function metaChips(meta: ClauseMeta | null | undefined): {
  readonly roles: readonly { readonly value: string; readonly key: string }[];
  readonly riskClasses: readonly { readonly value: string; readonly key: string }[];
} {
  return {
    roles: (meta?.roles ?? []).map((value) => ({ value, key: `standards.aiAct.roles.${value}` })),
    riskClasses: (meta?.risk_classes ?? []).map((value) => ({
      value,
      key: `standards.aiAct.riskClasses.${value}`,
    })),
  };
}

const BUILTIN_TYPES: readonly BuiltinLinkEntityType[] = [
  'document',
  'deviation',
  'deviation_action',
  'attachment',
];

/** Whether evidence of this type has built-in handling (labels, routes, picker). */
export function isBuiltinEntityType(type: LinkEntityType): type is BuiltinLinkEntityType {
  return (BUILTIN_TYPES as readonly string[]).includes(type);
}

/**
 * i18n key of a record kind: the standards labels for the built-in kinds, the
 * platform's per-entity labels (`modules.entities.<type>`) for module types.
 */
export function entityTypeLabelKey(type: LinkEntityType): string {
  return isBuiltinEntityType(type) ? `standards.entity.${type}` : `modules.entities.${type}`;
}

/** The clause title of a suggestion in the active language. */
export function suggestionTitle(s: EvidenceSuggestion, lang: string): string {
  return lang === 'nb' && s.title_nb ? s.title_nb : s.title;
}

/** The requirement text of a suggestion in the active language (falling back). */
export function suggestionText(s: EvidenceSuggestion, lang: string): string {
  return localized({ en: s.text.en ?? '', nb: s.text.nb ?? '' }, lang);
}

/**
 * Suggestions worth offering when linking a record: not linked yet (a confirmed,
 * pending or rejected link is never offered again), minus refs already shown.
 */
export function openSuggestions(
  suggestions: readonly EvidenceSuggestion[],
  linkedRefs: ReadonlySet<string>,
): EvidenceSuggestion[] {
  return suggestions.filter((s) => s.link_status === null && !linkedRefs.has(s.ref));
}
