/**
 * M04 risk and opportunity management DTOs. They mirror coreflow-core
 * `app/modules/risk/schemas.py` (all endpoints under `/api/v1/orgs/{org}/risk`).
 * Datetimes are naive UTC ISO strings.
 */

export const RISK_CATEGORIES = [
  'enterprise',
  'information_security',
  'privacy',
  'ai',
  'hse',
  'environmental',
  'project',
  'quality',
  'other',
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const SOURCE_TYPES = [
  'asset',
  'process',
  'activity',
  'project',
  'location',
  'supplier',
  'information',
  'service',
  'other',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const RISK_STATUSES = [
  'identified',
  'assessed',
  'in_treatment',
  'monitoring',
  'accepted',
  'closed',
] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

/** Statuses a PATCH may set (`accepted` only through the accept endpoint). */
export const PATCHABLE_RISK_STATUSES = [
  'identified',
  'assessed',
  'in_treatment',
  'monitoring',
  'closed',
] as const;
export type PatchableRiskStatus = (typeof PATCHABLE_RISK_STATUSES)[number];

export const OPEN_RISK_STATUSES: readonly RiskStatus[] = [
  'identified',
  'assessed',
  'in_treatment',
  'monitoring',
];

export const STRATEGIES = ['mitigate', 'accept', 'avoid', 'transfer'] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const CIA_PROPERTIES = ['confidentiality', 'integrity', 'availability'] as const;
export type CiaProperty = (typeof CIA_PROPERTIES)[number];

export const TREATMENT_STATUSES = ['planned', 'in_progress', 'done', 'cancelled'] as const;
export type TreatmentStatus = (typeof TREATMENT_STATUSES)[number];

export const OPPORTUNITY_STATUSES = [
  'identified',
  'evaluating',
  'planned',
  'in_progress',
  'realised',
  'rejected',
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const IMPLEMENTATION_STATUSES = [
  'not_started',
  'planned',
  'partial',
  'implemented',
] as const;
export type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];

export const INCLUSION_REASONS = [
  'risk_assessment',
  'legal',
  'contractual',
  'business',
  'best_practice',
] as const;
export type InclusionReason = (typeof INCLUSION_REASONS)[number];

export const MATRIX_TEMPLATES = ['5x5', '4x4', '3x3'] as const;
export type MatrixTemplateKey = (typeof MATRIX_TEMPLATES)[number];

export const RISK_SORTS = [
  '-score',
  'score',
  'code',
  '-code',
  'title',
  '-created_at',
  '-updated_at',
  'next_review_at',
] as const;
export type RiskSort = (typeof RISK_SORTS)[number];

export const OPPORTUNITY_SORTS = [
  '-score',
  'code',
  '-code',
  'title',
  '-created_at',
  '-updated_at',
] as const;
export type OpportunitySort = (typeof OPPORTUNITY_SORTS)[number];

export const HEATMAP_BASES = ['current', 'inherent', 'residual'] as const;
export type HeatmapBasis = (typeof HEATMAP_BASES)[number];

export interface UserRef {
  readonly id: string;
  readonly name: string;
}

export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

export interface ListResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
}

// --- matrices -----------------------------------------------------------------------

export interface MatrixLevel {
  readonly value: number;
  readonly label: string;
  readonly key?: string | null;
  readonly description?: string | null;
}

export interface MatrixBand {
  readonly key: string;
  readonly label: string;
  readonly min_score: number;
  readonly color: string;
}

export interface Matrix {
  readonly id: string;
  readonly org_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly likelihood_levels: readonly MatrixLevel[];
  readonly consequence_levels: readonly MatrixLevel[];
  readonly bands: readonly MatrixBand[];
  /** Per-cell overrides, `"<likelihood>:<consequence>" -> band key`. */
  readonly cells: Readonly<Record<string, string>>;
  readonly acceptable_max_score: number | null;
  readonly max_score: number;
  readonly is_default: boolean;
  readonly register_count: number;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MatrixTemplate {
  readonly key: MatrixTemplateKey;
  readonly likelihood_levels: readonly MatrixLevel[];
  readonly consequence_levels: readonly MatrixLevel[];
  readonly bands: readonly MatrixBand[];
  readonly acceptable_max_score: number | null;
}

export interface MatrixCreate {
  readonly name: string;
  readonly description?: string | null;
  readonly template?: MatrixTemplateKey;
  readonly likelihood_levels?: readonly MatrixLevel[];
  readonly consequence_levels?: readonly MatrixLevel[];
  readonly bands?: readonly MatrixBand[];
  readonly cells?: Readonly<Record<string, string>>;
  readonly acceptable_max_score?: number | null;
  readonly is_default?: boolean;
}

export interface MatrixUpdate extends Omit<Partial<MatrixCreate>, 'template'> {
  readonly change_reason?: string | null;
}

// --- registers ----------------------------------------------------------------------

export type RegisterStatus = 'active' | 'archived';

export interface Register {
  readonly id: string;
  readonly org_id: string;
  readonly name: string;
  readonly category: RiskCategory;
  readonly description: string | null;
  readonly matrix_id: string;
  readonly matrix_name: string | null;
  readonly owner: UserRef | null;
  readonly review_interval_months: number;
  readonly status: RegisterStatus;
  readonly is_default: boolean;
  readonly risk_count: number;
  readonly open_risk_count: number;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface RegisterCreate {
  readonly name: string;
  readonly category: RiskCategory;
  readonly description?: string | null;
  readonly matrix_id?: string | null;
  readonly owner_user_id?: string | null;
  readonly review_interval_months?: number;
  readonly is_default?: boolean;
}

export interface RegisterUpdate extends Partial<RegisterCreate> {
  readonly status?: RegisterStatus;
}

export interface SetupResult {
  readonly matrix: Matrix;
  readonly register: Register;
  readonly created: boolean;
}

// --- risks --------------------------------------------------------------------------

export interface Rating {
  readonly likelihood: number;
  readonly consequence: number;
  readonly score: number;
  readonly level: string;
  readonly label: string | null;
  readonly color: string | null;
}

export interface Acceptance {
  readonly accepted_by: UserRef | null;
  readonly accepted_at: string;
  readonly note: string | null;
  readonly expires_at: string | null;
}

export interface RegisterRef {
  readonly id: string;
  readonly name: string;
  readonly category: RiskCategory;
}

export interface TreatmentCounts {
  readonly total: number;
  readonly open: number;
  readonly done: number;
}

export interface Risk {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly register: RegisterRef;
  readonly matrix_id: string;
  readonly category: RiskCategory;
  readonly source_type: SourceType | null;
  readonly source_ref: string | null;
  readonly threat: string | null;
  readonly vulnerability: string | null;
  readonly consequence_text: string | null;
  readonly affected_properties: readonly CiaProperty[];
  readonly owner: UserRef | null;
  readonly department: NamedRef | null;
  readonly status: RiskStatus;
  readonly status_reason: string | null;
  readonly inherent: Rating | null;
  readonly treatment_strategy: Strategy | null;
  readonly treatment_notes: string | null;
  readonly residual: Rating | null;
  readonly current_score: number | null;
  readonly current_level: string | null;
  readonly above_appetite: boolean;
  readonly control_refs: readonly string[];
  readonly review_interval_months: number | null;
  readonly last_reviewed_at: string | null;
  readonly next_review_at: string | null;
  readonly review_overdue: boolean;
  readonly acceptance: Acceptance | null;
  readonly closed_at: string | null;
  readonly treatments: TreatmentCounts;
  readonly url: string;
  readonly can_edit: boolean;
  readonly can_accept: boolean;
  readonly can_delete: boolean;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface RiskCreate {
  readonly register_id?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly source_type?: SourceType | null;
  readonly source_ref?: string | null;
  readonly threat?: string | null;
  readonly vulnerability?: string | null;
  readonly consequence_text?: string | null;
  readonly affected_properties?: readonly CiaProperty[];
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly inherent_likelihood?: number | null;
  readonly inherent_consequence?: number | null;
  readonly treatment_strategy?: Strategy | null;
  readonly treatment_notes?: string | null;
  readonly residual_likelihood?: number | null;
  readonly residual_consequence?: number | null;
  readonly control_refs?: readonly string[];
  readonly review_interval_months?: number | null;
  readonly next_review_at?: string | null;
}

/** PATCH body: only the keys present are applied (null clears a value). */
export interface RiskUpdate extends Partial<RiskCreate> {
  readonly status?: PatchableRiskStatus;
  readonly status_reason?: string | null;
  readonly change_reason?: string | null;
}

export interface RiskListQuery {
  readonly q?: string;
  readonly status?: readonly RiskStatus[];
  readonly register_id?: string;
  readonly category?: RiskCategory;
  /** `me` or a user id. */
  readonly owner?: string;
  /** Band keys. */
  readonly level?: readonly string[];
  readonly source_type?: SourceType;
  readonly review_due?: boolean;
  readonly include_closed?: boolean;
  readonly sort?: RiskSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface RiskAcceptRequest {
  readonly note?: string | null;
  readonly expires_at?: string | null;
}

export interface RiskReviewRequest {
  readonly note?: string | null;
  readonly next_review_at?: string | null;
}

// --- treatments ---------------------------------------------------------------------

export interface Treatment {
  readonly id: string;
  readonly org_id: string;
  readonly risk_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly control_refs: readonly string[];
  readonly owner: UserRef | null;
  readonly due_at: string | null;
  readonly status: TreatmentStatus;
  readonly overdue: boolean;
  readonly task_id: string | null;
  readonly task_status: string | null;
  readonly completed_at: string | null;
  readonly url: string;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface TreatmentCreate {
  readonly title: string;
  readonly description?: string | null;
  readonly control_refs?: readonly string[];
  readonly owner_user_id?: string | null;
  readonly due_at?: string | null;
}

export interface TreatmentUpdate extends Partial<TreatmentCreate> {
  readonly status?: TreatmentStatus;
}

// --- opportunities ------------------------------------------------------------------

export interface Opportunity {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly register: RegisterRef | null;
  readonly source_type: SourceType | null;
  readonly source_ref: string | null;
  readonly benefit: number | null;
  readonly feasibility: number | null;
  readonly score: number | null;
  readonly status: OpportunityStatus;
  readonly action_plan: string | null;
  readonly owner: UserRef | null;
  readonly department: NamedRef | null;
  readonly due_at: string | null;
  readonly overdue: boolean;
  readonly realised_at: string | null;
  readonly url: string;
  readonly can_edit: boolean;
  readonly can_delete: boolean;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface OpportunityCreate {
  readonly register_id?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly source_type?: SourceType | null;
  readonly source_ref?: string | null;
  readonly benefit?: number | null;
  readonly feasibility?: number | null;
  readonly action_plan?: string | null;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly due_at?: string | null;
}

export interface OpportunityUpdate extends Partial<OpportunityCreate> {
  readonly status?: OpportunityStatus;
}

export interface OpportunityListQuery {
  readonly q?: string;
  readonly status?: readonly OpportunityStatus[];
  readonly register_id?: string;
  readonly owner?: string;
  readonly sort?: OpportunitySort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- Statement of Applicability -----------------------------------------------------

export interface SoaStandard {
  readonly standard_key: string;
  readonly standard_name: string;
  readonly standard_enabled: boolean;
  readonly control_count: number;
  readonly entry_count: number;
}

export interface SoaRiskRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly url: string;
}

export interface SoaEntry {
  readonly id: string;
  readonly org_id: string;
  readonly standard_key: string;
  readonly clause_id: string;
  readonly control_ref: string;
  readonly qualified_ref: string;
  readonly title: string;
  readonly title_nb: string | null;
  readonly theme: string | null;
  readonly applicable: boolean;
  readonly implementation_status: ImplementationStatus;
  readonly justification: string | null;
  readonly inclusion_reasons: readonly InclusionReason[];
  readonly implementation_notes: string | null;
  readonly owner: UserRef | null;
  readonly reviewed_at: string | null;
  readonly risks: readonly SoaRiskRef[];
  readonly treatment_count: number;
  readonly needs_justification: boolean;
  readonly url: string;
  readonly updated_at: string;
}

export interface SoaStats {
  readonly total: number;
  readonly applicable: number;
  readonly excluded: number;
  readonly implemented: number;
  readonly partial: number;
  readonly planned: number;
  readonly not_started: number;
  readonly missing_justification: number;
}

export interface Soa {
  readonly standard_key: string;
  readonly standard_name: string;
  readonly standard_enabled: boolean;
  readonly generated: boolean;
  readonly stats: SoaStats;
  readonly items: readonly SoaEntry[];
}

export interface SoaGenerateResult extends Soa {
  readonly created: number;
}

export interface SoaQuery {
  readonly applicable?: boolean;
  readonly implementation_status?: ImplementationStatus;
  readonly theme?: string;
  readonly q?: string;
}

export interface SoaEntryUpdate {
  readonly applicable?: boolean;
  readonly implementation_status?: ImplementationStatus;
  readonly justification?: string | null;
  readonly inclusion_reasons?: readonly InclusionReason[];
  readonly implementation_notes?: string | null;
  readonly owner_user_id?: string | null;
  readonly reviewed?: boolean;
  readonly change_reason?: string | null;
}

// --- heat map / overview ------------------------------------------------------------

export interface HeatmapCell {
  readonly likelihood: number;
  readonly consequence: number;
  readonly score: number;
  readonly level: string;
  readonly color: string | null;
  readonly count: number;
  readonly risk_ids: readonly string[];
}

export interface Heatmap {
  readonly matrix: Matrix;
  readonly basis: HeatmapBasis;
  readonly cells: readonly HeatmapCell[];
  readonly total: number;
  readonly unrated: number;
}

export interface HeatmapQuery {
  readonly basis?: HeatmapBasis;
  readonly matrix_id?: string;
  readonly register_id?: string;
  readonly category?: RiskCategory;
  readonly include_closed?: boolean;
}

export interface RiskOverview {
  readonly risks: {
    readonly total: number;
    readonly open: number;
    readonly by_status: Readonly<Record<string, number>>;
    readonly by_level: Readonly<Record<string, number>>;
    readonly reviews_overdue: number;
    readonly unowned: number;
    readonly above_appetite: number;
  };
  readonly treatments: { readonly open: number; readonly overdue: number };
  readonly opportunities: {
    readonly total: number;
    readonly by_status: Readonly<Record<string, number>>;
  };
  readonly soa: readonly {
    readonly standard_key: string;
    readonly total: number;
    readonly applicable: number;
    readonly implemented: number;
  }[];
}

// --- AI assists ---------------------------------------------------------------------

export interface ThreatSuggestion {
  readonly threat: string;
  readonly vulnerability?: string | null;
  readonly consequence?: string | null;
}

export interface ControlSuggestion {
  readonly ref: string;
  readonly title?: string | null;
  readonly reason?: string | null;
}

export interface TreatmentDraft {
  readonly title: string;
  readonly description?: string | null;
  readonly control_refs?: readonly string[];
}

export interface TreatmentPlan {
  readonly strategy?: Strategy | null;
  readonly treatments?: readonly TreatmentDraft[];
  readonly residual_likelihood?: number | null;
  readonly residual_consequence?: number | null;
  readonly rationale?: string | null;
}
