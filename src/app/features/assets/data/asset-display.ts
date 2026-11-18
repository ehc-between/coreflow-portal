import { ToneMeaning } from '../../../shared/ui/tones';
import {
  AttentionCode,
  CalibrationResult,
  CalibrationStatus,
  ChangeDetail,
  ChangeType,
  Classification,
  Criticality,
  Decision,
  LifecycleStatus,
  LocalizedLabel,
  ReviewStatus,
  RiskLevel,
  SubjectStatus,
} from './asset.models';

/** A badge on the shared tone map: `<app-status-badge [meaning] [value] [labelKey]>`. */
export interface BadgeSpec {
  readonly meaning: ToneMeaning;
  readonly value: string;
}

const lifecycle = (value: string): BadgeSpec => ({ meaning: 'lifecycle', value });
const severity = (value: string): BadgeSpec => ({ meaning: 'severity', value });

/**
 * Classification reads as sensitivity: restricted red, confidential amber, internal and
 * public grey (there is nothing to celebrate about a public document).
 */
export function classificationBadge(value: Classification): BadgeSpec {
  switch (value) {
    case 'restricted':
      return severity('high');
    case 'confidential':
      return severity('medium');
    default:
      return severity('low');
  }
}

/** Criticality and risk level use the severity scale (critical / high red, medium amber). */
export function levelBadge(value: Criticality | RiskLevel | string): BadgeSpec {
  return severity(value);
}

const LIFECYCLE_BADGES: Readonly<Record<LifecycleStatus, BadgeSpec>> = {
  planned: lifecycle('planned'),
  in_use: lifecycle('active'),
  maintenance: lifecycle('on_hold'),
  quarantined: lifecycle('blocked'),
  retired: lifecycle('retired'),
  disposed: lifecycle('archived'),
};

/** Lifecycle: in use blue, maintenance / out of use amber, retired / disposed grey. */
export function lifecycleBadge(value: LifecycleStatus): BadgeSpec {
  return LIFECYCLE_BADGES[value] ?? lifecycle(value);
}

/** Calibration status: calibrated green, due soon amber, overdue red. */
export function calibrationBadge(value: CalibrationStatus | null | undefined): BadgeSpec {
  switch (value) {
    case 'ok':
      return lifecycle('effective');
    case 'due_soon':
      return lifecycle('due');
    case 'overdue':
      return lifecycle('failed');
    default:
      return lifecycle('draft');
  }
}

/** Register review (A.5.9): on time green, due soon / overdue amber. */
export function reviewDueBadge(value: CalibrationStatus | null | undefined): BadgeSpec {
  switch (value) {
    case 'ok':
      return lifecycle('effective');
    case 'due_soon':
      return lifecycle('due');
    case 'overdue':
      return lifecycle('overdue');
    default:
      return lifecycle('draft');
  }
}

/** A calibration result: passed green, adjusted amber, failed red. */
export function resultBadge(value: CalibrationResult): BadgeSpec {
  switch (value) {
    case 'pass':
      return lifecycle('passed');
    case 'adjusted':
      return lifecycle('due');
    default:
      return lifecycle('failed');
  }
}

/** Access review status (planned, in progress, completed, cancelled). */
export function reviewStatusBadge(value: ReviewStatus): BadgeSpec {
  return lifecycle(value);
}

/** A reviewer's decision: keep green, change amber, revoke red, undecided grey. */
export function decisionBadge(value: Decision): BadgeSpec {
  switch (value) {
    case 'keep':
      return lifecycle('approved');
    case 'modify':
      return lifecycle('due');
    case 'revoke':
      return lifecycle('rejected');
    default:
      return lifecycle('draft');
  }
}

/** The holder of an account in People: left / not a member red, leaving amber. */
export function subjectStatusBadge(value: SubjectStatus): BadgeSpec {
  switch (value) {
    case 'left':
    case 'not_member':
      return lifecycle('failed');
    case 'leaving':
      return lifecycle('due');
    default:
      return lifecycle('active');
  }
}

/** Whether an account's holder should make the reviewer look twice. */
export function isFlaggedSubject(value: SubjectStatus | null | undefined): boolean {
  return value === 'left' || value === 'leaving' || value === 'not_member';
}

/** A workflow state category (open, in_progress, done, cancelled) on the lifecycle scale. */
export function stateCategoryBadge(category: string): BadgeSpec {
  switch (category) {
    case 'done':
      return lifecycle('done');
    case 'in_progress':
      return lifecycle('in_progress');
    case 'cancelled':
      return lifecycle('cancelled');
    default:
      return lifecycle('open');
  }
}

/** Change type: emergency red (approved afterwards), standard grey, normal not shown. */
export function changeTypeBadge(value: ChangeType): BadgeSpec {
  return value === 'emergency' ? severity('high') : severity('low');
}

/** Every follow-up flag is a to-do (amber); the overdue calibration in use is red. */
export function attentionBadge(code: AttentionCode): BadgeSpec {
  return code === 'calibration_overdue_in_use' || code === 'calibration_impact_missing'
    ? lifecycle('failed')
    : lifecycle('due');
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
