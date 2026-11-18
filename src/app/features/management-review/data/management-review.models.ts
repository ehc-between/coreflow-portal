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

/**
 * The 9.3 conclusions a review rates one by one (suitability, adequacy and
 * effectiveness in every ISO standard; alignment with the strategic direction
 * in ISO 9001 9.3.1). The overall assessment is derived as the weakest rating.
 */
export const CRITERIA = [
  'suitability',
  'adequacy',
  'effectiveness',
  'strategic_alignment',
] as const;
export type Criterion = (typeof CRITERIA)[number];

/** Where the org stands against its review interval (`GET /planning`). */
export const PLANNING_STATUSES = ['never', 'planned', 'overdue', 'due_soon', 'ok'] as const;
export type PlanningStatus = (typeof PLANNING_STATUSES)[number];

/** Why a meeting is read-only (`MeetingDetail.locked_reason`). */
export const LOCK_REASONS = [
  'review_signed',
  'review_cancelled',
  'review_awaiting_signoff',
  'minutes_approved',
] as const;
export type LockReason = (typeof LOCK_REASONS)[number];

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
  'inputs_reviewed',
  'meeting_completed',
  'minutes_approved',
  'top_management_present',
  'assessment_criteria',
  'conclusions',
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
  /** Canonical clause ref (`hs:9.3.2`) and the item in it (`c 1`). */
  readonly clause_ref?: string | null;
  readonly clause_item?: string | null;
  /** The modules the figures come from. */
  readonly modules?: readonly string[];
  readonly auto: boolean;
}

/** A record another one concerns (the kit's `EntityRefDto`). */
export interface RelatedRef {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code?: string | null;
  readonly url?: string | null;
  readonly status?: string | null;
  readonly module?: string | null;
  readonly label_key?: string | null;
}

/** A record the meeting is linked to (its own `relates_to` links, reviews excluded). */
export interface MeetingLink extends RelatedRef {
  readonly link_id: string;
  readonly link_type: string;
}

/** `{entity_type, entity_id}` of a record to link on create / update. */
export interface RelatedIn {
  readonly entity_type: string;
  readonly entity_id: string;
}

export interface AttendanceSummary {
  readonly total: number;
  readonly present: number;
  readonly absent: number;
  readonly excused: number;
  readonly invited: number;
  readonly top_management_total: number;
  readonly top_management_present: number;
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
  /** Member of top management (ISO 5.1 / 9.3: top management takes part). */
  readonly top_management?: boolean;
}

export interface Decision {
  readonly id: string;
  readonly position: number;
  readonly category: DecisionCategory;
  readonly text: string;
  readonly owner: UserRef | null;
  readonly due_at: string | null;
  readonly task: TaskRef | null;
  /** The records the decision concerns. */
  readonly related?: readonly RelatedRef[];
  /** An action without a follow-up task: nobody follows it up. */
  readonly follow_up_missing?: boolean;
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
  /** What the meeting concerns ("Gjelder"). */
  readonly related?: readonly MeetingLink[];
  readonly attendance?: AttendanceSummary;
  /** Sum of the agenda items' durations. */
  readonly agenda_minutes?: number;
  readonly locked: boolean;
  readonly locked_reason?: LockReason | null;
  readonly can_edit: boolean;
  /** A follow-up task can still be added to a decision (also after approval). */
  readonly can_create_actions?: boolean;
  readonly can_approve_minutes: boolean;
  readonly can_reopen_minutes?: boolean;
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
  /** Null: prefilled on review meetings (previous review meeting, else org admins). */
  readonly top_management?: boolean | null;
}

export interface AttendeeUpdate {
  readonly role?: AttendeeRole;
  readonly attendance?: Attendance;
  readonly top_management?: boolean;
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
  /** What the meeting concerns, linked `relates_to` on creation (max 20). */
  readonly related?: readonly RelatedIn[];
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
  /** Null on create: a follow-up task is created for the `action` category only. */
  readonly create_action?: boolean | null;
  readonly action_title?: string | null;
  /** The records the decision concerns (replaces the list on update). */
  readonly related?: readonly RelatedIn[];
}

// --- reviews ---------------------------------------------------------------------------

/** A follow-up action of the previous review (section `previous_review`). */
export interface PreviousActionItem {
  readonly decision_id: string;
  readonly category: string;
  readonly text: string;
  readonly owner_user_id?: string | null;
  readonly due_at: string | null;
  /** A task status, or `no_task` for an action without a follow-up task. */
  readonly status: string;
  readonly overdue: boolean;
  readonly task_url?: string | null;
}

/**
 * One block of figures of an input, compiled from one module. Besides the listed
 * breakdowns, any `by_<dimension>` key holds counts per value.
 */
export interface InputSection {
  readonly source: string;
  /** The portal list the figures come from. */
  readonly url?: string | null;
  readonly metrics?: Readonly<Record<string, number | string | null>>;
  /** The same figures at the previous review, for the trend. */
  readonly previous_metrics?: Readonly<Record<string, number | string | null>> | null;
  /** Counts per value of one dimension (`by_level`, `by_kind`, …). */
  readonly [breakdown: `by_${string}`]: Readonly<Record<string, number>> | null | undefined;
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
  /** Source modules that are switched off for the org. */
  readonly modules_off?: readonly string[];
}

export interface ReviewInput {
  readonly id: string;
  readonly category: string;
  readonly title: string | null;
  readonly position: number;
  readonly source: 'auto' | 'manual';
  readonly auto: boolean;
  readonly clause: string | null;
  /** `clause` split: canonical clause ref (`hs:9.3.2`) and the item in it (`c 1`). */
  readonly clause_ref?: string | null;
  readonly clause_item?: string | null;
  /** The modules the figures come from. */
  readonly modules?: readonly string[];
  readonly frameworks: readonly string[];
  readonly data: InputData;
  readonly compiled_at: string | null;
  readonly notes: string | null;
  readonly reviewed: boolean;
  readonly not_relevant?: boolean;
  readonly not_relevant_reason?: string | null;
  /** Reviewed, or not relevant with a reason (counts for sign-off). */
  readonly done?: boolean;
  readonly updated_at: string;
}

/** What sign-off still needs (null unless the review is planned or in progress). */
export interface SubmitCheck {
  readonly missing: readonly SubmitRequirement[];
  readonly inputs_total: number;
  readonly inputs_done: number;
  /** Ids of the inputs that are neither reviewed nor marked not relevant. */
  readonly inputs_pending: readonly string[];
  readonly meeting_status: MeetingStatus | null;
  readonly minutes_status: MinutesStatus | null;
  readonly attendance: AttendanceSummary | null;
  readonly criteria_complete: boolean;
  readonly ready: boolean;
}

export interface CriterionValue {
  readonly rating: Assessment | null;
  readonly note: string | null;
}

export interface AssessmentCriteria {
  readonly required: readonly Criterion[];
  readonly items: Readonly<Partial<Record<Criterion, CriterionValue>>>;
  readonly complete: boolean;
  /** The weakest rating, once every required criterion is rated. */
  readonly derived: Assessment | null;
}

export interface OpenAction {
  readonly decision_id: string;
  readonly category: string;
  readonly text: string;
  readonly owner: UserRef | null;
  readonly due_at: string | null;
  readonly status: string;
  readonly overdue: boolean;
  readonly task: TaskRef | null;
}

/** The previous / next review; the previous one carries its follow-up actions. */
export interface NeighbourReview {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ReviewStatus;
  readonly signed_at: string | null;
  readonly url: string;
  readonly actions?: (ActionStats & { readonly items: readonly OpenAction[] }) | null;
}

/** `GET /settings`. */
export interface MrSettings {
  readonly review_interval_months: number;
  readonly reminder_days: number;
  readonly can_manage: boolean;
}

export interface MrSettingsUpdate {
  readonly review_interval_months?: number;
  readonly reminder_days?: number;
}

export interface PlannedReview {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ReviewStatus;
  readonly scheduled_at: string | null;
  readonly held_at: string | null;
  readonly signed_at: string | null;
  readonly url: string;
}

/** `GET /planning`: the last signed review, the next one and when it is due. */
export interface Planning {
  readonly interval_months: number;
  readonly reminder_days: number;
  readonly last_signed: PlannedReview | null;
  readonly upcoming: PlannedReview | null;
  /** `YYYY-MM-DD`: the last signed review's meeting (else signing) date + interval. */
  readonly next_due_on: string | null;
  readonly days_until_due: number | null;
  readonly status: PlanningStatus;
  readonly can_plan: boolean;
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
  readonly submit_check?: SubmitCheck | null;
  readonly can_submit?: boolean;
  readonly assessment_criteria?: AssessmentCriteria;
  readonly previous_review?: NeighbourReview | null;
  readonly next_review?: NeighbourReview | null;
  /** Canonical clause refs the review documents (`iso9001:9.3`). */
  readonly requirement_refs?: readonly string[];
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
  /** Merged per key; a null value clears that criterion. */
  readonly assessment_criteria?: Partial<Record<Criterion, CriterionValue | null>>;
  readonly change_reason?: string | null;
}

export interface InputUpdate {
  readonly notes?: string | null;
  readonly reviewed?: boolean;
  readonly title?: string;
  readonly not_relevant?: boolean;
  readonly not_relevant_reason?: string | null;
}

export interface SignRequest {
  readonly signature_name?: string | null;
  readonly statement?: string | null;
}

/** The review report (`GET /reviews/{id}/report`); frozen once signed. */
/** A follow-up action in the report. */
export interface ReportAction {
  readonly decision_id: string;
  readonly text: string;
  readonly category: string;
  readonly owner: UserRef | null;
  readonly due_at: string | null;
  readonly status: string;
  readonly overdue: boolean;
  readonly task_id: string | null;
}

/** The requirements the review is confirmed evidence for, per standard. */
export interface ReportRequirement {
  readonly standard_key: string;
  readonly framework: string;
  readonly numbers: readonly string[];
  readonly count: number;
}

export interface ReviewReport {
  readonly frozen: boolean;
  readonly sha256: string | null;
  readonly report: {
    readonly organization?: { readonly id: string; readonly name: string } | null;
    readonly requirements?: readonly ReportRequirement[];
    readonly actions?: readonly ReportAction[];
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
      readonly assessment_criteria?: AssessmentCriteria | null;
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
      readonly attendance?: AttendanceSummary | null;
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
