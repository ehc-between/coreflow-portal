/**
 * DTOs of the M13 suppliers API (`/api/v1/orgs/{org_id}/suppliers/...`), mirroring
 * `app/modules/suppliers/schemas.py` in coreflow-core. Date-times are naive-UTC ISO
 * strings; `occurred_on` is a plain `YYYY-MM-DD` day.
 */

export const SUPPLIER_CATEGORIES = [
  'goods',
  'services',
  'software',
  'cloud',
  'it_services',
  'logistics',
  'consulting',
  'manufacturing',
  'facilities',
  'ai',
  'other',
] as const;
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

export const CRITICALITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Criticality = (typeof CRITICALITIES)[number];

export const SUPPLIER_STATUSES = [
  'prospective',
  'under_evaluation',
  'approved',
  'conditional',
  'suspended',
  'rejected',
  'inactive',
] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

/** Statuses that need `suppliers:approve` to move into or out of. */
export const APPROVAL_STATUSES: readonly SupplierStatus[] = [
  'approved',
  'conditional',
  'suspended',
  'rejected',
];

export const SUPPLIER_SORTS = [
  'name',
  '-name',
  'code',
  '-code',
  'criticality',
  'next_evaluation_at',
  '-updated_at',
  '-created_at',
] as const;
export type SupplierSort = (typeof SUPPLIER_SORTS)[number];

export const EVALUATION_DUE_FILTERS = ['overdue', 'due_soon'] as const;
export type EvaluationDueFilter = (typeof EVALUATION_DUE_FILTERS)[number];

/** The boolean profile flags of a supplier (also list filters). */
export const SUPPLIER_FLAGS = [
  'processes_personal_data',
  'has_system_access',
  'provides_cloud_services',
  'provides_ai',
] as const;
export type SupplierFlag = (typeof SUPPLIER_FLAGS)[number];

export const EVALUATION_KINDS = [
  'initial',
  'periodic',
  'ad_hoc',
  'security',
  'privacy',
  'ai',
] as const;
export type EvaluationKind = (typeof EVALUATION_KINDS)[number];

/** Kinds whose decision sets the supplier's status (the others are recorded per kind). */
export const APPROVAL_KINDS: readonly EvaluationKind[] = ['initial', 'periodic', 'ad_hoc'];

export const EVALUATION_STATUSES = ['draft', 'submitted', 'completed', 'cancelled'] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const DECISIONS = ['approved', 'conditional', 'rejected'] as const;
export type Decision = (typeof DECISIONS)[number];

export const RECOMMENDATIONS = ['approve', 'conditional', 'reject'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const QUESTION_TYPES = ['yes_no', 'score', 'text'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const PERFORMANCE_KINDS = [
  'delivery',
  'quality',
  'nonconformity',
  'service_level',
  'incident',
  'communication',
  'other',
] as const;
export type PerformanceKind = (typeof PERFORMANCE_KINDS)[number];

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

// --- suppliers -----------------------------------------------------------------------

export interface SupplierListItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: SupplierCategory;
  readonly criticality: Criticality;
  readonly status: SupplierStatus;
  readonly country: string | null;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly processes_personal_data: boolean;
  readonly has_system_access: boolean;
  readonly provides_cloud_services: boolean;
  readonly provides_ai: boolean;
  readonly next_evaluation_at: string | null;
  readonly evaluation_overdue: boolean;
  readonly last_evaluated_at: string | null;
  readonly last_score: number | null;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AssessmentRef {
  readonly id: string;
  readonly decision: Decision | null;
  readonly score: number | null;
  readonly decided_at: string | null;
}

export interface PerformanceStats {
  readonly period_days: number;
  readonly entries: number;
  readonly nonconformities: number;
  readonly average_rating: number | null;
  readonly on_time_rate: number | null;
  readonly quality_ok_rate: number | null;
}

export interface SupplierDetail extends SupplierListItem {
  readonly legal_name: string | null;
  readonly registration_number: string | null;
  readonly website: string | null;
  readonly description: string | null;
  readonly contact_name: string | null;
  readonly contact_email: string | null;
  readonly contact_phone: string | null;
  readonly data_locations: readonly string[];
  readonly certifications: readonly string[];
  readonly evaluation_interval_months: number | null;
  readonly effective_interval_months: number;
  readonly approved_at: string | null;
  readonly approved_by: UserRef | null;
  readonly created_by: UserRef | null;
  readonly open_evaluations: number;
  readonly latest_assessments: Readonly<Partial<Record<EvaluationKind, AssessmentRef>>>;
  readonly performance: PerformanceStats;
  readonly can_edit: boolean;
  readonly can_approve: boolean;
  readonly can_delete: boolean;
}

export interface SupplierSummary {
  readonly total: number;
  readonly by_status: Readonly<Record<string, number>>;
  readonly by_criticality: Readonly<Record<string, number>>;
  readonly evaluations_overdue: number;
  readonly evaluations_due_soon: number;
  readonly open_evaluations: number;
  readonly processors: number;
  readonly ai_suppliers: number;
}

export interface SupplierListQuery {
  readonly q?: string;
  readonly status?: readonly SupplierStatus[];
  readonly criticality?: readonly Criticality[];
  readonly category?: readonly SupplierCategory[];
  readonly owner?: string;
  readonly department_id?: string;
  readonly evaluation_due?: EvaluationDueFilter;
  readonly processes_personal_data?: boolean;
  readonly has_system_access?: boolean;
  readonly provides_cloud_services?: boolean;
  readonly provides_ai?: boolean;
  readonly sort?: SupplierSort;
  readonly limit?: number;
  readonly offset?: number;
}

/** The editable supplier fields (create body; every field optional on update). */
export interface SupplierFields {
  readonly name: string;
  readonly category: SupplierCategory;
  readonly criticality: Criticality;
  readonly legal_name: string | null;
  readonly registration_number: string | null;
  readonly country: string | null;
  readonly website: string | null;
  readonly description: string | null;
  readonly owner_user_id: string | null;
  readonly department_id: string | null;
  readonly contact_name: string | null;
  readonly contact_email: string | null;
  readonly contact_phone: string | null;
  readonly processes_personal_data: boolean;
  readonly has_system_access: boolean;
  readonly provides_cloud_services: boolean;
  readonly provides_ai: boolean;
  readonly data_locations: readonly string[];
  readonly certifications: readonly string[];
  readonly evaluation_interval_months: number | null;
  readonly next_evaluation_at: string | null;
}

export type CreateSupplierRequest = SupplierFields;

export type UpdateSupplierRequest = Partial<SupplierFields> & {
  readonly change_reason?: string | null;
};

export interface SupplierStatusRequest {
  readonly status: SupplierStatus;
  readonly reason: string;
}

// --- questionnaires / evaluations ---------------------------------------------------

export interface Question {
  readonly id: string;
  readonly text: string;
  readonly help: string | null;
  readonly category: string;
  readonly type: QuestionType;
  readonly weight: number;
  readonly max_score: number;
  readonly critical: boolean;
  readonly required: boolean;
}

/** A question as sent (the id is optional for new questions). */
export interface QuestionIn {
  readonly id?: string | null;
  readonly text: string;
  readonly help?: string | null;
  readonly category?: string;
  readonly type?: QuestionType;
  readonly weight?: number;
  readonly max_score?: number;
  readonly critical?: boolean;
  readonly required?: boolean;
}

/** `"yes" | "no" | "na"` for yes/no, an integer (or `"na"`) for score, text for text. */
export type AnswerValue = string | number | null;

export interface Answer {
  readonly value: AnswerValue;
  readonly comment: string | null;
}

export interface Questionnaire {
  readonly id: string;
  readonly builtin: boolean;
  readonly name: string;
  readonly kind: EvaluationKind;
  readonly description: string | null;
  readonly questions: readonly Question[];
  readonly pass_score: number;
  readonly created_at: string | null;
  readonly updated_at: string | null;
}

export interface QuestionnaireRequest {
  readonly name: string;
  readonly kind: EvaluationKind;
  readonly description?: string | null;
  readonly questions: readonly QuestionIn[];
  readonly pass_score: number;
}

export interface SupplierRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly url: string;
}

export interface EvaluationListItem {
  readonly id: string;
  readonly supplier: SupplierRef;
  readonly kind: EvaluationKind;
  readonly title: string;
  readonly status: EvaluationStatus;
  readonly score: number | null;
  readonly recommendation: Recommendation | null;
  readonly decision: Decision | null;
  readonly evaluator: UserRef | null;
  readonly due_at: string | null;
  readonly overdue: boolean;
  readonly submitted_at: string | null;
  readonly decided_at: string | null;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Scoring {
  readonly points: number;
  readonly max_points: number;
  readonly answered: number;
  readonly total: number;
}

export interface EvaluationDetail extends EvaluationListItem {
  readonly template_ref: string | null;
  readonly questions: readonly Question[];
  readonly answers: Readonly<Record<string, Answer>>;
  readonly pass_score: number;
  readonly scoring: Scoring;
  readonly critical_failures: readonly string[];
  readonly summary: string | null;
  readonly submitted_by: UserRef | null;
  readonly decision_notes: string | null;
  readonly conditions: string | null;
  readonly decided_by: UserRef | null;
  readonly created_by: UserRef | null;
  readonly can_edit: boolean;
  readonly can_decide: boolean;
}

export interface EvaluationListQuery {
  readonly supplier_id?: string;
  readonly status?: readonly EvaluationStatus[];
  readonly kind?: EvaluationKind;
  readonly evaluator?: string;
  readonly overdue?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateEvaluationRequest {
  readonly kind: EvaluationKind;
  readonly title?: string | null;
  readonly template_id?: string | null;
  readonly questions?: readonly QuestionIn[];
  readonly pass_score?: number | null;
  readonly evaluator_user_id?: string | null;
  readonly due_at?: string | null;
  readonly lang: 'en' | 'nb';
}

export interface UpdateEvaluationRequest {
  readonly title?: string;
  readonly questions?: readonly QuestionIn[];
  readonly answers?: Readonly<Record<string, { value: AnswerValue; comment?: string | null }>>;
  readonly pass_score?: number;
  readonly evaluator_user_id?: string | null;
  readonly due_at?: string | null;
  readonly summary?: string | null;
  readonly change_reason?: string | null;
}

export interface DecideEvaluationRequest {
  readonly decision: Decision;
  readonly notes?: string | null;
  readonly conditions?: string | null;
  readonly next_evaluation_at?: string | null;
}

// --- performance --------------------------------------------------------------------

export interface PerformanceEntry {
  readonly id: string;
  readonly supplier_id: string;
  readonly kind: PerformanceKind;
  readonly occurred_on: string;
  readonly title: string;
  readonly description: string | null;
  readonly rating: number | null;
  readonly on_time: boolean | null;
  readonly quality_ok: boolean | null;
  readonly reference: string | null;
  readonly deviation_id: string | null;
  readonly deviation_url: string | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly can_edit: boolean;
}

export interface PerformanceList extends Page<PerformanceEntry> {
  readonly stats: PerformanceStats;
}

export interface PerformanceQuery {
  readonly kind?: PerformanceKind;
  readonly since?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface PerformanceRequest {
  readonly kind: PerformanceKind;
  readonly occurred_on?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly rating?: number | null;
  readonly on_time?: boolean | null;
  readonly quality_ok?: boolean | null;
  readonly reference?: string | null;
  readonly deviation_id?: string | null;
}

/** Result of the `suppliers.draft_questionnaire` assist. */
export interface DraftQuestionnaireResult {
  readonly questions: readonly QuestionIn[];
}
