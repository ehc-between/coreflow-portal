import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  CalibrationResult,
  CalibrationStatus,
  ChangeDetail,
  Classification,
  Criticality,
  Decision,
  LifecycleStatus,
  LocalizedLabel,
  ReviewStatus,
  RiskLevel,
} from './asset.models';

/** Badge tone of an information classification. */
export function classificationTone(value: Classification): BadgeTone {
  switch (value) {
    case 'restricted':
      return 'fail';
    case 'confidential':
      return 'warn';
    case 'internal':
      return 'info';
    default:
      return 'neutral';
  }
}

/** Badge tone of a criticality or risk level. */
export function levelTone(value: Criticality | RiskLevel | null | undefined): BadgeTone {
  switch (value) {
    case 'critical':
      return 'fail';
    case 'high':
      return 'warn';
    case 'medium':
      return 'info';
    default:
      return 'neutral';
  }
}

export function lifecycleTone(value: LifecycleStatus): BadgeTone {
  switch (value) {
    case 'in_use':
      return 'pass';
    case 'planned':
      return 'info';
    case 'maintenance':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function calibrationTone(value: CalibrationStatus | null | undefined): BadgeTone {
  switch (value) {
    case 'ok':
      return 'pass';
    case 'due_soon':
      return 'warn';
    case 'overdue':
      return 'fail';
    default:
      return 'neutral';
  }
}

export function resultTone(value: CalibrationResult): BadgeTone {
  switch (value) {
    case 'pass':
      return 'pass';
    case 'adjusted':
      return 'warn';
    default:
      return 'fail';
  }
}

export function reviewStatusTone(value: ReviewStatus): BadgeTone {
  switch (value) {
    case 'planned':
      return 'info';
    case 'in_progress':
      return 'warn';
    case 'completed':
      return 'pass';
    default:
      return 'neutral';
  }
}

export function decisionTone(value: Decision): BadgeTone {
  switch (value) {
    case 'keep':
      return 'pass';
    case 'modify':
      return 'warn';
    case 'revoke':
      return 'fail';
    default:
      return 'neutral';
  }
}

/** Badge tone of a workflow state category (open, in_progress, done, cancelled). */
export function stateCategoryTone(category: string): BadgeTone {
  switch (category) {
    case 'done':
      return 'pass';
    case 'in_progress':
      return 'warn';
    case 'cancelled':
      return 'neutral';
    default:
      return 'info';
  }
}

/** The label of a workflow state in the active language (falls back to English, then the key). */
export function localizedLabel(label: LocalizedLabel | null | undefined, lang: string): string {
  if (!label) {
    return '';
  }
  if (typeof label === 'string') {
    return label;
  }
  return label[lang] ?? label['en'] ?? Object.values(label)[0] ?? '';
}

/** Trimmed text, or null when blank. */
export function blankToNull(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text ? text : null;
}

/** A `YYYY-MM-DD` value, or null when blank/invalid. */
export function dayOrNull(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** The leading `YYYY-MM-DD` of a date or date-time, or ''. */
export function toDay(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

/** A `YYYY-MM-DD` day as the naive-UTC start-of-day wire timestamp, or null. */
export function dayToTimestamp(day: string | null | undefined): string | null {
  return dayOrNull(day) ? `${day}T00:00:00` : null;
}

/** Only the fields whose value differs (shallow, arrays compared by content). */
export function changedFields<T extends object>(current: T, next: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    const a = current[key];
    const b = next[key];
    const same = Array.isArray(a) && Array.isArray(b) ? a.join('\n') === b.join('\n') : a === b;
    if (!same) {
      out[key] = b;
    }
  }
  return out;
}

/** Calendar days from today (local) to a `YYYY-MM-DD` day; negative when past. */
export function daysUntil(day: string | null | undefined, today: Date = new Date()): number | null {
  const match = dayOrNull(toDay(day));
  if (!match) {
    return null;
  }
  const [y, m, d] = match.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}

/** `YYYY-MM-DD` of a day plus a number of months (clamped to the month's last day). */
export function addMonths(day: string, months: number): string | null {
  if (!dayOrNull(day) || !Number.isFinite(months)) {
    return null;
  }
  const [y, m, d] = day.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, month, Math.min(d, last)));
  return date.toISOString().slice(0, 10);
}

/** Change-request fields a workflow step needs (mirrors the `change_request_default` template). */
export const STEP_REQUIRED_FIELDS: Readonly<Record<string, readonly ChangeStepField[]>> = {
  draft: ['description', 'reason'],
  assessment: ['impact_assessment', 'risk_level', 'implementation_plan'],
  implementing: ['implemented_at'],
  review: ['review_outcome'],
};

export type ChangeStepField =
  | 'description'
  | 'reason'
  | 'impact_assessment'
  | 'risk_level'
  | 'implementation_plan'
  | 'implemented_at'
  | 'review_outcome';

/** The fields the change still needs before its next forward step (empty when none). */
export function missingStepFields(change: ChangeDetail): readonly ChangeStepField[] {
  const needed = STEP_REQUIRED_FIELDS[change.status] ?? [];
  return needed.filter((field) => {
    const value = change[field];
    return value === null || value === undefined || (typeof value === 'string' && !value.trim());
  });
}

/** Whether a field of the change may still be edited (not frozen, not closed). */
export function canEditChangeField(change: ChangeDetail, field: string): boolean {
  return !change.closed && !change.locked_fields.includes(field);
}
