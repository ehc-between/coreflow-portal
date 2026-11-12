/**
 * DTOs of the management review and meetings API (M07), mirroring
 * `app/modules/management_review/schemas.py` in coreflow-core. Datetimes are
 * naive UTC ISO strings; dates are `YYYY-MM-DD`.
 */

export const FRAMEWORKS = ['iso9001', 'iso27001', 'iso14001', 'iso42001', 'iso45001'] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export const REVIEW_STATUSES = [
  'planned',
  'in_progress',
  'awaiting_signoff',
  'signed',
  'cancelled',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_SORTS = [
  '-created_at',
  '-scheduled_at',
  'scheduled_at',
  'code',
  'title',
] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const ASSESSMENTS = ['effective', 'partially_effective', 'not_effective'] as const;
export type Assessment = (typeof ASSESSMENTS)[number];

export const REVIEW_ACTIONS = [
  'start',
  'compile',
  'submit',
  'sign',
  'return',
  'cancel',
  'delete',
] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const SUBMIT_REQUIREMENTS = [
  'conclusions',
  'system_assessment',
  'meeting_completed',
] as const;
export type SubmitRequirement = (typeof SUBMIT_REQUIREMENTS)[number];

/** Every kind a meeting can have (`management_review` is created only with a review). */
export const MEETING_KINDS = [
  'general',
  'management_review',
  'committee',
  'project',
  'audit',
  'safety',
  'training',
  'other',
] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];
/** The kinds a user can pick for a stand-alone meeting. */
export const CREATABLE_MEETING_KINDS: readonly MeetingKind[] = MEETING_KINDS.filter(
  (k) => k !== 'management_review',
);

export const MEETING_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MINUTES_STATUSES = ['draft', 'approved'] as const;
export type MinutesStatus = (typeof MINUTES_STATUSES)[number];

export const MEETING_SORTS = ['-scheduled_at', 'scheduled_at', '-created_at', 'title'] as const;
export type MeetingSort = (typeof MEETING_SORTS)[number];

export const ATTENDEE_ROLES = ['chair', 'secretary', 'participant', 'guest'] as const;
export type AttendeeRole = (typeof ATTENDEE_ROLES)[number];

export const ATTENDANCES = ['invited', 'present', 'absent', 'excused'] as const;
export type Attendance = (typeof ATTENDANCES)[number];

export const DECISION_CATEGORIES = [
  'decision',
  'action',
  'improvement',
  'change',
  'resource',
  'other',
] as const;
export type DecisionCategory = (typeof DECISION_CATEGORIES)[number];

/** Input categories of the catalogue (`GET /input-categories`), plus `custom`. */
export const INPUT_CATEGORIES = [
  'previous_actions',
  'context_changes',
  'interested_parties',
  'customer_feedback',
  'objectives',
  'process_performance',
  'nonconformities',
  'monitoring_results',
  'audit_results',
  'conformity_status',
  'incidents',
  'supplier_performance',
  'compliance_obligations',
  'environmental_aspects',
  'worker_consultation',
  'information_security',
  'ai_systems',
  'documented_information',
  'resources',
  'risks_opportunities',
  'improvement_opportunities',
  'custom',
] as const;

/** Section sources the built-in compilers produce (others are shown as-is). */
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
] as const;

/** Metric keys the built-in compilers produce (others are shown as-is). */
export const INPUT_METRICS = [
  'raised',
  'closed',
  'open',
  'overdue',
  'completed',
  'verified',
  'previous_reviews',
  'decisions',
  'actions',
  'actions_done',
  'actions_open',
  'actions_overdue',
  'actions_cancelled',
  'standards',
  'total',
  'review_overdue',
] as const;

/** Assist keys the backend registers (POST `ai/assist/{key}`). */
export const ASSIST_DRAFT_INPUT_SUMMARY = 'management_review.draft_input_summary';
export const ASSIST_DRAFT_MINUTES = 'management_review.draft_minutes';
export const ASSIST_SUGGEST_OUTPUTS = 'management_review.suggest_outputs';

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

// --- catalogue -------------------------------------------------------------------------

export interface InputCategory {
  readonly key: string;
  readonly frameworks: readonly string[];
  readonly clause: string;
  readonly auto: boolean;
}

// --- meetings --------------------------------------------------------------------------

export interface TaskRef {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly due_at: string | null;
  readonly url: string;
}

export interface AgendaItem {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly notes: string | null;
  readonly presenter: UserRef | null;
  readonly duration_minutes: number | null;
}

export interface Attendee {
  readonly id: string;
  readonly user: UserRef | null;
  readonly name: string | null;
  readonly external: boolean;
  readonly role: AttendeeRole;
  readonly attendance: Attendance;
}

export interface Decision {
  readonly id: string;
  readonly position: number;
  readonly category: DecisionCategory;
  readonly text: string;
  readonly owner: UserRef | null;
  readonly due_at: string | null;
  readonly task: TaskRef | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ReviewRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ReviewStatus;
  readonly url: string;
}

export interface MeetingSummary {
  readonly id: string;
  readonly code: string;
  readonly kind: MeetingKind;
  readonly title: string;
  readonly location: string | null;
  readonly scheduled_at: string | null;
  readonly duration_minutes: number | null;
  readonly status: MeetingStatus;
  readonly minutes_status: MinutesStatus;
  readonly chair: UserRef | null;
  readonly attendee_count: number;
  readonly decision_count: number;
  readonly review_id: string | null;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MeetingDetail extends MeetingSummary {
  readonly org_id: string;
  readonly purpose: string | null;
  readonly held_at: string | null;
  readonly secretary: UserRef | null;
  readonly minutes: string | null;
  readonly minutes_approved_by: UserRef | null;
  readonly minutes_approved_at: string | null;
  readonly created_by: UserRef | null;
  readonly review: ReviewRef | null;
  readonly agenda: readonly AgendaItem[];
  readonly attendees: readonly Attendee[];
  readonly decisions: readonly Decision[];
  readonly locked: boolean;
  readonly can_edit: boolean;
  readonly can_approve_minutes: boolean;
}

export interface MeetingListQuery {
  readonly q?: string;
  readonly status?: readonly MeetingStatus[];
  readonly kind?: readonly MeetingKind[];
  readonly from?: string;
  readonly to?: string;
  readonly include_reviews?: boolean;
  readonly sort?: MeetingSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AgendaItemIn {
  readonly title: string;
  readonly notes?: string | null;
  readonly presenter_user_id?: string | null;
  readonly duration_minutes?: number | null;
}

export interface AttendeeIn {
  readonly user_id?: string | null;
  readonly name?: string | null;
  readonly role?: AttendeeRole;
  readonly attendance?: Attendance;
}

export interface AttendeeUpdate {
  readonly role?: AttendeeRole;
  readonly attendance?: Attendance;
}

export interface CreateMeetingRequest {
  readonly title: string;
  readonly kind?: MeetingKind;
  readonly purpose?: string | null;
  readonly location?: string | null;
  readonly scheduled_at?: string | null;
  readonly duration_minutes?: number | null;
  readonly chair_user_id?: string | null;
  readonly secretary_user_id?: string | null;
  readonly agenda?: readonly AgendaItemIn[];
  readonly attendees?: readonly AttendeeIn[];
}

export interface UpdateMeetingRequest {
  readonly title?: string;
  readonly kind?: MeetingKind;
  readonly purpose?: string | null;
  readonly location?: string | null;
  readonly scheduled_at?: string | null;
  readonly duration_minutes?: number | null;
  readonly chair_user_id?: string | null;
  readonly secretary_user_id?: string | null;
  readonly minutes?: string | null;
  readonly status?: MeetingStatus;
  readonly change_reason?: string | null;
}

export interface DecisionIn {
  readonly text?: string;
  readonly category?: DecisionCategory;
  readonly owner_user_id?: string | null;
  readonly due_at?: string | null;
  readonly create_action?: boolean;
  readonly action_title?: string | null;
}

// --- reviews ---------------------------------------------------------------------------

export interface InputSection {
  readonly source: string;
  readonly metrics?: Readonly<Record<string, number | string | null>>;
  readonly by_severity?: Readonly<Record<string, number>>;
  readonly open_by_status?: Readonly<Record<string, number>>;
  readonly by_status?: Readonly<Record<string, number>>;
  readonly effectiveness?: Readonly<Record<string, number>> | null;
  readonly items?: readonly Readonly<Record<string, unknown>>[];
  readonly previous?: {
    readonly id: string;
    readonly code: string;
    readonly status: string;
    readonly signed_at: string | null;
    readonly url: string;
  } | null;
}

export interface InputData {
  readonly available?: boolean;
  readonly sections?: readonly InputSection[];
}

export interface ReviewInput {
  readonly id: string;
  readonly category: string;
  readonly title: string | null;
  readonly position: number;
  readonly source: 'auto' | 'manual';
  readonly auto: boolean;
  readonly clause: string | null;
  readonly frameworks: readonly string[];
  readonly data: InputData;
  readonly compiled_at: string | null;
  readonly notes: string | null;
  readonly reviewed: boolean;
  readonly updated_at: string;
}

export interface ActionStats {
  readonly total: number;
  readonly open: number;
  readonly done: number;
  readonly overdue: number;
}

export interface ReviewSummary {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ReviewStatus;
  readonly frameworks: readonly Framework[];
  readonly period_start: string | null;
  readonly period_end: string | null;
  readonly scheduled_at: string | null;
  readonly meeting_id: string | null;
  readonly meeting_status: MeetingStatus | null;
  readonly owner: UserRef | null;
  readonly signed_at: string | null;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ReviewDetail extends ReviewSummary {
  readonly org_id: string;
  readonly inputs_summary: string | null;
  readonly conclusions: string | null;
  readonly improvement_opportunities: string | null;
  readonly change_needs: string | null;
  readonly resource_needs: string | null;
  readonly system_assessment: Assessment | null;
  readonly inputs_compiled_at: string | null;
  readonly submitted_at: string | null;
  readonly submitted_by: UserRef | null;
  readonly signed_by: UserRef | null;
  readonly signature_name: string | null;
  readonly signature_statement: string | null;
  readonly report_sha256: string | null;
  readonly cancelled_at: string | null;
  readonly created_by: UserRef | null;
  readonly inputs: readonly ReviewInput[];
  readonly meeting: MeetingDetail | null;
  readonly actions: ActionStats;
  readonly missing_for_submit: readonly SubmitRequirement[];
  readonly can_edit: boolean;
  readonly allowed_actions: readonly ReviewAction[];
}

export interface ReviewListQuery {
  readonly q?: string;
  readonly status?: readonly ReviewStatus[];
  readonly framework?: Framework;
  readonly owner?: string;
  readonly sort?: ReviewSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateReviewRequest {
  readonly title: string;
  readonly frameworks?: readonly Framework[];
  readonly period_start?: string | null;
  readonly period_end?: string | null;
  readonly owner_user_id?: string | null;
  readonly scheduled_at?: string | null;
  readonly location?: string | null;
  readonly duration_minutes?: number | null;
  readonly chair_user_id?: string | null;
  readonly attendees?: readonly AttendeeIn[];
  readonly agenda?: readonly AgendaItemIn[];
  readonly compile_inputs?: boolean;
}

export interface UpdateReviewRequest {
  readonly title?: string;
  readonly frameworks?: readonly Framework[];
  readonly period_start?: string | null;
  readonly period_end?: string | null;
  readonly owner_user_id?: string | null;
  readonly inputs_summary?: string | null;
  readonly conclusions?: string | null;
  readonly improvement_opportunities?: string | null;
  readonly change_needs?: string | null;
  readonly resource_needs?: string | null;
  readonly system_assessment?: Assessment | null;
  readonly change_reason?: string | null;
}

export interface InputUpdate {
  readonly notes?: string | null;
  readonly reviewed?: boolean;
  readonly title?: string;
}

export interface SignRequest {
  readonly signature_name?: string | null;
  readonly statement?: string | null;
}

/** The review report (`GET /reviews/{id}/report`); frozen once signed. */
export interface ReviewReport {
  readonly frozen: boolean;
  readonly sha256: string | null;
  readonly report: {
    readonly review: {
      readonly id: string;
      readonly code: string;
      readonly title: string;
      readonly status: ReviewStatus;
      readonly frameworks: readonly string[];
      readonly period_start: string | null;
      readonly period_end: string | null;
      readonly owner: UserRef | null;
      readonly inputs_summary: string | null;
      readonly conclusions: string | null;
      readonly system_assessment: Assessment | null;
      readonly improvement_opportunities: string | null;
      readonly change_needs: string | null;
      readonly resource_needs: string | null;
      readonly inputs_compiled_at: string | null;
    };
    readonly inputs: readonly ReviewInput[];
    readonly meeting: {
      readonly id: string;
      readonly code: string;
      readonly scheduled_at: string | null;
      readonly held_at: string | null;
      readonly location: string | null;
      readonly duration_minutes: number | null;
      readonly status: MeetingStatus;
      readonly chair: UserRef | null;
      readonly secretary: UserRef | null;
      readonly agenda: readonly AgendaItem[];
      readonly attendees: readonly Attendee[];
      readonly minutes: string | null;
      readonly minutes_status: MinutesStatus;
      readonly minutes_approved_by: UserRef | null;
      readonly minutes_approved_at: string | null;
      readonly decisions: readonly Decision[];
    } | null;
    readonly signature: {
      readonly signed_at: string;
      readonly signed_by: UserRef | null;
      readonly signature_name: string | null;
      readonly statement: string | null;
    } | null;
    readonly generated_at: string;
  };
}

/** JSON result of the `suggest_outputs` assist. */
export interface SuggestedOutputs {
  readonly decisions: readonly {
    readonly category: DecisionCategory;
    readonly text: string;
  }[];
}
