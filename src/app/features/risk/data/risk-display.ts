import { frameworkOf } from '../../../shared/requirement-links/requirement-label';
import {
  ControlRef,
  ImplementationStatus,
  Matrix,
  MatrixBand,
  MatrixLevel,
  OpportunityStatus,
  Rating,
  Risk,
  RiskCategory,
  RiskStatus,
  SourceType,
  SubjectType,
  TreatmentStatus,
} from './risk.models';

/** Band keys of the built-in templates (translated as `risk.matrix.bands.<key>`). */
export const TEMPLATE_BAND_KEYS = ['low', 'medium', 'high', 'critical'] as const;

/** Level keys of the built-in templates (translated as `risk.matrix.levels.<key>`). */
export const TEMPLATE_LEVEL_KEYS = [
  'rare',
  'unlikely',
  'possible',
  'likely',
  'almost_certain',
  'insignificant',
  'minor',
  'moderate',
  'major',
  'severe',
] as const;

/** The English labels the templates ship with, keyed by template key. */
const TEMPLATE_LABELS: Readonly<Record<string, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
  rare: 'Rare',
  unlikely: 'Unlikely',
  possible: 'Possible',
  likely: 'Likely',
  almost_certain: 'Almost certain',
  insignificant: 'Insignificant',
  minor: 'Minor',
  moderate: 'Moderate',
  major: 'Major',
  severe: 'Severe',
};

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

/**
 * Display label of a template-derived band or level. Level and band labels are the
 * org's own data; when a label is still the template's English default, the
 * translation (`risk.matrix.bands.<key>` / `risk.matrix.levels.<key>`) is shown so a
 * Norwegian user sees Norwegian. Anything the org renamed is shown as typed.
 */
export function templateLabel(
  kind: 'bands' | 'levels',
  key: string | null | undefined,
  label: string | null | undefined,
  t: TranslateFn,
): string {
  const fallback = label?.trim() || key || '';
  if (!key || TEMPLATE_LABELS[key] === undefined) {
    return fallback;
  }
  if (label && label.trim().toLowerCase() !== TEMPLATE_LABELS[key].toLowerCase()) {
    return fallback;
  }
  return t(`risk.matrix.${kind}.${key}`);
}

export function bandLabel(band: Pick<MatrixBand, 'key' | 'label'>, t: TranslateFn): string {
  return templateLabel('bands', band.key, band.label, t);
}

export function levelLabel(level: MatrixLevel, t: TranslateFn): string {
  return templateLabel('levels', level.key ?? null, level.label, t);
}

/** The band a score falls in (highest `min_score` <= score), honouring cell overrides. */
export function bandFor(
  matrix: Pick<Matrix, 'bands' | 'cells'>,
  likelihood: number,
  consequence: number,
): MatrixBand | null {
  const override = matrix.cells[`${likelihood}:${consequence}`];
  if (override) {
    const band = matrix.bands.find((b) => b.key === override);
    if (band) {
      return band;
    }
  }
  const score = likelihood * consequence;
  let found: MatrixBand | null = null;
  for (const band of [...matrix.bands].sort((a, b) => a.min_score - b.min_score)) {
    if (band.min_score <= score) {
      found = band;
    }
  }
  return found;
}

/** Readable text colour (dark or white) on a `#rrggbb` background. */
export function contrastText(color: string | null | undefined): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color ?? '');
  if (!match) {
    return 'var(--fg)';
  }
  const [r, g, b] = match.slice(1).map((h) => parseInt(h, 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.4 ? '#111827' : '#ffffff';
}

// --- status values for the shared tone map (docs/ux-guide.md §5) -----------------
//
// Badges use `app-status-badge` with the module's own label key; these map a module
// value onto the shared vocabulary so the colour means the same as everywhere else.

const RISK_STATUS_VALUE: Readonly<Record<RiskStatus, string>> = {
  identified: 'new',
  assessed: 'submitted',
  in_treatment: 'in_progress',
  monitoring: 'active',
  // A decision taken on purpose: neutral, never "done" (the risk is still carried).
  accepted: 'archived',
  closed: 'closed',
};

/** Lifecycle value of a risk status (for `app-status-badge meaning="lifecycle"`). */
export function riskStatusValue(status: RiskStatus): string {
  return RISK_STATUS_VALUE[status] ?? 'draft';
}

/** Lifecycle value of a treatment status (the values already are shared ones). */
export function treatmentStatusValue(status: TreatmentStatus): string {
  return status;
}

const OPPORTUNITY_STATUS_VALUE: Readonly<Record<OpportunityStatus, string>> = {
  identified: 'new',
  evaluating: 'under_review',
  planned: 'planned',
  in_progress: 'in_progress',
  realised: 'done',
  // Rejecting an opportunity is a decision, not a failure.
  rejected: 'cancelled',
};

export function opportunityStatusValue(status: OpportunityStatus): string {
  return OPPORTUNITY_STATUS_VALUE[status] ?? 'draft';
}

const IMPLEMENTATION_VALUE: Readonly<Record<ImplementationStatus, string>> = {
  implemented: 'implemented',
  partial: 'partial',
  planned: 'planned',
  // Not started is a to-do, not a failure: neutral.
  not_started: 'not_assessed',
};

/** Compliance value of a control's implementation status (`meaning="compliance"`). */
export function implementationValue(status: ImplementationStatus | null | undefined): string {
  return status ? (IMPLEMENTATION_VALUE[status] ?? 'not_assessed') : 'not_assessed';
}

// --- connected records -----------------------------------------------------------

/**
 * The record types a "what is at risk" choice can point at. Types without records
 * (location, other) stay free text.
 */
export const SOURCE_SUBJECTS: Readonly<Record<SourceType, readonly SubjectType[]>> = {
  asset: ['asset', 'continuity_ict_system', 'ai_system'],
  process: ['process'],
  activity: ['process', 'project'],
  project: ['project'],
  location: [],
  supplier: ['supplier', 'processor', 'contract'],
  information: ['ropa_entry', 'document', 'asset'],
  service: ['continuity_ict_system', 'contract', 'process'],
  other: [],
};

/** Subject record types for a source type ('' = none chosen: every type). */
export function subjectTypesFor(
  source: SourceType | '' | null | undefined,
): readonly SubjectType[] {
  if (!source) {
    return [];
  }
  return SOURCE_SUBJECTS[source] ?? [];
}

/**
 * Standards a register category usually documents. Narrows the control picker and
 * the requirement suggestions (an information security risk is matched against
 * ISO 27001 / NIS2 first, not ISO 14001). Empty = no narrowing.
 */
const CATEGORY_FRAMEWORKS: Readonly<Record<RiskCategory, readonly string[]>> = {
  enterprise: [],
  information_security: ['iso27001', 'nis2'],
  privacy: ['gdpr', 'iso27001'],
  ai: ['iso42001', 'eu_ai_act'],
  hse: ['iso45001'],
  environmental: ['iso14001'],
  project: [],
  quality: ['iso9001'],
  other: [],
};

export function frameworksForCategory(
  category: RiskCategory | null | undefined,
): readonly string[] {
  return category ? (CATEGORY_FRAMEWORKS[category] ?? []) : [];
}

/** Register categories whose risks are rated on confidentiality / integrity / availability. */
export function usesCia(category: RiskCategory | null | undefined): boolean {
  return category === 'information_security' || category === 'privacy';
}

/** A `{en, nb}` label in the UI language, else English, else the fallback. */
export function localLabel(
  label: Readonly<Record<string, string>> | null | undefined,
  lang: string,
  fallback: string,
): string {
  return label?.[lang] || label?.['en'] || fallback;
}

/**
 * Canonical form of a control ref: `iso27001-2022:A.8.13` -> `iso27001:A.8.13`.
 * Refs already in framework-key form are returned unchanged.
 */
export function canonicalControlRef(ref: string): string {
  const at = ref.indexOf(':');
  if (at <= 0) {
    return ref;
  }
  return `${frameworkOf(ref.slice(0, at))}:${ref.slice(at + 1)}`;
}

/** The control's number and title in the UI language ("A.8.13 · Backup"). */
export function controlText(control: ControlRef, lang: string): string {
  const title = (lang === 'nb' && control.title_nb) || control.title;
  return title ? `${control.number} · ${title}` : control.number;
}

/** Catalogue standards with a Statement of Applicability, by framework key. */
const SOA_STANDARD_KEYS: Readonly<Record<string, string>> = {
  iso27001: 'iso27001-2022',
  iso42001: 'iso42001-2023',
};

/** Display rows for a risk's / treatment's controls; older APIs only send the refs. */
export function controlsOf(item: {
  readonly control_refs: readonly string[];
  readonly controls?: readonly ControlRef[];
}): readonly ControlRef[] {
  if (item.controls && item.controls.length) {
    return item.controls;
  }
  return item.control_refs.map((raw) => {
    const ref = canonicalControlRef(raw);
    const at = ref.indexOf(':');
    const framework = at > 0 ? ref.slice(0, at) : null;
    const number = at > 0 ? ref.slice(at + 1) : ref;
    const standardKey = framework ? SOA_STANDARD_KEYS[framework] : undefined;
    const link = standardKey ? soaLink(`${standardKey}:${number}`) : null;
    return {
      ref,
      standard_key: standardKey ?? null,
      framework,
      short: null,
      number,
      title: null,
      title_nb: null,
      soa_entry_id: null,
      applicable: null,
      implementation_status: null,
      url: link ? `${link.path.join('/')}?control=${encodeURIComponent(link.control)}` : null,
    };
  });
}

/** `YYYY-MM-DD` of an ISO date-time (for `<input type="date">`), or ''. */
export function toDateInput(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

/** A date input value as the API's naive date-time, or null when empty. */
export function fromDateInput(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : null;
}

/** Split a comma/whitespace/newline-separated list of control references. */
export function parseControlRefs(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((ref) => ref.trim())
        .filter(Boolean),
    ),
  ];
}

/** A user id from an encoded assignee option value (`user:<id>`), or null. */
export function userIdOf(value: string): string | null {
  return value.startsWith('user:') ? value.slice(5) || null : null;
}

export function departmentIdOf(value: string): string | null {
  return value.startsWith('department:') ? value.slice(11) || null : null;
}

/** Portal route of a SoA control (`/risk/soa/<key>?control=<ref>`) as router parts. */
export function soaLink(ref: string): { path: string[]; control: string } | null {
  const at = ref.indexOf(':');
  if (at <= 0) {
    return null;
  }
  return { path: ['/risk/soa', ref.slice(0, at)], control: ref.slice(at + 1) };
}

// --- what the numbers on a risk mean ---------------------------------------------

type RatedRisk = Pick<Risk, 'inherent' | 'residual' | 'above_appetite' | 'acceptance' | 'status'> &
  Partial<Pick<Risk, 'current_basis' | 'accepted_above_appetite'>>;

/** Which rating "current" is: the residual one when set, else the inherent one. */
export function currentBasis(risk: RatedRisk): 'residual' | 'inherent' | null {
  if (risk.current_basis !== undefined) {
    return risk.current_basis ?? null;
  }
  return risk.residual ? 'residual' : risk.inherent ? 'inherent' : null;
}

/** The rating the risk is judged on today (residual if set, otherwise inherent). */
export function currentRating(risk: RatedRisk): Rating | null {
  return currentBasis(risk) === 'residual' ? risk.residual : risk.inherent;
}

/**
 * How the risk stands against the appetite: `above` (needs a decision, red),
 * `accepted` (above, but formally accepted: shown neutrally with who and until
 * when) or null (within the appetite or not rated).
 */
export function appetiteState(risk: RatedRisk): 'above' | 'accepted' | null {
  if (risk.accepted_above_appetite) {
    return 'accepted';
  }
  if (!risk.above_appetite) {
    return null;
  }
  return risk.acceptance || risk.status === 'accepted' ? 'accepted' : 'above';
}

/** Hand a downloaded file to the browser. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Display name of a standard with a Statement of Applicability: the API's
 * localised label, else our own short name (`risk.soa.standards.<framework>`,
 * e.g. "ISO/IEC 27001:2022 – Informasjonssikkerhet"), else the catalogue name.
 * Internal keys (`iso27001-2022`) are never shown.
 */
export function standardDisplayName(
  label: Readonly<Record<string, string>> | null | undefined,
  standardKey: string,
  catalogueName: string | null | undefined,
  lang: string,
  t: TranslateFn,
): string {
  const own = label?.[lang];
  if (own) {
    return own;
  }
  const key = `risk.soa.standards.${frameworkOf(standardKey)}`;
  const translated = t(key);
  if (translated && translated !== key) {
    return translated;
  }
  return label?.['en'] || catalogueName || frameworkOf(standardKey).toUpperCase();
}
