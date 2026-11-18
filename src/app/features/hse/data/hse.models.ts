/**
 * DTOs of the health and safety API (`/api/v1/orgs/{org}/hse`, M21), mirroring
 * coreflow-core `app/modules/hse/schemas.py`. Date-times are naive UTC strings.
 */
import { AssigneeIn, TaskPriority } from '../../../core/tasks/task.models';

export interface UserRef {
  readonly id: string;
  readonly name: string;
}

export interface ListResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export type LinkType =
  | 'relates_to'
  | 'caused_by'
  | 'mitigates'
  | 'evidence_for'
  | 'supersedes'
  | 'implements'
  | 'derived_from';

export interface RelatedIn {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly link_type?: LinkType;
}

/** A record of another module an HSE record points at (supplier, course). */
export interface LinkedRef {
  readonly id: string;
  readonly code: string | null;
  readonly title: string | null;
  readonly url: string | null;
}

// --- shared vocabularies -------------------------------------------------------------

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const PPE_CATEGORIES = [
  'head',
  'eye_face',
  'hearing',
  'respiratory',
  'hand_arm',
  'foot_leg',
  'body',
  'fall_protection',
  'high_visibility',
  'other',
] as const;
export type PpeCategory = (typeof PPE_CATEGORIES)[number];

/** The hierarchy of controls, most effective first (an optional tag per SJA control). */
export const CONTROL_TYPES = [
  'eliminate',
  'substitute',
  'engineering',
  'administrative',
  'ppe',
] as const;
export type ControlType = (typeof CONTROL_TYPES)[number];

// --- SJA ------------------------------------------------------------------------------

export const SJA_STATUSES = ['draft', 'in_review', 'approved', 'completed', 'cancelled'] as const;
export type SjaStatus = (typeof SJA_STATUSES)[number];

export const SJA_ACTIONS = ['submit', 'approve', 'return', 'revise', 'complete', 'cancel'] as const;
export type SjaAction = (typeof SJA_ACTIONS)[number];

/** Actions that need a reason (422 `reason_required` otherwise). */
export const SJA_REASON_ACTIONS: readonly SjaAction[] = ['return', 'revise', 'cancel'];

export const SJA_SORTS = [
  '-created_at',
  '-updated_at',
  'work_start_at',
  '-work_start_at',
  'code',
  'title',
] as const;
export type SjaSort = (typeof SJA_SORTS)[number];

export interface SjaStep {
  readonly description: string;
  readonly hazards: readonly string[];
  readonly controls: readonly string[];
  /** Parallel to `controls`: the hierarchy-of-controls tag of each control (or null). */
  readonly control_types?: readonly (ControlType | null)[];
  /** Free-text name (external people); members go in `responsible_user_id`. */
  readonly responsible?: string | null;
  readonly responsible_user_id?: string | null;
  /** Output only: the member responsible for the step. */
  readonly responsible_user?: UserRef | null;
  readonly risk_level?: RiskLevel | null;
}

/** A participant's confirmation that they went through the SJA before work started. */
export interface SjaSignOff {
  readonly name: string;
  readonly user_id: string | null;
  readonly signed_at: string | null;
  readonly recorded_by: UserRef | null;
}

export interface SjaSignOffSummary {
  readonly expected: number;
  readonly signed: number;
  readonly missing: readonly { readonly name: string; readonly user_id: string | null }[];
  readonly complete: boolean;
}

/** `POST /sja/{id}/sign-offs`: a member (`user_id`) or an external `name`. */
export interface SjaSignOffIn {
  readonly user_id?: string | null;
  readonly name?: string | null;
  readonly signed_at?: string | null;
}

export const SJA_WARNING_KEYS = [
  'residual_not_lower',
  'residual_high_approved',
  'ppe_only_controls',
  'self_approved',
  'sign_offs_missing',
] as const;
export type SjaWarningKey = (typeof SJA_WARNING_KEYS)[number];

/** A check the backend ran on the SJA, e.g. `{key: 'ppe_only_controls', steps: [1]}`. */
export interface SjaWarning {
  readonly key: string;
  readonly level?: RiskLevel;
  /** Zero-based step indexes. */
  readonly steps?: readonly number[];
  readonly count?: number;
}

export interface PpeCoverageItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: PpeStatus;
  readonly quantity: number;
  readonly holder: UserRef | null;
  readonly holder_name: string | null;
  readonly due_at: string | null;
  readonly overdue: boolean;
  readonly url: string;
}

/** Register items that cover one required PPE category of an SJA. */
export interface PpeCoverage {
  readonly category: PpeCategory;
  readonly items: readonly PpeCoverageItem[];
  readonly available: number;
  readonly warning: 'none' | 'all_overdue' | null;
  readonly issue_url: string;
}

export interface Sja {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly job_description: string | null;
  readonly location: string | null;
  readonly work_start_at: string | null;
  readonly work_end_at: string | null;
  readonly status: SjaStatus;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  /** External participants (free-text names). */
  readonly participants: readonly string[];
  /** Participants who are members of the organisation. */
  readonly participant_users: readonly UserRef[];
  readonly sign_offs: readonly SjaSignOff[];
  readonly sign_off: SjaSignOffSummary;
  readonly steps: readonly SjaStep[];
  readonly required_ppe: readonly PpeCategory[];
  readonly risk_level: RiskLevel | null;
  readonly residual_risk_level: RiskLevel | null;
  readonly emergency_measures: string | null;
  readonly hazard_count: number;
  readonly control_count: number;
  readonly submitted_at: string | null;
  readonly submitted_by: UserRef | null;
  readonly approved_by: UserRef | null;
  readonly approved_at: string | null;
  /** Role name of the approver (as the organisation names it). */
  readonly approver_role: string | null;
  readonly self_approved: boolean;
  readonly warnings: readonly SjaWarning[];
  /** Filled on the detail endpoint only (lists return []). */
  readonly ppe_coverage: readonly PpeCoverage[];
  readonly completed_at: string | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
  readonly can_edit: boolean;
  readonly allowed_actions: readonly SjaAction[];
}

export interface SjaFields {
  readonly title?: string;
  readonly job_description?: string | null;
  readonly location?: string | null;
  readonly work_start_at?: string | null;
  readonly work_end_at?: string | null;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly participants?: readonly string[];
  readonly participant_user_ids?: readonly string[];
  readonly steps?: readonly SjaStep[];
  readonly required_ppe?: readonly PpeCategory[];
  readonly risk_level?: RiskLevel | null;
  readonly residual_risk_level?: RiskLevel | null;
  readonly emergency_measures?: string | null;
}

export interface SjaCreate extends SjaFields {
  readonly title: string;
  readonly related?: readonly RelatedIn[];
}

export interface SjaUpdate extends SjaFields {
  readonly change_reason?: string | null;
}

export interface SjaQuery {
  readonly q?: string;
  readonly status?: readonly SjaStatus[];
  readonly owner?: string;
  readonly department_id?: string;
  readonly sort?: SjaSort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- PPE ------------------------------------------------------------------------------

export const PPE_STATUSES = ['in_stock', 'issued', 'out_of_service', 'retired'] as const;
export type PpeStatus = (typeof PPE_STATUSES)[number];
export const PPE_SETTABLE_STATUSES = ['in_stock', 'out_of_service', 'retired'] as const;
export type PpeSettableStatus = (typeof PPE_SETTABLE_STATUSES)[number];

export const PPE_SORTS = [
  '-created_at',
  'name',
  'code',
  'due_at',
  'next_inspection_at',
  'expires_at',
] as const;
export type PpeSort = (typeof PPE_SORTS)[number];

export type InspectionResult = 'pass' | 'fail';

export interface Ppe {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly name: string;
  readonly category: PpeCategory;
  readonly description: string | null;
  readonly standard_ref: string | null;
  readonly manufacturer: string | null;
  readonly serial_number: string | null;
  readonly quantity: number;
  readonly location: string | null;
  readonly status: PpeStatus;
  readonly holder: UserRef | null;
  readonly holder_name: string | null;
  readonly department_id: string | null;
  readonly responsible: UserRef | null;
  readonly issued_at: string | null;
  readonly inspection_interval_days: number | null;
  readonly last_inspected_at: string | null;
  readonly next_inspection_at: string | null;
  readonly expires_at: string | null;
  readonly due_at: string | null;
  readonly overdue: boolean;
  readonly inspection_overdue: boolean;
  readonly expired: boolean;
  /** In stock, inspected in time and not expired: it may be issued. */
  readonly issuable: boolean;
  readonly supplier_id: string | null;
  readonly supplier: LinkedRef | null;
  readonly required_course_id: string | null;
  readonly required_course: LinkedRef | null;
  /** Set on a record split off a batch when part of it was issued. */
  readonly batch_id: string | null;
  readonly notes: string | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface PpeFields {
  readonly name?: string;
  readonly category?: PpeCategory;
  readonly description?: string | null;
  readonly standard_ref?: string | null;
  readonly manufacturer?: string | null;
  readonly serial_number?: string | null;
  readonly quantity?: number;
  readonly location?: string | null;
  readonly department_id?: string | null;
  readonly responsible_user_id?: string | null;
  readonly inspection_interval_days?: number | null;
  readonly next_inspection_at?: string | null;
  readonly expires_at?: string | null;
  readonly notes?: string | null;
  readonly supplier_id?: string | null;
  readonly required_course_id?: string | null;
}

export interface PpeCreate extends PpeFields {
  readonly name: string;
  readonly category: PpeCategory;
}

export interface PpeUpdate extends PpeFields {
  readonly status?: PpeSettableStatus;
}

export interface PpeIssue {
  readonly holder_user_id?: string | null;
  readonly holder_name?: string | null;
  readonly issued_at?: string | null;
  /** Issue part of a batch: that many units become their own record (the one returned). */
  readonly quantity?: number;
}

export const TRAINING_CHECK_STATUSES = [
  'not_required',
  'valid',
  'expired',
  'missing',
  'unknown',
] as const;
export type TrainingCheckStatus = (typeof TRAINING_CHECK_STATUSES)[number];

/** `GET /ppe/{id}/training-check?user_id=`: has the holder done the required course? */
export interface TrainingCheck {
  readonly status: TrainingCheckStatus;
  readonly course: LinkedRef | null;
  readonly completed_at: string | null;
  readonly expires_at: string | null;
}

export interface PpeInspection {
  readonly id: string;
  readonly ppe_item_id: string;
  readonly inspected_at: string;
  readonly inspected_by: UserRef | null;
  readonly result: InspectionResult;
  readonly notes: string | null;
  readonly created_at: string;
}

export interface PpeInspectionCreate {
  readonly result: InspectionResult;
  readonly notes?: string | null;
  readonly inspected_at?: string | null;
  readonly next_inspection_at?: string | null;
}

export interface PpeQuery {
  readonly q?: string;
  readonly status?: readonly PpeStatus[];
  readonly category?: PpeCategory;
  readonly holder?: string;
  readonly due_within_days?: number;
  /** Inspection or expiry date has passed (date-aware on the server). */
  readonly overdue?: boolean;
  readonly sort?: PpeSort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- worker consultation ----------------------------------------------------------------

export const CONSULTATION_KINDS = [
  'meeting',
  'safety_committee',
  'survey',
  'toolbox_talk',
  'suggestion',
  'other',
] as const;
export type ConsultationKind = (typeof CONSULTATION_KINDS)[number];

export const CONSULTATION_STATUSES = ['planned', 'held', 'cancelled'] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

export const CONSULTATION_SORTS = [
  '-created_at',
  'scheduled_at',
  '-scheduled_at',
  '-held_at',
  'code',
] as const;
export type ConsultationSort = (typeof CONSULTATION_SORTS)[number];

/** Follow-up tasks of a consultation (its decisions). */
export interface ConsultationActionCounts {
  readonly open: number;
  readonly overdue: number;
  readonly done: number;
  readonly total: number;
}

export interface Consultation {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly kind: ConsultationKind;
  readonly status: ConsultationStatus;
  readonly scheduled_at: string | null;
  readonly held_at: string | null;
  readonly location: string | null;
  readonly topics: string | null;
  readonly summary: string | null;
  readonly decisions: string | null;
  /** External participants (free-text names). */
  readonly participants: readonly string[];
  readonly participant_users: readonly UserRef[];
  /** External worker representatives (free-text names). */
  readonly worker_representatives: readonly string[];
  readonly representative_users: readonly UserRef[];
  readonly worker_representative_present: boolean;
  readonly actions: ConsultationActionCounts;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface ConsultationFields {
  readonly title?: string;
  readonly kind?: ConsultationKind;
  readonly scheduled_at?: string | null;
  readonly location?: string | null;
  readonly topics?: string | null;
  readonly participants?: readonly string[];
  readonly participant_user_ids?: readonly string[];
  readonly worker_representatives?: readonly string[];
  readonly representative_user_ids?: readonly string[];
  readonly worker_representative_present?: boolean;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
}

export interface ConsultationCreate extends ConsultationFields {
  readonly title: string;
  readonly related?: readonly RelatedIn[];
}

export interface ConsultationUpdate extends ConsultationFields {
  readonly held_at?: string | null;
  readonly summary?: string | null;
  readonly decisions?: string | null;
}

/** A decision that becomes a tracked follow-up task on the consultation. */
export interface ConsultationHoldAction {
  readonly title: string;
  readonly description?: string | null;
  readonly assignee_user_id?: string | null;
  readonly due_at?: string | null;
}

export interface ConsultationHold {
  readonly held_at?: string | null;
  readonly summary?: string | null;
  readonly decisions?: string | null;
  readonly participants?: readonly string[];
  readonly participant_user_ids?: readonly string[];
  readonly worker_representatives?: readonly string[];
  readonly representative_user_ids?: readonly string[];
  readonly worker_representative_present?: boolean;
  readonly actions?: readonly ConsultationHoldAction[];
}

export interface ConsultationQuery {
  readonly q?: string;
  readonly status?: readonly ConsultationStatus[];
  readonly kind?: ConsultationKind;
  readonly sort?: ConsultationSort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- follow-up actions and safety rounds (F2 tasks) -------------------------------------

export interface HseActionCreate {
  readonly title: string;
  readonly description?: string | null;
  readonly assignee?: AssigneeIn | null;
  readonly due_at?: string | null;
  readonly priority?: TaskPriority;
}

export type HseLang = 'en' | 'nb';

export interface SafetyRoundCreate {
  readonly title: string;
  readonly description?: string | null;
  readonly location?: string | null;
  readonly assignee?: AssigneeIn | null;
  readonly due_at?: string | null;
  readonly rrule?: string | null;
  readonly dtstart?: string | null;
  readonly lead_days?: number;
  readonly checklist?: readonly string[];
  readonly lang?: HseLang;
  readonly priority?: TaskPriority;
}

export interface ChecklistTemplate {
  readonly lang: HseLang;
  readonly items: readonly string[];
}

/** A safety walk done with the Inspections module's safety-walk checklist. */
export interface SafetyWalk {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly location: string | null;
  readonly status: string;
  readonly result: string | null;
  readonly due_at: string | null;
  readonly completed_at: string | null;
  readonly inspector: UserRef | null;
  readonly overdue: boolean;
  readonly finding_count: number;
  readonly open_finding_count: number;
  readonly url: string;
}

/** `GET /safety-rounds/inspections`; `available` is false without the Inspections module. */
export interface SafetyWalkList {
  readonly available: boolean;
  readonly template_id?: string | null;
  readonly new_url: string;
  readonly items: readonly SafetyWalk[];
  readonly total: number;
}

// --- overview ---------------------------------------------------------------------------

export type AttentionReason =
  | 'expired'
  | 'inspection_overdue'
  | 'due_soon'
  | 'awaiting_approval'
  | 'overdue'
  | 'planned';

/** A record that needs attention, listed under its overview card (≤ 3 per type). */
export interface AttentionItem {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly due_at: string | null;
  readonly reason: AttentionReason;
  readonly url: string;
}

export interface OverviewIncident {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly severity: string | null;
  readonly event_kind: string | null;
  readonly raised_at: string | null;
  readonly url: string;
}

/** HSE deviations (incidents and near misses) of the last year; needs `deviations:read`. */
export interface OverviewIncidents {
  readonly available: boolean;
  readonly url: string;
  readonly open?: number;
  readonly last_365_days?: number;
  readonly near_misses_365?: number;
  readonly injuries_365?: number;
  readonly lost_time_injuries_365?: number;
  readonly lost_days_365?: number;
  readonly days_since_lost_time?: number | null;
  readonly recent?: readonly OverviewIncident[];
}

export interface OverviewRisk {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly level: string | null;
  readonly url: string;
}

/** Risks in the organisation's HSE risk registers; needs `risk:read`. */
export interface OverviewRisks {
  readonly available: boolean;
  readonly url: string;
  readonly open?: number;
  readonly high?: number;
  readonly top?: readonly OverviewRisk[];
}

export const GETTING_STARTED_STEPS = [
  'first_sja',
  'first_ppe',
  'first_consultation',
  'plan_safety_round',
] as const;
export type GettingStartedStep = (typeof GETTING_STARTED_STEPS)[number];

export interface GettingStarted {
  readonly show: boolean;
  readonly steps: readonly {
    readonly key: GettingStartedStep;
    readonly done: boolean;
    readonly url: string;
  }[];
}

export type AttentionGroup = 'ppe' | 'sja' | 'consultations';

export interface HseOverview {
  readonly sja: Readonly<Record<SjaStatus, number>>;
  readonly ppe: Readonly<Record<PpeStatus | 'overdue' | 'due_within_30_days', number>>;
  readonly consultations: Readonly<Record<ConsultationStatus | 'held_last_365_days', number>>;
  readonly safety_rounds: Readonly<Record<'open' | 'overdue' | 'inspections_open', number>>;
  readonly incidents: OverviewIncidents;
  readonly risks: OverviewRisks;
  readonly tasks: { readonly open: number; readonly overdue: number; readonly url: string };
  readonly attention: Readonly<Partial<Record<AttentionGroup, readonly AttentionItem[]>>>;
  readonly getting_started: GettingStarted;
}

// --- AI assist (`hse.suggest_hazards`) ----------------------------------------------------

export interface HazardSuggestion {
  readonly steps: readonly {
    readonly description: string;
    readonly hazards: readonly string[];
    readonly controls: readonly string[];
    readonly risk_level: RiskLevel | null;
  }[];
  readonly required_ppe: readonly PpeCategory[];
  readonly notes: string | null;
}
