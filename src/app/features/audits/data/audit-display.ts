import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  CertificationStatus,
  ChecklistResult,
  FindingStatus,
  FindingType,
  PlanStatus,
  ProgrammeStatus,
  RiskLevel,
} from './audit.models';

/** Badge tones of the audit vocabularies (labels live under `audits.<vocabulary>.<value>`). */
export function programmeStatusTone(status: ProgrammeStatus | string): BadgeTone {
  switch (status) {
    case 'approved':
      return 'pass';
    case 'closed':
      return 'neutral';
    default:
      return 'accent';
  }
}

export function planStatusTone(status: PlanStatus | string): BadgeTone {
  switch (status) {
    case 'in_progress':
      return 'info';
    case 'reporting':
    case 'report_review':
      return 'warn';
    case 'closed':
      return 'pass';
    case 'cancelled':
      return 'neutral';
    default:
      return 'accent';
  }
}

export function findingTypeTone(type: FindingType | string): BadgeTone {
  switch (type) {
    case 'major_nc':
      return 'fail';
    case 'minor_nc':
      return 'warn';
    case 'observation':
      return 'info';
    default:
      return 'accent';
  }
}

export function findingStatusTone(status: FindingStatus | string): BadgeTone {
  switch (status) {
    case 'in_progress':
      return 'info';
    case 'pending_verification':
      return 'warn';
    case 'closed':
      return 'pass';
    case 'cancelled':
      return 'neutral';
    default:
      return 'accent';
  }
}

export function certificationStatusTone(status: CertificationStatus | string): BadgeTone {
  switch (status) {
    case 'certified':
      return 'pass';
    case 'in_progress':
      return 'info';
    case 'suspended':
      return 'warn';
    case 'withdrawn':
    case 'expired':
      return 'fail';
    default:
      return 'accent';
  }
}

export function riskTone(level: RiskLevel | string): BadgeTone {
  switch (level) {
    case 'high':
      return 'fail';
    case 'medium':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function checklistResultTone(result: ChecklistResult | string): BadgeTone {
  switch (result) {
    case 'conforming':
      return 'pass';
    case 'nonconforming':
      return 'fail';
    case 'observation':
      return 'info';
    case 'not_applicable':
      return 'neutral';
    default:
      return 'accent';
  }
}

/** Percentage (0-100, rounded) of answered checklist questions. */
export function checklistProgress(answered: number, total: number): number {
  return total > 0 ? Math.round((answered / total) * 100) : 0;
}

/** The `YYYY-MM-DD` part of a naive UTC datetime, for a date input ('' when empty). */
export function toDateInput(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

/** A date input value as a naive UTC datetime at midnight, or null when blank. */
export function fromDateInput(value: string | null | undefined): string | null {
  const day = value?.trim().match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  return day ? `${day}T00:00:00` : null;
}

/** Parse a free-text list of clause references ("iso9001:8.4, hs:9.2" or one per line). */
export function parseClauseRefs(text: string): string[] {
  const refs = text
    .split(/[\s,;]+/)
    .map((r) => r.trim())
    .filter((r) => /^[a-z0-9_]+:[A-Za-z0-9.\-_]+$/.test(r));
  return [...new Set(refs)];
}

/** Trimmed text, or null when blank (optional API fields). */
export function textOrNull(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text ? text : null;
}

/** Display name of an audit team member (user name, else the external name). */
export function auditorName(a: {
  readonly user: { readonly name: string | null; readonly id: string } | null;
  readonly external_name: string | null;
}): string {
  return a.user?.name || a.external_name || a.user?.id || '';
}

/** Sum of the counts of `keys` (all keys when omitted) in a value -> count map. */
export function sumCounts(
  counts: Readonly<Record<string, number>>,
  keys?: readonly string[],
): number {
  return Object.entries(counts)
    .filter(([k]) => !keys || keys.includes(k))
    .reduce((n, [, v]) => n + v, 0);
}
