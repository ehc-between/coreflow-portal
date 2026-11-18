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

/**
 * Statuses that count as "open": the same set as the backend
 * (`OPEN_RISK_STATUSES`). An accepted risk is still a risk the organisation
 * carries, so the list's "Open" filter matches the overview KPI.
 */
export const OPEN_RISK_STATUSES: readonly RiskStatus[] = [
  'identified',
  'assessed',
  'in_treatment',
  'monitoring',
  'accepted',
];

/** Record types a risk or opportunity can point at as "what is exposed" (backend `SubjectType`). */
export const SUBJECT_TYPES = [
  'asset',
  'continuity_ict_system',
  'process',
  'supplier',
  'processor',
  'project',
  'contract',
  'ai_system',
  'ropa_entry',
  'document',
  'position',
] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const EFFECTIVENESS_RESULTS = ['effective', 'partially_effective', 'not_effective'] as const;
export type EffectivenessResult = (typeof EFFECTIVENESS_RESULTS)[number];

/** A linked record as the platform returns it (`EntityRefDto`); render with `app-entity-chip`. */
export interface EntityRef {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code?: string | null;
  readonly url?: string | null;
  readonly status?: string | null;
  readonly module?: string | null;
  readonly label_key?: string | null;
}

/** A cited control, ready to display ("A.8.13 · title") with its SoA status. */
export interface ControlRef {
  /** Canonical, e.g. `iso27001:A.8.13`. */
  readonly ref: string;
  readonly standard_key: string | null;
  readonly framework: string | null;
  readonly short: Readonly<Record<string, string>> | null;
  readonly number: string;
  readonly title: string | null;
  readonly title_nb: string | null;
  readonly soa_entry_id: string | null;
  readonly applicable: boolean | null;
  readonly implementation_status: ImplementationStatus | null;
  /** The SoA entry page, when the org has one. */
  readonly url: string | null;
}

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
  /** Language of the template labels and level descriptions. */
  readonly lang?: 'en' | 'nb';
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
  /** The real record the risk is about (null: free text only, or not readable). */
  readonly source_entity?: EntityRef | null;
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
  /** Which rating "current" is: residual when set, else inherent (null: unrated). */
  readonly current_basis?: 'residual' | 'inherent' | null;
  readonly above_appetite: boolean;
  /** Above the appetite but formally accepted (shown neutrally, with who and until when). */
  readonly accepted_above_appetite?: boolean;
  readonly appetite_max_score?: number | null;
  readonly control_refs: readonly string[];
  readonly controls?: readonly ControlRef[];
  /** Standards a risk of this register usually documents (narrows requirement suggestions). */
  readonly frameworks?: readonly string[];
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
  readonly source_entity_type?: SubjectType | null;
  readonly source_entity_id?: string | null;
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
  /** Open, not accepted risks above the appetite. */
  readonly above_appetite?: boolean;
  readonly source_entity_type?: string;
  readonly source_entity_id?: string;
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
  readonly controls?: readonly ControlRef[];
  readonly owner: UserRef | null;
  readonly due_at: string | null;
  readonly status: TreatmentStatus;
  readonly overdue: boolean;
  readonly task_id: string | null;
  readonly task_status: string | null;
  readonly completed_at: string | null;
  readonly effectiveness?: Effectiveness | null;
  /** Done, but nobody has checked yet whether it worked. */
  readonly needs_effectiveness_check?: boolean;
  readonly url: string;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** U24: a row of the org-wide treatment plan (`GET /risk/treatments`), with its risk. */
export interface TreatmentPlanItem extends Treatment {
  readonly risk: {
    readonly id: string;
    readonly code: string;
    readonly title: string;
    readonly status: string;
    readonly url: string;
  };
}

export const TREATMENT_SORTS = ['due_at', '-due_at', '-created_at', 'risk'] as const;
export type TreatmentSort = (typeof TREATMENT_SORTS)[number];

export interface TreatmentPlanQuery {
  readonly q?: string;
  /** CSV of statuses, or the meta-value `open` (planned + in progress). */
  readonly status?: string;
  readonly owner?: string;
  readonly risk_id?: string;
  readonly overdue?: boolean;
  readonly needs_effectiveness_check?: boolean;
  readonly sort?: TreatmentSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface Effectiveness {
  readonly result: EffectivenessResult;
  readonly note: string | null;
  readonly checked_at: string | null;
  readonly checked_by: UserRef | null;
}

export interface EffectivenessRequest {
  readonly result: EffectivenessResult;
  readonly note?: string | null;
  readonly checked_at?: string | null;
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
  readonly source_entity?: EntityRef | null;
  readonly benefit: number | null;
  readonly feasibility: number | null;
  readonly score: number | null;
  /** Highest possible score (benefit x feasibility, 25). */
  readonly max_score?: number;
  /** Action items: tasks on the opportunity. */
  readonly actions?: TreatmentCounts;
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
  readonly source_entity_type?: SubjectType | null;
  readonly source_entity_id?: string | null;
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

/** A localised display name, `{en, nb}`. */
export type LocalLabel = Readonly<Record<string, string>>;

export interface SoaVersion {
  readonly id: string;
  readonly standard_key: string;
  readonly version_no: number;
  readonly note: string | null;
  readonly approved_by: UserRef | null;
  readonly approved_at: string;
  readonly stats: Readonly<Record<string, unknown>>;
}

export interface SoaStandard {
  readonly standard_key: string;
  readonly standard_name: string;
  readonly standard_label?: LocalLabel;
  readonly standard_enabled: boolean;
  readonly control_count: number;
  readonly entry_count: number;
  /** Entries with a written justification ("decided"). */
  readonly justified?: number;
  readonly implemented?: number;
  readonly applicable?: number;
  readonly latest_version?: SoaVersion | null;
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
  /** Documents and policies linked to the entry ("Documented in"). */
  readonly documentation?: readonly EntityRef[];
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
  readonly justified?: number;
  readonly documented?: number;
}

export interface Soa {
  readonly standard_key: string;
  readonly standard_name: string;
  readonly standard_label?: LocalLabel;
  readonly standard_enabled: boolean;
  readonly generated: boolean;
  readonly stats: SoaStats;
  readonly latest_version?: SoaVersion | null;
  /** Entries changed after the latest approved version. */
  readonly changed_since_version?: boolean;
  readonly items: readonly SoaEntry[];
}

export interface SoaGenerateResult extends Soa {
  readonly created: number;
}

export interface SoaQuery {
  readonly missing_justification?: boolean;
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

/** The same change for many entries of one SoA (all or nothing). */
export interface SoaBulkUpdate extends Omit<SoaEntryUpdate, 'implementation_notes'> {
  readonly entry_ids: readonly string[];
}

export interface SoaBulkResult {
  readonly updated: number;
  readonly unchanged: number;
  readonly items: readonly SoaEntry[];
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
  /** Risks rated on this basis (older APIs omit it: total - unrated). */
  readonly rated?: number;
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
    readonly rated?: number;
    readonly unrated?: number;
    readonly accepted_above_appetite?: number;
  };
  readonly appetite?: {
    readonly matrix_id?: string | null;
    readonly max_score?: number | null;
    readonly matrix_max_score?: number | null;
  };
  readonly treatments: {
    readonly open: number;
    readonly overdue: number;
    readonly awaiting_effectiveness_check?: number;
  };
  readonly opportunities: {
    readonly total: number;
    readonly by_status: Readonly<Record<string, number>>;
  };
  readonly soa: readonly {
    readonly standard_key: string;
    readonly total: number;
    readonly applicable: number;
    readonly implemented: number;
    readonly standard_label?: LocalLabel;
    readonly justified?: number;
    readonly missing_justification?: number;
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
