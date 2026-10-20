import { BadgeTone } from '../../shared/ui/badge/badge';
import {
  ActionEffectiveness,
  ActionKind,
  ActionStatus,
  DeviationStatus,
  DeviationVisibility,
  FieldType,
  RootCauseMethod,
  Severity,
  Source,
  Standard,
} from '../../core/deviations/deviation.models';

/** Statuses in display order (used for the filter dropdown and selects). */
export const STATUS_OPTIONS: readonly DeviationStatus[] = [
  'open',
  'investigating',
  'action',
  'verification',
  'closed',
  'cancelled',
];

/** Severities in ascending order. */
export const SEVERITY_OPTIONS: readonly Severity[] = ['low', 'medium', 'high', 'critical'];

/** Sources in display order. */
export const SOURCE_OPTIONS: readonly Source[] = [
  'internal',
  'audit',
  'inspection',
  'customer',
  'incident',
  'other',
];

/** Standards in display order. */
export const STANDARD_OPTIONS: readonly Standard[] = [
  'iso9001',
  'iso14001',
  'iso45001',
  'iso27001',
  'gdpr',
];

/** Maps a deviation status to a design-system badge tone. */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'closed':
      return 'pass';
    case 'investigating':
    case 'action':
    case 'verification':
      return 'warn';
    case 'cancelled':
      return 'neutral';
    case 'open':
    default:
      return 'info';
  }
}

/** Maps a severity to a design-system badge tone. */
export function severityTone(severity: string): BadgeTone {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'fail';
    case 'medium':
      return 'warn';
    case 'low':
    default:
      return 'neutral';
  }
}

/** i18n key for a status label. */
export function statusLabelKey(status: string): string {
  return `deviations.status.${status}`;
}

/** i18n key for a severity label. */
export function severityLabelKey(severity: string): string {
  return `deviations.severity.${severity}`;
}

/** i18n key for a source label. */
export function sourceLabelKey(source: string): string {
  return `deviations.source.${source}`;
}

/** i18n key for a standard label. */
export function standardLabelKey(standard: string): string {
  return `deviations.standards.${standard}`;
}

/** The 9 dynamic field types, in the order they appear in the type editor. */
export const FIELD_TYPE_OPTIONS: readonly FieldType[] = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'multiselect',
  'checkbox',
  'user',
  'department',
];

/** i18n key for a field-type label. */
export function fieldTypeLabelKey(type: string): string {
  return `deviations.types.fieldTypes.${type}`;
}

/** Whether a field type carries a user-defined option list. */
export function fieldTypeHasOptions(type: string): boolean {
  return type === 'select' || type === 'multiselect';
}

/**
 * Whether a deviation is overdue: a due date in the past while the deviation is
 * still active (i.e. not closed or cancelled).
 */
export function isOverdue(dueAt: string | undefined, status: string): boolean {
  if (!dueAt || status === 'closed' || status === 'cancelled') {
    return false;
  }
  return new Date(dueAt).getTime() < Date.now();
}

// --- CAPA actions ----------------------------------------------------------

/** Action kinds in display order (containment → corrective → preventive). */
export const ACTION_KIND_OPTIONS: readonly ActionKind[] = [
  'containment',
  'corrective',
  'preventive',
];

/** Action statuses in lifecycle order. */
export const ACTION_STATUS_OPTIONS: readonly ActionStatus[] = [
  'open',
  'in_progress',
  'done',
  'verified',
  'cancelled',
];

/** Effectiveness outcomes in display order. */
export const EFFECTIVENESS_OPTIONS: readonly ActionEffectiveness[] = [
  'pending',
  'effective',
  'not_effective',
];

/** Maps an action status to a design-system badge tone. */
export function actionStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'verified':
      return 'pass';
    case 'done':
      return 'accent';
    case 'in_progress':
      return 'warn';
    case 'cancelled':
      return 'neutral';
    case 'open':
    default:
      return 'info';
  }
}

/** Maps an effectiveness outcome to a design-system badge tone. */
export function effectivenessTone(effectiveness: string): BadgeTone {
  switch (effectiveness) {
    case 'effective':
      return 'pass';
    case 'not_effective':
      return 'fail';
    case 'pending':
    default:
      return 'warn';
  }
}

/** i18n key for an action kind label. */
export function actionKindLabelKey(kind: string): string {
  return `deviations.actions.kind.${kind}`;
}

/** i18n key for an action status label. */
export function actionStatusLabelKey(status: string): string {
  return `deviations.actions.status.${status}`;
}

/** i18n key for an effectiveness label. */
export function effectivenessLabelKey(effectiveness: string): string {
  return `deviations.actions.effectiveness.${effectiveness}`;
}

/** Action statuses that still need work (the backend's "open actions"). */
const OPEN_ACTION_STATUSES: ReadonlySet<string> = new Set(['open', 'in_progress']);

/**
 * True when an action is still open / in progress and past its due date —
 * the same rule as the backend's `overdue=true` filter and stats.
 */
export function isActionOverdue(dueAt: string | undefined | null, status: string): boolean {
  if (!dueAt || !OPEN_ACTION_STATUSES.has(status)) {
    return false;
  }
  return new Date(dueAt).getTime() < Date.now();
}

// --- Root cause, visibility, access ----------------------------------------

/** Root-cause analysis methods in display order. */
export const ROOT_CAUSE_METHOD_OPTIONS: readonly RootCauseMethod[] = [
  'five_why',
  'fishbone',
  '8d',
  'other',
];

/** i18n key for a root-cause method label. */
export function rootCauseMethodLabelKey(method: string): string {
  return `deviations.rootCauseMethod.${method}`;
}

/** Deviation visibilities. */
export const VISIBILITY_OPTIONS: readonly DeviationVisibility[] = ['organization', 'restricted'];

/** i18n key for a visibility label. */
export function visibilityLabelKey(visibility: string): string {
  return `deviations.visibility.${visibility}`;
}

// --- Dynamic field validation ---------------------------------------------

/**
 * The backend's per-field validation messages (422 `detail.data`), which are
 * English free text, mapped to i18n keys. Anything unrecognised falls back to
 * a generic "invalid value" message rather than leaking English into the UI.
 */
const FIELD_ERROR_KEYS: Readonly<Record<string, string>> = {
  'This field is required': 'required',
  'Must be a string': 'text',
  'Must be a number': 'number',
  'Must be an ISO date': 'date',
  'Must be a boolean': 'checkbox',
  'Must be one of the allowed options': 'option',
  'Must be a subset of the allowed options': 'options',
  'Must reference a user in this organization': 'user',
  'Must reference a department in this organization': 'department',
};

/** Every field-error code the UI can show (for the i18n coverage spec). */
export const FIELD_ERROR_CODES: readonly string[] = [...Object.values(FIELD_ERROR_KEYS), 'invalid'];

/** i18n key for a backend dynamic-field validation message. */
export function fieldErrorKey(message: string): string {
  const code = FIELD_ERROR_KEYS[message.trim().replace(/\.$/, '')] ?? 'invalid';
  return `deviations.fieldErrors.${code}`;
}

/** Map a 422 `{field: message}` body to `{field: i18n key}`. */
export function fieldErrorKeys(errors: Readonly<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(errors)) {
    out[field] = fieldErrorKey(typeof message === 'string' ? message : '');
  }
  return out;
}
