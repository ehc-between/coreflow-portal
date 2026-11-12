import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  ImplementationStatus,
  Matrix,
  MatrixBand,
  MatrixLevel,
  OpportunityStatus,
  RiskStatus,
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

export function riskStatusTone(status: RiskStatus): BadgeTone {
  switch (status) {
    case 'identified':
      return 'neutral';
    case 'assessed':
      return 'info';
    case 'in_treatment':
      return 'warn';
    case 'monitoring':
      return 'accent';
    case 'accepted':
      return 'pass';
    default:
      return 'neutral';
  }
}

export function treatmentStatusTone(status: TreatmentStatus): BadgeTone {
  switch (status) {
    case 'planned':
      return 'neutral';
    case 'in_progress':
      return 'info';
    case 'done':
      return 'pass';
    default:
      return 'neutral';
  }
}

export function opportunityStatusTone(status: OpportunityStatus): BadgeTone {
  switch (status) {
    case 'realised':
      return 'pass';
    case 'rejected':
      return 'neutral';
    case 'in_progress':
    case 'planned':
      return 'info';
    default:
      return 'accent';
  }
}

export function implementationTone(status: ImplementationStatus): BadgeTone {
  switch (status) {
    case 'implemented':
      return 'pass';
    case 'partial':
      return 'info';
    case 'planned':
      return 'warn';
    default:
      return 'neutral';
  }
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
