import { BadgeTone } from '../../shared/ui/badge/badge';
import {
  INPUT_CATEGORIES,
  INPUT_METRICS,
  INPUT_SOURCES,
  MeetingDetail,
  MeetingStatus,
  ReviewInput,
  ReviewStatus,
} from './data/management-review.models';

/** The Transloco scope (portal path), its alias and the module key of M07. */
export const MR_SCOPE = 'management-review';
export const MR_MODULE = 'management_review';
export const MR_BASE = '/management-review';

export const MR_PERMISSIONS = {
  read: 'management_review:read',
  write: 'management_review:write',
  manage: 'management_review:manage',
  sign: 'management_review:sign',
} as const;

export const reviewStatusKey = (s: string) => `managementReview.reviewStatus.${s}`;
export const meetingStatusKey = (s: string) => `managementReview.meetingStatus.${s}`;
export const minutesStatusKey = (s: string) => `managementReview.minutesStatus.${s}`;
export const meetingKindKey = (k: string) => `managementReview.meetingKind.${k}`;
export const frameworkKey = (f: string) => `managementReview.frameworks.${f}`;
export const assessmentKey = (a: string) => `managementReview.assessment.${a}`;
export const attendeeRoleKey = (r: string) => `managementReview.attendeeRole.${r}`;
export const attendanceKey = (a: string) => `managementReview.attendance.${a}`;
export const decisionCategoryKey = (c: string) => `managementReview.decisionCategory.${c}`;
export const reviewActionKey = (a: string) => `managementReview.reviewActions.${a}`;
export const missingKey = (m: string) => `managementReview.missing.${m}`;

export function reviewStatusTone(status: ReviewStatus | string): BadgeTone {
  switch (status) {
    case 'in_progress':
      return 'info';
    case 'awaiting_signoff':
      return 'warn';
    case 'signed':
      return 'pass';
    case 'cancelled':
      return 'neutral';
    default:
      return 'accent';
  }
}

export function meetingStatusTone(status: MeetingStatus | string): BadgeTone {
  switch (status) {
    case 'in_progress':
      return 'info';
    case 'completed':
      return 'pass';
    case 'cancelled':
      return 'neutral';
    default:
      return 'accent';
  }
}

/** Open (not yet signed or cancelled) review statuses. */
export const OPEN_REVIEW_STATUSES: readonly ReviewStatus[] = [
  'planned',
  'in_progress',
  'awaiting_signoff',
];

/** The forward steps of a review, for the progress stepper. */
export const REVIEW_STEPS: readonly ReviewStatus[] = [
  'planned',
  'in_progress',
  'awaiting_signoff',
  'signed',
];

/**
 * The meeting status changes the API accepts from a status (contract):
 * planned -> in_progress|completed|cancelled; in_progress -> completed|cancelled;
 * completed -> in_progress (while the minutes are not approved); cancelled -> planned.
 */
export function meetingTransitions(
  meeting: Pick<MeetingDetail, 'status' | 'minutes_status'>,
): MeetingStatus[] {
  switch (meeting.status) {
    case 'planned':
      return ['in_progress', 'completed', 'cancelled'];
    case 'in_progress':
      return ['completed', 'cancelled'];
    case 'completed':
      return meeting.minutes_status === 'approved' ? [] : ['in_progress'];
    case 'cancelled':
      return ['planned'];
    default:
      return [];
  }
}

/** i18n key of the button that moves a meeting from `from` to `to`. */
export function meetingTransitionKey(from: MeetingStatus, to: MeetingStatus): string {
  if (to === 'in_progress') {
    return from === 'completed'
      ? 'managementReview.meeting.transitions.reopen'
      : 'managementReview.meeting.transitions.start';
  }
  return `managementReview.meeting.transitions.${to === 'planned' ? 'replan' : to}`;
}

const KNOWN_CATEGORIES = new Set<string>(INPUT_CATEGORIES);
const KNOWN_SOURCES = new Set<string>(INPUT_SOURCES);
const KNOWN_METRICS = new Set<string>(INPUT_METRICS);

/** Display label of an input: its own title (custom inputs) or the category name. */
export function inputTitleKey(input: Pick<ReviewInput, 'category' | 'title'>): string | null {
  if (input.category === 'custom' || !KNOWN_CATEGORIES.has(input.category)) {
    return null;
  }
  return `managementReview.inputCategories.${input.category}.title`;
}

/** Help text key of a category (what to look at), null for custom inputs. */
export function inputHintKey(category: string): string | null {
  return category !== 'custom' && KNOWN_CATEGORIES.has(category)
    ? `managementReview.inputCategories.${category}.hint`
    : null;
}

/** Turn `snake_case` / `dotted.keys` into a readable fallback label. */
export function humanize(key: string): string {
  const text = key.replace(/[._]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
}

/** i18n key of a data section source, or null to show {@link humanize}d text. */
export function sourceKey(source: string): string | null {
  return KNOWN_SOURCES.has(source)
    ? `managementReview.inputSources.${source.replace('.', '_')}`
    : null;
}

/** i18n key of a metric, or null to show {@link humanize}d text. */
export function metricKey(metric: string): string | null {
  return KNOWN_METRICS.has(metric) ? `managementReview.metrics.${metric}` : null;
}

/** Breakdown values (severities, statuses, effectiveness) with a translation. */
export const BREAKDOWN_VALUES = [
  'low',
  'medium',
  'high',
  'critical',
  'open',
  'investigating',
  'action',
  'verification',
  'closed',
  'cancelled',
  'in_progress',
  'done',
  'verified',
  'draft',
  'in_review',
  'approved',
  'obsolete',
  'effective',
  'not_effective',
  'pending',
] as const;
const KNOWN_VALUES = new Set<string>(BREAKDOWN_VALUES);

/** i18n key of a breakdown value, or null to show {@link humanize}d text. */
export function valueKey(value: string): string | null {
  return KNOWN_VALUES.has(value) ? `managementReview.values.${value}` : null;
}

/** `[key, count]` pairs of a breakdown, largest first, ignoring non-numbers. */
export function breakdown(
  values: Readonly<Record<string, unknown>> | null | undefined,
): [string, number][] {
  if (!values) {
    return [];
  }
  return Object.entries(values)
    .filter((e): e is [string, number] => typeof e[1] === 'number')
    .sort((a, b) => b[1] - a[1]);
}

// --- dates -----------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** A naive UTC ISO date-time from the API -> a `datetime-local` input value (local time). */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` input value (local time) -> naive UTC ISO for the API (null when empty). */
export function fromLocalInput(value: string): string | null {
  if (!value) {
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return utcNaive(d);
}

/** A moment as the API's naive UTC ISO (`YYYY-MM-DDTHH:mm:ss`). */
export function utcNaive(d = new Date()): string {
  return d.toISOString().slice(0, 19);
}

/** A date input value (`YYYY-MM-DD`) -> a naive date-time at midnight for date-only due dates. */
export function dueFromDay(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : null;
}

/** The `YYYY-MM-DD` part of an API date-time, for a date input. */
export function dayOf(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

/** Trimmed text, or null when empty. */
export function textOrNull(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text ? text : null;
}

/** A positive whole number from an input value, or null. */
export function minutesOrNull(value: string): number | null {
  const n = Math.round(Number(value));
  return value.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

/** Today as `YYYY-MM-DD` (local calendar). */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whether a date-time (naive UTC) is in the past and the related work is not done. */
export function isPast(value: string | null | undefined, now = new Date()): boolean {
  if (!value) {
    return false;
  }
  const iso = /[zZ]$/.test(value) ? value : `${value}Z`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t < now.getTime();
}

/** Display name of a member or external attendee. */
export function attendeeName(a: {
  user: { name: string | null; id: string } | null;
  name: string | null;
}): string {
  return a.user?.name || a.name || a.user?.id || '';
}
