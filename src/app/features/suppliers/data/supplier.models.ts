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

/** Known question sections (translated); anything else is a custom section shown as typed. */
export const QUESTION_CATEGORIES = [
  'general',
  'quality',
  'delivery',
  'commercial',
  'sustainability',
  'security',
  'privacy',
  'ai',
] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

/** Clause refs per question (backend limit). */
export const MAX_QUESTION_REFS = 8;

/**
 * "Trenger oppfølging" flags of a supplier, most important first (backend
 * `attention.py`). Each has a label (`suppliers.attention.<code>`) and a meaning.
 */
export const ATTENTION_CODES = [
  'not_approved',
  'no_next_evaluation',
  'evaluation_overdue',
  'dpa_missing',
  'dpa_pending',
  'transfer_assessment_missing',
  'certificate_expired',
  'certificate_expiring',
  'weak_performance',
] as const;
export type AttentionCode = (typeof ATTENTION_CODES)[number];

/** Standards a supplier certificate can name (the label defaults to the standard's name). */
export const CERTIFICATE_STANDARDS = [
  'iso9001',
  'iso14001',
  'iso27001',
  'iso27017',
  'iso27018',
  'iso27701',
  'iso42001',
  'iso45001',
  'iso22301',
  'iso50001',
  'soc2',
] as const;
export type CertificateStandard = (typeof CERTIFICATE_STANDARDS)[number];

export type CertificateStatus = 'valid' | 'expiring' | 'expired' | 'no_expiry';

/** GDPR Art. 28 coverage from the linked contracts / processors. */
export type DpaStatus = 'not_needed' | 'covered' | 'pending' | 'missing';

/** Why the risk profile calls for an assessment kind. */
export type RequiredReason = 'always' | 'personal_data' | 'system_access' | 'cloud' | 'ai';

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
  /** "Trenger oppfølging" flags, most important first (absent on older backends). */
  readonly attention?: readonly AttentionCode[];
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/** A certificate as sent (id kept on edit; attachment only once attached to the supplier). */
export interface CertificateIn {
  readonly id?: string | null;
  readonly standard?: CertificateStandard | null;
  readonly label?: string | null;
  readonly number?: string | null;
  readonly issuer?: string | null;
  /** `YYYY-MM-DD`. */
  readonly valid_until?: string | null;
  readonly attachment_id?: string | null;
}

export interface Certificate {
  readonly id: string;
  readonly standard: CertificateStandard | null;
  readonly standard_name: string | null;
  readonly label: string;
  readonly number: string | null;
  readonly issuer: string | null;
  readonly valid_until: string | null;
  readonly attachment_id: string | null;
  readonly status: CertificateStatus;
}

/** One assessment the supplier's risk profile calls for ("Påkrevde vurderinger 1 av 3"). */
export interface RequiredAssessment {
  readonly kind: EvaluationKind;
  readonly reason: RequiredReason;
  readonly done: boolean;
  readonly latest: AssessmentRef | null;
  readonly open_evaluation_id: string | null;
}

/** The conditions of the latest conditional approval, with their follow-up task. */
export interface OpenConditions {
  readonly text: string;
  readonly evaluation_id: string;
  readonly evaluation_url: string;
  readonly decided_at: string | null;
  readonly due_at: string | null;
  readonly overdue: boolean;
  readonly task_id: string | null;
  readonly task_status: string | null;
}

/** Weak results in the performance log (below `threshold` % or a linked deviation). */
export interface PerformanceWarning {
  readonly reasons: readonly ('on_time' | 'quality' | 'deviation')[];
  readonly suggest_evaluation: boolean;
  readonly threshold: number;
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
  /** Each stored location with its Chapter V zone (absent on older responses). */
  readonly data_location_details?: readonly DataLocationDetail[];
  /** Processes personal data and stores it in a third country (Chapter V). */
  readonly transfer_assessment_needed?: boolean;
  /** Legacy free-text labels (kept filled for older clients). */
  readonly certifications: readonly string[];
  /** Structured certificates with their expiry status. */
  readonly certificates?: readonly Certificate[];
  readonly evaluation_interval_months: number | null;
  readonly effective_interval_months: number;
  readonly approved_at: string | null;
  readonly approved_by: UserRef | null;
  readonly created_by: UserRef | null;
  readonly open_evaluations: number;
  readonly latest_assessments: Readonly<Partial<Record<EvaluationKind, AssessmentRef>>>;
  /** The assessments the risk profile calls for, kinds that do not apply left out. */
  readonly required_assessments?: readonly RequiredAssessment[];
  readonly required_done?: number;
  readonly required_total?: number;
  readonly open_conditions?: OpenConditions | null;
  readonly performance: PerformanceStats;
  readonly performance_warning?: PerformanceWarning | null;
  readonly dpa_status?: DpaStatus;
  readonly can_edit: boolean;
  readonly can_approve: boolean;
  readonly can_delete: boolean;
}

/** `eea`: EU/EEA; `adequacy`: an Art. 45 decision; `third_country`: needs a transfer tool. */
export type LocationZone = 'eea' | 'adequacy' | 'third_country';

export interface DataLocationDetail {
  readonly code: string;
  readonly zone: LocationZone;
  /** A legacy value that may be a truncated country name (e.g. IR from "Ireland"). */
  readonly needs_review: boolean;
  readonly transfer_assessment_needed: boolean;
}

/** `GET /suppliers/location-options` item: ISO 3166-1 alpha-2 codes plus EU / EEA. */
export interface LocationOption {
  readonly code: string;
  readonly zone: LocationZone;
  readonly region: boolean;
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
  /** Approved and conditionally approved, split (absent on older backends). */
  readonly approved?: number;
  readonly conditional?: number;
  /** Suppliers with at least one attention flag, and the count per flag. */
  readonly needs_attention?: number;
  readonly attention_by_code?: Readonly<Partial<Record<AttentionCode, number>>>;
  /** Default re-evaluation interval (months) per criticality. */
  readonly default_intervals?: Readonly<Partial<Record<Criticality, number>>>;
}

// --- agreements hub (`GET /suppliers/{id}/agreements`) -------------------------------

/** The kit's entity reference (`EntityRefDto`). */
export interface HubRef {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly url: string | null;
  readonly status: string | null;
  readonly module: string | null;
  readonly label_key: string | null;
}

export interface HubRecord {
  readonly record: HubRef;
}

export interface HubContract extends HubRecord {
  readonly contract_type: string | null;
  readonly status: string | null;
  readonly end_date: string | null;
  readonly days_to_end: number | null;
  readonly expiring: boolean;
  readonly expired: boolean;
  readonly is_dpa: boolean;
}

export interface HubProcessor extends HubRecord {
  readonly dpa_status: string | null;
  readonly dpa_expires_at: string | null;
}

export interface HubTransfer extends HubRecord {
  readonly status: string | null;
  readonly tia_status: string | null;
  readonly destination_country: string | null;
}

export interface HubSuggestion extends HubRecord {
  readonly id: string;
  readonly reason: string;
  readonly confidence: number | null;
  readonly entity_type: string;
}

export interface SupplierAgreements {
  readonly dpa: {
    readonly required: boolean;
    readonly status: DpaStatus;
    readonly attention: boolean;
  };
  readonly transfer: { readonly required: boolean; readonly assessed: boolean };
  readonly contracts: readonly HubContract[];
  readonly processors: readonly HubProcessor[];
  readonly transfer_assessments: readonly HubTransfer[];
  readonly ai_systems: readonly HubRecord[];
  readonly assets: readonly HubRecord[];
  readonly risks: readonly HubRecord[];
  readonly deviations: readonly HubRecord[];
  readonly open_risks: number;
  readonly open_deviations: number;
  /** Records that carry the supplier's name but are not linked yet. */
  readonly suggestions: readonly HubSuggestion[];
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
  /** Only suppliers with at least one "Trenger oppfølging" flag. */
  readonly attention?: boolean;
  /** Only suppliers with one of these flags. */
  readonly attention_code?: readonly AttentionCode[];
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
  /** Structured certificates (the backend fills the legacy `certifications` from them). */
  readonly certificates: readonly CertificateIn[];
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
  /** Clauses the question checks (canonical refs, e.g. `iso27001:A.5.20`). */
  readonly requirement_refs?: readonly string[];
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
  readonly requirement_refs?: readonly string[];
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
  /** The pass mark the score is measured against (absent on older backends). */
  readonly pass_score?: number;
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

/** The evaluations list: a page plus the count per status (every other filter applied). */
export interface EvaluationPage extends Page<EvaluationListItem> {
  readonly status_counts?: Readonly<Partial<Record<EvaluationStatus, number>>>;
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
