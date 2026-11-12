import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  CHANGE_STATUSES,
  COMPLIANCE_STATUSES,
  ComplianceStatus,
  EVALUATION_RESULTS,
  FRAMEWORKS,
  IMPACTS,
  Impact,
  OBLIGATION_STATUSES,
  OBLIGATION_TYPES,
  ObligationStatus,
} from './obligation.models';

function keyFor(prefix: string, values: readonly string[], value: string | null | undefined) {
  return values.includes(value ?? '') ? `${prefix}.${value}` : `${prefix}.unknown`;
}

const STATUS_TONES: Readonly<Record<ObligationStatus, BadgeTone>> = {
  draft: 'neutral',
  active: 'pass',
  retired: 'warn',
};

const COMPLIANCE_TONES: Readonly<Record<ComplianceStatus, BadgeTone>> = {
  not_evaluated: 'neutral',
  compliant: 'pass',
  partially_compliant: 'warn',
  non_compliant: 'fail',
  not_applicable: 'info',
};

const IMPACT_TONES: Readonly<Record<Impact, BadgeTone>> = {
  none: 'neutral',
  low: 'info',
  medium: 'warn',
  high: 'fail',
};

export function obligationStatusKey(status: string | null | undefined): string {
  return keyFor('obligations.status', OBLIGATION_STATUSES, status);
}

export function obligationStatusTone(status: string | null | undefined): BadgeTone {
  return STATUS_TONES[status as ObligationStatus] ?? 'neutral';
}

export function obligationTypeKey(type: string | null | undefined): string {
  return (OBLIGATION_TYPES as readonly string[]).includes(type ?? '')
    ? `obligations.types.${type}`
    : 'obligations.types.other';
}

export function complianceKey(status: string | null | undefined): string {
  return keyFor('obligations.compliance', COMPLIANCE_STATUSES, status);
}

export function complianceTone(status: string | null | undefined): BadgeTone {
  return COMPLIANCE_TONES[status as ComplianceStatus] ?? 'neutral';
}

export function resultKey(result: string | null | undefined): string {
  return keyFor('obligations.compliance', EVALUATION_RESULTS, result);
}

export function impactKey(impact: string | null | undefined): string {
  return keyFor('obligations.impacts', IMPACTS, impact);
}

export function impactTone(impact: string | null | undefined): BadgeTone {
  return IMPACT_TONES[impact as Impact] ?? 'neutral';
}

export function changeStatusKey(status: string | null | undefined): string {
  return keyFor('obligations.changeStatus', CHANGE_STATUSES, status);
}

export function frameworkKey(framework: string | null | undefined): string {
  return keyFor('obligations.frameworks', FRAMEWORKS, framework);
}

/** Today as `YYYY-MM-DD` in the viewer's timezone. */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Whole days from `today` to an ISO day (negative when past); null for no/invalid day. */
export function daysUntil(day: string | null | undefined, today: Date = new Date()): number | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}/.test(day)) {
    return null;
  }
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}

/** A safe external link: only http(s) URLs are rendered as links. */
export function safeUrl(url: string | null | undefined): string | null {
  const value = url?.trim();
  return value && /^https?:\/\//i.test(value) ? value : null;
}
