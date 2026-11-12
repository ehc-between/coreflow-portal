/**
 * AI governance (M16, ISO/IEC 42001 + EU AI Act) DTOs. Mirrors coreflow-core
 * `app/modules/ai_governance/schemas.py`; every path is under
 * `/api/v1/orgs/{org_id}/ai-governance`. Times are naive UTC ISO strings.
 */

export const AI_ACT_ROLES = [
  'provider',
  'deployer',
  'provider_and_deployer',
  'importer',
  'distributor',
  'not_applicable',
] as const;
export type AiActRole = (typeof AI_ACT_ROLES)[number];

export const SYSTEM_STATUSES = [
  'planned',
  'in_development',
  'in_use',
  'suspended',
  'retired',
] as const;
export type SystemStatus = (typeof SYSTEM_STATUSES)[number];

export const RISK_CLASSES = ['unclassified', 'prohibited', 'high', 'limited', 'minimal'] as const;
export type RiskClass = (typeof RISK_CLASSES)[number];

export const ASSESSMENT_KINDS = ['classification', 'impact', 'fria'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const ASSESSMENT_STATUSES = ['draft', 'completed', 'approved'] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const MONITORING_KINDS = [
  'accuracy',
  'robustness',
  'bias',
  'drift',
  'security',
  'oversight',
  'review',
  'other',
] as const;
export type MonitoringKind = (typeof MONITORING_KINDS)[number];

export const MONITORING_RESULTS = ['pass', 'warn', 'fail', 'info'] as const;
export type MonitoringResult = (typeof MONITORING_RESULTS)[number];

export const LITERACY_SOURCES = ['training', 'briefing', 'self_study', 'external'] as const;
export type LiteracySource = (typeof LITERACY_SOURCES)[number];

export const SYSTEM_SORTS = [
  'name',
  '-name',
  'code',
  '-code',
  'updated_at',
  '-updated_at',
  'risk_class',
  'status',
] as const;
export type SystemSort = (typeof SYSTEM_SORTS)[number];

export const ASSESSMENT_SORTS = [
  '-updated_at',
  'updated_at',
  'due_at',
  '-due_at',
  'code',
  '-code',
  'title',
] as const;
export type AssessmentSort = (typeof ASSESSMENT_SORTS)[number];

export interface UserRef {
  readonly id: string;
  readonly name: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

// --- overview / catalogue / settings --------------------------------------------------

export interface AiGovernanceOverview {
  readonly systems_total: number;
  readonly by_risk_class: Readonly<Record<string, number>>;
  readonly by_status: Readonly<Record<string, number>>;
  readonly unclassified: number;
  readonly high_risk: number;
  readonly assessments_open: number;
  readonly assessments_overdue: number;
  readonly reviews_overdue: number;
  readonly monitoring_failures_30d: number;
  readonly literacy_coverage: number;
  readonly has_policy: boolean;
}

export interface CatalogRef {
  readonly key: string;
  readonly ref: string;
}

export interface CatalogDocSection {
  readonly key: string;
  readonly group: 'governance' | 'annex_iv';
  readonly ref: string;
}

export interface CatalogObligation {
  readonly key: string;
  readonly ref: string;
  readonly article: string;
  readonly title_en: string;
  readonly title_nb: string;
}

export interface AiGovernanceCatalog {
  readonly roles: readonly string[];
  readonly statuses: readonly string[];
  readonly risk_classes: readonly string[];
  readonly prohibited_practices: readonly CatalogRef[];
  readonly annex_iii_areas: readonly CatalogRef[];
  readonly transparency_triggers: readonly CatalogRef[];
  readonly assessment_kinds: readonly string[];
  readonly impact_sections: readonly string[];
  readonly fria_sections: readonly string[];
  readonly required_sections: {
    readonly impact: readonly string[];
    readonly fria: readonly string[];
  };
  readonly doc_sections: readonly CatalogDocSection[];
  readonly monitoring_kinds: readonly string[];
  readonly monitoring_results: readonly string[];
  readonly literacy_sources: readonly string[];
  readonly obligations: readonly CatalogObligation[];
}

export interface AiGovernanceSettings {
  readonly policy_document_id: string | null;
  readonly policy_document_title: string | null;
  readonly officer: UserRef | null;
  readonly literacy_validity_months: number;
  readonly review_interval_months: number;
  readonly updated_at: string | null;
}

export interface AiGovernanceSettingsUpdate {
  readonly policy_document_id: string | null;
  readonly officer_user_id: string | null;
  readonly literacy_validity_months: number;
  readonly review_interval_months: number;
}

// --- AI systems -----------------------------------------------------------------------

export interface Obligation {
  readonly key: string;
  readonly ref: string;
  readonly article: string;
  readonly title: string;
  readonly task_id?: string | null;
  readonly task_status?: string | null;
}

export interface AiSystemSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly ai_act_role: AiActRole;
  readonly status: SystemStatus;
  readonly risk_class: RiskClass;
  readonly gpai: boolean;
  readonly provider_name: string | null;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly classified_at: string | null;
  readonly next_review_at: string | null;
  readonly is_builtin: boolean;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AiSystem extends AiSystemSummary {
  readonly description: string | null;
  readonly intended_purpose: string | null;
  readonly models: readonly string[];
  readonly data_categories: readonly string[];
  readonly uses_personal_data: boolean;
  readonly transparency: readonly string[];
  readonly classification_id: string | null;
  readonly obligations: readonly Obligation[];
  readonly documentation: Readonly<Record<string, string>>;
  readonly builtin_key: string | null;
  readonly created_by: string | null;
}

export interface AiSystemListQuery {
  readonly q?: string;
  readonly status?: string;
  readonly risk_class?: string;
  readonly role?: string;
  readonly owner?: string;
  readonly sort?: SystemSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AiSystemWrite {
  readonly name: string;
  readonly description: string | null;
  readonly intended_purpose: string | null;
  readonly ai_act_role: AiActRole;
  readonly status: SystemStatus;
  readonly provider_name: string | null;
  readonly models: readonly string[];
  readonly data_categories: readonly string[];
  readonly uses_personal_data: boolean;
  readonly owner_user_id: string | null;
  readonly department_id: string | null;
  readonly next_review_at: string | null;
}

export interface AiSystemUpdate extends Partial<AiSystemWrite> {
  readonly change_reason?: string | null;
}

export interface RegisterFeaturesResult {
  readonly created: number;
  readonly items: readonly AiSystemSummary[];
}

export interface DocSection {
  readonly key: string;
  readonly group: 'governance' | 'annex_iv';
  readonly ref: string;
  readonly content: string | null;
  readonly complete: boolean;
}

export interface TechnicalDocumentation {
  readonly system: AiSystemSummary;
  readonly required: boolean;
  readonly sections: readonly DocSection[];
  readonly annex_iv_complete: number;
  readonly annex_iv_total: number;
  readonly completeness: number;
}

export interface ReviewScheduleRequest {
  readonly rrule: string;
  readonly start_at: string;
  readonly title?: string | null;
  readonly assignee_user_id?: string | null;
}

export interface ReviewScheduleResult {
  readonly task_id: string;
  readonly due_at: string | null;
}

export interface AiIncident {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly status: string | null;
  readonly url: string | null;
}

export interface MonitoringEntry {
  readonly id: string;
  readonly ai_system_id: string;
  readonly kind: MonitoringKind;
  readonly metric: string;
  readonly value: number | null;
  readonly threshold: number | null;
  readonly result: MonitoringResult;
  readonly notes: string | null;
  readonly measured_at: string;
  readonly recorded_by: UserRef | null;
  readonly created_at: string;
}

export interface MonitoringCreate {
  readonly kind: MonitoringKind;
  readonly metric: string;
  readonly value: number | null;
  readonly threshold: number | null;
  readonly result: MonitoringResult;
  readonly notes: string | null;
  readonly measured_at: string | null;
}

// --- classification -------------------------------------------------------------------

export interface ClassificationAnswers {
  readonly role?: AiActRole | null;
  readonly prohibited_practices: readonly string[];
  readonly annex_i_safety_component: boolean;
  readonly annex_iii_areas: readonly string[];
  readonly art6_3_exception: boolean;
  readonly profiling: boolean;
  readonly transparency: readonly string[];
  readonly gpai: boolean;
  readonly gpai_systemic_risk: boolean;
  readonly deployer_public_service: boolean;
  readonly deployer_credit_or_insurance: boolean;
  readonly notes?: string | null;
}

export interface ClassificationReason {
  readonly code: string;
  readonly ref: string;
}

export interface ClassificationResult {
  readonly risk_class: RiskClass;
  readonly role: string;
  readonly gpai: boolean;
  readonly gpai_systemic_risk: boolean;
  readonly transparency: readonly string[];
  readonly fria_required: boolean;
  readonly art6_3_exception_applied: boolean;
  readonly reasons: readonly ClassificationReason[];
  readonly obligations: readonly Obligation[];
}

export interface ClassificationPreviewRequest {
  readonly answers: ClassificationAnswers;
  readonly ai_system_id?: string | null;
  readonly lang?: 'en' | 'nb';
}

// --- assessments ----------------------------------------------------------------------

export interface SystemRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly url: string;
}

export interface AssessmentSummary {
  readonly id: string;
  readonly code: string;
  readonly kind: AssessmentKind;
  readonly title: string;
  readonly status: AssessmentStatus;
  readonly ai_system: SystemRef;
  readonly owner: UserRef | null;
  readonly due_at: string | null;
  readonly completed_at: string | null;
  readonly approved_at: string | null;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Assessment extends AssessmentSummary {
  readonly answers: Readonly<Record<string, unknown>>;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly completed_by: UserRef | null;
  readonly approved_by: UserRef | null;
  readonly required_sections: readonly string[];
  readonly created_tasks: readonly string[];
}

export interface AssessmentListQuery {
  readonly q?: string;
  readonly kind?: string;
  readonly status?: string;
  readonly ai_system_id?: string;
  readonly owner?: string;
  readonly sort?: AssessmentSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AssessmentCreate {
  readonly ai_system_id: string;
  readonly kind: AssessmentKind;
  readonly title?: string | null;
  readonly owner_user_id?: string | null;
  readonly due_at?: string | null;
  readonly answers: Readonly<Record<string, unknown>>;
}

export interface AssessmentUpdate {
  readonly title?: string;
  readonly owner_user_id?: string | null;
  readonly due_at?: string | null;
  readonly answers?: Readonly<Record<string, unknown>>;
  readonly change_reason?: string | null;
}

export interface AssessmentCompleteRequest {
  readonly create_tasks: boolean;
  readonly due_in_days: number;
  readonly lang?: 'en' | 'nb';
}

// --- AI literacy ----------------------------------------------------------------------

export interface LiteracyRecord {
  readonly id: string;
  readonly user: UserRef;
  readonly topic: string;
  readonly source: LiteracySource;
  readonly completed_at: string;
  readonly valid_until: string | null;
  readonly valid: boolean;
  readonly ai_system_id: string | null;
  readonly notes: string | null;
  readonly recorded_by: UserRef | null;
  readonly created_at: string;
}

export interface LiteracyCreate {
  readonly user_id: string;
  readonly topic: string;
  readonly source: LiteracySource;
  readonly completed_at: string;
  readonly valid_until?: string | null;
  readonly ai_system_id?: string | null;
  readonly notes?: string | null;
}

export interface LiteracyQuery {
  readonly user_id?: string;
  readonly ai_system_id?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface LiteracyCoverage {
  readonly members_total: number;
  readonly covered: number;
  readonly expired: number;
  readonly missing: number;
  readonly coverage: number;
  readonly missing_users: readonly UserRef[];
  readonly expired_users: readonly UserRef[];
}

// --- assists --------------------------------------------------------------------------

/** `ai_governance.suggest_classification` JSON result. */
export interface SuggestedClassification {
  readonly answers?: Partial<ClassificationAnswers>;
  readonly rationale?: Readonly<Record<string, string>>;
}

/** `ai_governance.draft_assessment` JSON result. */
export interface DraftedAssessment {
  readonly sections?: Readonly<Record<string, string>>;
}
