import {
  AssessmentKind,
  ClassificationAnswers,
  ClassificationReason,
  ObligationsSummary,
} from './ai-governance.models';

/** Backend module key (permission prefix, page-context `module`). */
export const AI_GOVERNANCE_MODULE = 'ai_governance';
/** Portal path, Transloco scope and guidance file name. */
export const AI_GOVERNANCE_SCOPE = 'ai-governance';
export const AI_SYSTEM_ENTITY = 'ai_system';
export const AI_ASSESSMENT_ENTITY = 'ai_assessment';

export const AI_GOV_PERMISSIONS = {
  read: 'ai_governance:read',
  write: 'ai_governance:write',
  manage: 'ai_governance:manage',
  approve: 'ai_governance:approve',
} as const;

// Badge values for the shared tone map (docs/ux-guide.md §5). Each is passed as
// `app-status-badge [value]` with the module's own `labelKey`; the value only picks
// the colour, so it is mapped to the tone-map word with the same meaning.

/** Risk class -> severity value (prohibited / high red, limited amber, minimal neutral). */
export function riskValue(risk: string): string {
  return risk === 'unclassified' ? 'unknown' : risk;
}

/** System status -> lifecycle value. */
export function systemStatusValue(status: string): string {
  switch (status) {
    case 'in_use':
      return 'active';
    case 'in_development':
      return 'in_progress';
    case 'suspended':
      return 'on_hold';
    default:
      return status;
  }
}

/** Assessment status -> lifecycle value ("completed" waits for approval). */
export function assessmentStatusValue(status: string): string {
  return status === 'completed' ? 'pending_approval' : status;
}

/** Monitoring result -> compliance value. */
export function monitoringValue(result: string): string {
  switch (result) {
    case 'pass':
      return 'compliant';
    case 'warn':
      return 'partial';
    case 'fail':
      return 'non_compliant';
    default:
      return 'unknown';
  }
}

/** Obligation status -> compliance value. */
export function obligationValue(status: string | null | undefined): string {
  switch (status) {
    case 'met':
      return 'met';
    case 'in_progress':
      return 'in_progress';
    case 'not_relevant':
      return 'not_applicable';
    default:
      return 'not_assessed';
  }
}

export const riskKey = (risk: string): string => `aiGovernance.risk.${risk}`;
export const statusKey = (status: string): string => `aiGovernance.status.${status}`;
export const roleKey = (role: string): string => `aiGovernance.role.${role}`;

/** Roles that do not provide the system but pass it on (Art. 22-24). */
const INTERMEDIARY_ROLES: readonly string[] = [
  'importer',
  'distributor',
  'authorised_representative',
];

/**
 * The risk explanation for a system. The plain texts describe the provider's
 * duties, so a deployer or an intermediary (importer, distributor, authorised
 * representative) gets the text of its own role for high and limited risk:
 * the Art. 50(1)-(2) transparency duties are the provider's, the deployer only
 * has Art. 50(3)-(4). A built-in platform feature says that CoreFlow, as the
 * provider, covers them.
 */
export function riskExplainKey(
  risk: string,
  role: string | null | undefined,
  builtin = false,
): string {
  if (risk === 'limited' && builtin) {
    return 'aiGovernance.riskExplainByRole.builtin.limited';
  }
  if ((risk === 'high' || risk === 'limited') && role === 'deployer') {
    return `aiGovernance.riskExplainByRole.deployer.${risk}`;
  }
  if ((risk === 'high' || risk === 'limited') && role && INTERMEDIARY_ROLES.includes(role)) {
    return `aiGovernance.riskExplainByRole.other.${risk}`;
  }
  return `aiGovernance.riskExplain.${risk}`;
}

/** "3 av 5 forpliktelser oppfylt": the obligations that count (not "not relevant"). */
export function obligationProgress(summary: ObligationsSummary | null | undefined): {
  readonly met: number;
  readonly total: number;
} {
  if (!summary) {
    return { met: 0, total: 0 };
  }
  return { met: summary.met, total: Math.max(0, summary.total - summary.not_relevant) };
}

/** Copy keys of the technical-file banner for an audience (older payloads: from `required`). */
export function technicalDocCopy(doc: { readonly required: boolean; readonly audience?: string }): {
  readonly badge: string | null;
  readonly body: string;
} {
  const audience = doc.audience ?? (doc.required ? 'provider' : 'none');
  switch (audience) {
    case 'provider':
      return { badge: 'aiGovernance.docs.required', body: 'aiGovernance.docs.requiredBody' };
    case 'deployer':
      return { badge: 'aiGovernance.docs.optionalForYou', body: 'aiGovernance.docs.deployerBody' };
    case 'other':
      return { badge: 'aiGovernance.docs.optionalForYou', body: 'aiGovernance.docs.otherBody' };
    default:
      return { badge: null, body: 'aiGovernance.docs.optionalBody' };
  }
}
export const kindKey = (kind: string): string => `aiGovernance.kind.${kind}`;
export const assessmentStatusKey = (status: string): string =>
  `aiGovernance.assessmentStatus.${status}`;
export const monitoringKindKey = (kind: string): string => `aiGovernance.monitoringKind.${kind}`;
export const monitoringResultKey = (result: string): string =>
  `aiGovernance.monitoringResult.${result}`;
export const literacySourceKey = (source: string): string =>
  `aiGovernance.literacySource.${source}`;
export const docSectionKey = (key: string): string => `aiGovernance.docSections.${key}.title`;
export const obligationStatusKey = (status: string): string =>
  `aiGovernance.obligationStatus.${status}`;
export const docSectionHintKey = (key: string): string => `aiGovernance.docSections.${key}.hint`;
export const prohibitedKey = (key: string): string => `aiGovernance.prohibited.${key}`;
export const annexIiiKey = (key: string): string => `aiGovernance.annexIii.${key}`;
export const transparencyKey = (key: string): string => `aiGovernance.transparency.${key}`;

/** Label / hint keys of an impact or FRIA section. */
export function assessmentSectionKey(kind: AssessmentKind | string, section: string): string {
  return `aiGovernance.sections.${kind === 'fria' ? 'fria' : 'impact'}.${section}.title`;
}
export function assessmentSectionHintKey(kind: AssessmentKind | string, section: string): string {
  return `aiGovernance.sections.${kind === 'fria' ? 'fria' : 'impact'}.${section}.hint`;
}

export interface ReasonText {
  readonly key: string;
  readonly params: Record<string, unknown>;
  /** A catalogue label key to translate into `params.item` before rendering. */
  readonly itemKey: string | null;
}

/**
 * How to render a classification reason code (`prohibited.<practice>`,
 * `high.annex_i`, `high.<area>`, `high.profiling`, `exception.art6_3`,
 * `transparency.<trigger>`, `minimal.none`, `gpai.model`, `gpai.systemic`).
 */
export function reasonText(reason: ClassificationReason): ReasonText {
  const [group, ...rest] = reason.code.split('.');
  const item = rest.join('.');
  const params = { ref: reason.ref };
  switch (group) {
    case 'prohibited':
      return { key: 'aiGovernance.reasons.prohibited', params, itemKey: prohibitedKey(item) };
    case 'transparency':
      return { key: 'aiGovernance.reasons.transparency', params, itemKey: transparencyKey(item) };
    case 'high':
      if (item === 'annex_i' || item === 'profiling') {
        return { key: `aiGovernance.reasons.high_${item}`, params, itemKey: null };
      }
      return { key: 'aiGovernance.reasons.high_area', params, itemKey: annexIiiKey(item) };
    case 'exception':
      return { key: 'aiGovernance.reasons.exception_art6_3', params, itemKey: null };
    case 'minimal':
      return { key: 'aiGovernance.reasons.minimal', params, itemKey: null };
    case 'gpai':
      return {
        key:
          item === 'systemic' ? 'aiGovernance.reasons.gpai_systemic' : 'aiGovernance.reasons.gpai',
        params,
        itemKey: null,
      };
    default:
      return {
        key: 'aiGovernance.reasons.other',
        params: { ...params, code: reason.code },
        itemKey: null,
      };
  }
}

/** Empty wizard answers (every question answered "no"). */
export function emptyAnswers(): ClassificationAnswers {
  return {
    role: null,
    prohibited_practices: [],
    annex_i_safety_component: false,
    annex_iii_areas: [],
    art6_3_exception: false,
    profiling: false,
    transparency: [],
    gpai: false,
    gpai_systemic_risk: false,
    deployer_public_service: false,
    deployer_credit_or_insurance: false,
    notes: null,
  };
}

const BOOL_KEYS = [
  'annex_i_safety_component',
  'art6_3_exception',
  'profiling',
  'gpai',
  'gpai_systemic_risk',
  'deployer_public_service',
  'deployer_credit_or_insurance',
] as const;
const LIST_KEYS = ['prohibited_practices', 'annex_iii_areas', 'transparency'] as const;

/**
 * Wizard answers from untrusted input (a stored assessment's `answers`, or an
 * assistant suggestion): booleans and string lists only, unknown values in a
 * list are dropped when `allowed` lists are given.
 */
export function normalizeAnswers(
  raw: unknown,
  allowed?: Partial<Record<(typeof LIST_KEYS)[number], readonly string[]>>,
): ClassificationAnswers {
  const base = emptyAnswers();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const key of BOOL_KEYS) {
    if (typeof src[key] === 'boolean') {
      out[key] = src[key];
    }
  }
  for (const key of LIST_KEYS) {
    const value = src[key];
    if (Array.isArray(value)) {
      const allow = allowed?.[key];
      out[key] = [
        ...new Set(
          value.filter((v): v is string => typeof v === 'string' && (!allow || allow.includes(v))),
        ),
      ];
    }
  }
  if (typeof src['role'] === 'string') {
    out['role'] = src['role'];
  }
  if (typeof src['notes'] === 'string') {
    out['notes'] = src['notes'];
  }
  if (!out['gpai']) {
    out['gpai_systemic_risk'] = false;
  }
  return out as unknown as ClassificationAnswers;
}

/** Toggle `value` in a list (returns a new list). */
export function toggleIn(list: readonly string[], value: string, on: boolean): string[] {
  const without = list.filter((v) => v !== value);
  return on ? [...without, value] : without;
}

/** Split a comma / newline separated tag input into trimmed, unique, non-empty values. */
export function parseTags(text: string, max = 20): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ].slice(0, max);
}

/** A section map of an impact / FRIA assessment's answers (string values only). */
export function sectionAnswers(answers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (answers && typeof answers === 'object') {
    for (const [key, value] of Object.entries(answers as Record<string, unknown>)) {
      if (typeof value === 'string') {
        out[key] = value;
      }
    }
  }
  return out;
}

/** Split a portal URL into a router path and query params (`/x?risk_class=high`). */
export function splitUrl(url: string): {
  readonly path: string;
  readonly query: Record<string, string> | null;
} {
  const at = url.indexOf('?');
  if (at < 0) {
    return { path: url, query: null };
  }
  const query: Record<string, string> = {};
  new URLSearchParams(url.slice(at + 1)).forEach((value, key) => {
    query[key] = value;
  });
  return { path: url.slice(0, at), query };
}

/**
 * The text key of an overview attention item: `named` when it is about one
 * system the backend names, `one` for a single item, else `many`.
 */
export function attentionTextKey(item: {
  readonly key: string;
  readonly count: number;
  readonly params?: Readonly<Record<string, unknown>>;
}): string {
  const base = `aiGovernance.attention.${item.key}`;
  if (item.count === 1 && item.params?.['name']) {
    return `${base}.named`;
  }
  return item.count === 1 ? `${base}.one` : `${base}.many`;
}

/** "1 del" / "3 deler": the key of a count-based phrase (`<base>One` for one). */
export function countKey(base: string, count: number): string {
  return count === 1 ? `${base}One` : base;
}
