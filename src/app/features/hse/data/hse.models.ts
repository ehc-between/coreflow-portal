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
  readonly responsible?: string | null;
  readonly risk_level?: RiskLevel | null;
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
  readonly participants: readonly string[];
  readonly steps: readonly SjaStep[];
  readonly required_ppe: readonly PpeCategory[];
  readonly risk_level: RiskLevel | null;
  readonly residual_risk_level: RiskLevel | null;
  readonly emergency_measures: string | null;
  readonly hazard_count: number;
  readonly control_count: number;
  readonly submitted_at: string | null;
  readonly approved_by: UserRef | null;
  readonly approved_at: string | null;
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
  readonly participants: readonly string[];
  readonly worker_representatives: readonly string[];
  readonly worker_representative_present: boolean;
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
  readonly worker_representatives?: readonly string[];
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

export interface ConsultationHold {
  readonly held_at?: string | null;
  readonly summary?: string | null;
  readonly decisions?: string | null;
  readonly participants?: readonly string[];
  readonly worker_representative_present?: boolean;
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

// --- overview ---------------------------------------------------------------------------

export interface HseOverview {
  readonly sja: Readonly<Record<SjaStatus, number>>;
  readonly ppe: Readonly<Record<PpeStatus | 'overdue' | 'due_within_30_days', number>>;
  readonly consultations: Readonly<Record<ConsultationStatus | 'held_last_365_days', number>>;
  readonly safety_rounds: Readonly<Record<'open' | 'overdue', number>>;
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
