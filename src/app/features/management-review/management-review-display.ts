import { ModuleNavItem } from '../../shared/ui/module-nav/module-nav';
import { Breadcrumb } from '../../shared/ui/page-header/page-header';
import {
  INPUT_CATEGORIES,
  MeetingDetail,
  MeetingStatus,
  ReviewDetail,
  ReviewInput,
  ReviewStatus,
  SubmitRequirement,
} from './data/management-review.models';

/** The Transloco scope (portal path), the module key and the base route of M07. */
export const MR_SCOPE = 'management-review';
export const MR_MODULE = 'management_review';
export const MR_BASE = '/management-review';
/** h1 of the module root = nav label = first breadcrumb (`modules.names.<key>`). */
export const MR_NAME_KEY = 'modules.names.management_review';
/** The gear in every page header: the module's settings (review interval, reminder). */
export const MR_SETTINGS_LINK = '/settings/modules/management-review';

export const MR_PERMISSIONS = {
  read: 'management_review:read',
  write: 'management_review:write',
  manage: 'management_review:manage',
  sign: 'management_review:sign',
} as const;

/** The module's sub-navigation, directly under the page header. */
export const MR_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'managementReview.nav.reviews', link: '/management-review/reviews' },
  { labelKey: 'managementReview.nav.meetings', link: '/management-review/meetings' },
];

/** Breadcrumb of the module root, then the sub-area and the page (when given). */
export function mrCrumbs(...rest: Breadcrumb[]): Breadcrumb[] {
  return [{ labelKey: MR_NAME_KEY, link: '/management-review/reviews' }, ...rest];
}

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
export const criterionKey = (c: string) => `managementReview.criteria.${c}.label`;
export const criterionHintKey = (c: string) => `managementReview.criteria.${c}.hint`;
/** A criterion's rating reads as an answer to it: Ja / Delvis / Nei. */
export const criterionRatingKey = (a: string) => `managementReview.criteria.rating.${a}`;
export const lockReasonKey = (r: string) => `managementReview.meeting.locked.${r}`;
export const actionStatusKey = (s: string) => `managementReview.actionStatus.${s}`;

/**
 * The shared lifecycle tone map (`app-status-badge meaning="lifecycle"`) does not
 * know this module's words; these aliases give them the right colour. The label
 * always comes from the module's own key.
 */
const LIFECYCLE_ALIASES: Readonly<Record<string, string>> = {
  awaiting_signoff: 'pending_approval',
  signed: 'approved',
  present: 'done',
  absent: 'overdue',
  excused: 'draft',
  invited: 'planned',
  no_task: 'overdue',
};

/** The value to give `app-status-badge` for a review, meeting, minutes or attendance status. */
export function toneValue(status: string | null | undefined): string {
  return status ? (LIFECYCLE_ALIASES[status] ?? status) : '';
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

// --- review workspace sections ---------------------------------------------------------

/**
 * The review page is split into the four steps of the work, so one screen holds
 * one job: the inputs, the meeting, the outputs and the sign-off.
 */
export const REVIEW_SECTIONS = ['inputs', 'meeting', 'outputs', 'signoff'] as const;
export type ReviewSection = (typeof REVIEW_SECTIONS)[number];

/** Which section (and which element in it) fixes a missing sign-off item. */
export const MISSING_TARGET: Readonly<
  Record<SubmitRequirement, { section: ReviewSection; anchor: string }>
> = {
  inputs_reviewed: { section: 'inputs', anchor: 'mr-inputs' },
  meeting_completed: { section: 'meeting', anchor: 'mr-meeting-status' },
  minutes_approved: { section: 'meeting', anchor: 'mr-meeting-minutes' },
  top_management_present: { section: 'meeting', anchor: 'mr-meeting-attendees' },
  assessment_criteria: { section: 'outputs', anchor: 'mr-criteria' },
  conclusions: { section: 'outputs', anchor: 'mr-out-conclusions' },
};

/** Whether a section has nothing missing for sign-off (null when there is no check). */
export function sectionDone(r: ReviewDetail, section: ReviewSection): boolean | null {
  if (r.status === 'signed') {
    return true;
  }
  const missing = r.submit_check?.missing ?? r.missing_for_submit;
  if (!r.submit_check && missing.length === 0) {
    return null;
  }
  if (section === 'signoff') {
    return r.status === 'awaiting_signoff' ? false : missing.length === 0;
  }
  return !missing.some((m) => MISSING_TARGET[m]?.section === section);
}

/** The section a review opens on: the first one with work left (sign-off once submitted). */
export function defaultSection(r: ReviewDetail): ReviewSection {
  if (r.status === 'awaiting_signoff' || r.status === 'signed' || r.status === 'cancelled') {
    return 'signoff';
  }
  const missing = r.submit_check?.missing ?? r.missing_for_submit;
  for (const section of REVIEW_SECTIONS) {
    if (missing.some((m) => MISSING_TARGET[m]?.section === section)) {
      return section;
    }
  }
  return missing.length === 0 && r.submit_check ? 'signoff' : 'inputs';
}

// --- meetings --------------------------------------------------------------------------

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

// --- inputs ----------------------------------------------------------------------------

const KNOWN_CATEGORIES = new Set<string>(INPUT_CATEGORIES);

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

/** Whether an input counts as done for sign-off (reviewed, or not relevant with a reason). */
export function inputDone(i: Pick<ReviewInput, 'done' | 'reviewed' | 'not_relevant'>): boolean {
  return i.done ?? (i.reviewed || !!i.not_relevant);
}

/**
 * The split clause of an input: the canonical ref (`hs:9.3.2`) and the item in it
 * (`c 1`). Older payloads only have `clause` ("iso9001:9.3.2 c 1"), split here.
 */
export function inputClause(
  i: Pick<ReviewInput, 'clause' | 'clause_ref' | 'clause_item'>,
): { ref: string; item: string | null } | null {
  if (i.clause_ref) {
    return { ref: i.clause_ref, item: i.clause_item || null };
  }
  if (!i.clause) {
    return null;
  }
  const [ref, ...rest] = i.clause.trim().split(/\s+/);
  return { ref, item: rest.length ? rest.join(' ') : null };
}

/** "c 1" -> "c) 1)", the way ISO writes list items. */
export function formatClauseItem(item: string | null | undefined): string {
  return (item ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part})`)
    .join(' ');
}

/** Turn `snake_case` / `dotted.keys` into a readable fallback label. */
export function humanize(key: string): string {
  const text = key.replace(/[._]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
}

/** Section sources the compilers produce, each with `managementReview.inputSources.*`. */
export const INPUT_SOURCES = [
  'deviations',
  'deviations.customer',
  'deviations.audit',
  'deviations.incident',
  'corrective_actions',
  'previous_review',
  'readiness',
  'documents',
  'module',
  'objectives',
  'objectives.kpis',
  'objectives.measurements',
  'inspections',
  'processes',
  'risk',
  'risk.opportunities',
  'risk.soa',
  'audits',
  'audits.ofi',
  'suppliers',
  'obligations',
  'environment',
  'hse',
  'meetings.safety',
  'ai_governance',
  'feedback',
  'feedback.suggestions',
  'context',
  'context.interested_parties',
  'training',
] as const;
const KNOWN_SOURCES = new Set<string>(INPUT_SOURCES);

/** Metric keys the compilers produce, each with `managementReview.metrics.*`. */
export const INPUT_METRICS = [
  'achieved',
  'actions',
  'actions_cancelled',
  'actions_done',
  'actions_open',
  'actions_overdue',
  'active',
  'analyses',
  'analyses_updated',
  'approved_in_period',
  'aspects',
  'assessments_completed',
  'assessments_overdue',
  'assignments_open',
  'assignments_overdue',
  'at_risk',
  'audits_cancelled',
  'audits_completed',
  'audits_planned',
  'average_progress',
  'average_satisfaction',
  'average_score',
  'average_score_pct',
  'certificates_expiring_180_days',
  'changes_to_assess',
  'closed',
  'complaints',
  'complaints_open',
  'compliance_obligations',
  'compliant',
  'compliments',
  'completed',
  'consultations_held',
  'consultations_planned',
  'controls_applicable',
  'critical',
  'decisions',
  'drills',
  'evaluations',
  'evaluations_completed',
  'evaluations_overdue',
  'expiring_90_days',
  'failed',
  'findings_closed',
  'findings_open',
  'findings_overdue',
  'findings_raised',
  'high_or_critical',
  'high_risk',
  'identified',
  'implemented',
  'implemented_rate',
  'major_nc',
  'measurements',
  'meetings_held',
  'minor_nc',
  'monitoring_failures',
  'monitoring_warnings',
  'new',
  'non_compliant',
  'not_achieved',
  'not_applicable',
  'not_evaluated',
  'not_measured',
  'not_started',
  'nps',
  'off_track',
  'on_time_rate',
  'on_track',
  'on_track_rate',
  'open',
  'overdue',
  'partial',
  'partially_compliant',
  'passed',
  'performance_events',
  'planned',
  'policies_updated',
  'previous_reviews',
  'quality_ok_rate',
  'raised',
  'realised',
  'received',
  'rejected_or_suspended',
  'response_overdue',
  'review_due_90_days',
  'review_overdue',
  'reviewed',
  'scopes_updated',
  'significant',
  'sja_completed',
  'sja_high_risk',
  'standards',
  'survey_responses',
  'systems',
  'total',
  'treatments_done',
  'treatments_open',
  'treatments_overdue',
  'unclassified',
  'verified',
  'with_kpis',
  'with_legal_requirement',
  'with_worker_representative',
] as const;
const KNOWN_METRICS = new Set<string>(INPUT_METRICS);

/** Breakdown dimensions (`by_<dimension>`, `open_by_status`, `effectiveness`). */
export const BREAKDOWN_DIMENSIONS = [
  'by_severity',
  'open_by_status',
  'by_status',
  'effectiveness',
  'by_level',
  'by_type',
  'by_decision',
  'by_compliance_status',
  'by_risk_class',
  'by_kind',
  'by_addressed_status',
] as const;
const KNOWN_DIMENSIONS = new Set<string>(BREAKDOWN_DIMENSIONS);

/** i18n key of a data section source, or null to show {@link humanize}d text. */
export function sourceKey(source: string): string | null {
  return KNOWN_SOURCES.has(source)
    ? `managementReview.inputSources.${source.replace(/\./g, '_')}`
    : null;
}

/** i18n key of a metric, or null to show {@link humanize}d text. */
export function metricKey(metric: string): string | null {
  return KNOWN_METRICS.has(metric) ? `managementReview.metrics.${metric}` : null;
}

/** i18n key of a breakdown dimension, or null to show {@link humanize}d text. */
export function dimensionKey(dimension: string): string | null {
  return KNOWN_DIMENSIONS.has(dimension) ? `managementReview.inputData.${dimension}` : null;
}

/** Metrics that are a share (0-100) and read with a "%". */
export function isPercent(metric: string): boolean {
  return /(_rate|_pct|_progress)$/.test(metric);
}

/** Breakdown values (severities, statuses, results, kinds) with a module translation. */
export const BREAKDOWN_VALUES = [
  'low',
  'medium',
  'high',
  'critical',
  'very_high',
  'very_low',
  'minimal',
  'limited',
  'prohibited',
  'unacceptable',
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
  'under_review',
  'active',
  'retired',
  'approved',
  'conditional',
  'rejected',
  'suspended',
  'obsolete',
  'effective',
  'partially_effective',
  'not_effective',
  'pending',
  'planned',
  'compliant',
  'partially_compliant',
  'non_compliant',
  'not_assessed',
  'not_applicable',
  'addressed',
  'partially',
  'partially_addressed',
  'not_addressed',
  'complaint',
  'compliment',
  'suggestion',
  'question',
  'internal',
  'external',
  'certification',
  'supplier',
  'ofi',
  'observation',
  'minor_nc',
  'major_nc',
  'not_evaluated',
  'other',
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

/** Change since the previous review: `up` / `down` / `same`, or null when unknown. */
export function trend(
  value: unknown,
  previous: unknown,
): { readonly direction: 'up' | 'down' | 'same'; readonly delta: number } | null {
  if (typeof value !== 'number' || typeof previous !== 'number') {
    return null;
  }
  const delta = Math.round((value - previous) * 10) / 10;
  return { direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same', delta: Math.abs(delta) };
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

/** The day after `YYYY-MM-DD` (a new period starts the day after the last one ended). */
export function nextDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return '';
  }
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return d.toISOString().slice(0, 10);
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
