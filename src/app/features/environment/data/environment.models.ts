/**
 * M17 environmental management DTOs. They mirror coreflow-core
 * `app/modules/environment/schemas.py` (all endpoints under
 * `v1/orgs/{org}/environment`). Datetimes are naive UTC ISO strings; measurement
 * periods are ISO dates (`YYYY-MM-DD`).
 */

export const PERM_READ = 'environment:read';
export const PERM_WRITE = 'environment:write';
export const PERM_MANAGE = 'environment:manage';
export const PERM_RECORD = 'environment:record';

export const IMPACT_TYPES = [
  'air',
  'water',
  'land',
  'resources',
  'energy',
  'waste',
  'biodiversity',
  'noise',
  'climate',
  'other',
] as const;
export type ImpactType = (typeof IMPACT_TYPES)[number];

export const CONDITIONS = ['normal', 'abnormal', 'emergency'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LIFECYCLE_STAGES = [
  'raw_materials',
  'design',
  'production',
  'transport',
  'use',
  'end_of_life',
  'disposal',
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const CONTROL_LEVELS = ['direct', 'indirect'] as const;
export type ControlLevel = (typeof CONTROL_LEVELS)[number];

export const RECORD_STATUSES = ['draft', 'active', 'retired'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const METRIC_STATUSES = ['active', 'retired'] as const;
export type MetricStatus = (typeof METRIC_STATUSES)[number];

export const DRILL_KINDS = ['drill', 'tabletop', 'real_event'] as const;
export type DrillKind = (typeof DRILL_KINDS)[number];

export const DRILL_OUTCOMES = ['effective', 'partially_effective', 'ineffective'] as const;
export type DrillOutcome = (typeof DRILL_OUTCOMES)[number];

export const METRIC_CATEGORIES = [
  'energy',
  'water',
  'waste',
  'emissions',
  'materials',
  'other',
] as const;
export type MetricCategory = (typeof METRIC_CATEGORIES)[number];

export const GHG_SCOPES = ['scope1', 'scope2', 'scope3'] as const;
export type GhgScope = (typeof GHG_SCOPES)[number];

export const SCORING_METHODS = ['sum', 'product'] as const;
export type ScoringMethodKind = (typeof SCORING_METHODS)[number];

export const TREND_BUCKETS = ['month', 'quarter', 'year'] as const;
export type TrendBucket = (typeof TREND_BUCKETS)[number];

export const SIGNIFICANCE_REASONS = [
  'score',
  'legal_requirement',
  'emergency',
  'override',
] as const;
export type SignificanceReason = (typeof SIGNIFICANCE_REASONS)[number];

export const ASPECT_SORTS = [
  '-updated_at',
  'code',
  '-code',
  '-score',
  'score',
  'aspect',
  'review_due_at',
] as const;
export type AspectSort = (typeof ASPECT_SORTS)[number];

export const PLAN_SORTS = ['-updated_at', 'code', '-code', 'title', 'review_due_at'] as const;
export type PlanSort = (typeof PLAN_SORTS)[number];

export const METRIC_SORTS = ['-updated_at', 'code', '-code', 'name'] as const;
export type MetricSort = (typeof METRIC_SORTS)[number];

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

// --- overview -----------------------------------------------------------------------

export interface EnvironmentOverview {
  readonly aspects_total: number;
  readonly aspects_significant: number;
  readonly aspects_draft: number;
  readonly aspects_review_overdue: number;
  readonly plans_total: number;
  readonly plans_active: number;
  readonly plans_drill_overdue: number;
  readonly plans_review_overdue: number;
  readonly metrics_active: number;
  readonly measurements_last_12_months: number;
  readonly emissions_ytd_kg: number;
}

// --- scoring method -----------------------------------------------------------------

export interface ScoringCriterion {
  readonly key: string;
  readonly label: Readonly<Partial<Record<string, string>>>;
  readonly weight: number;
}

export interface ScoringMethodIn {
  readonly method: ScoringMethodKind;
  readonly criteria: readonly ScoringCriterion[];
  readonly scale_min: number;
  readonly scale_max: number;
  readonly threshold: number;
  readonly legal_requirement_significant: boolean;
  readonly emergency_significant: boolean;
}

export interface ScoringMethod extends ScoringMethodIn {
  readonly max_score: number;
  readonly is_default: boolean;
  /** Set by `PUT /scoring`: how many aspects were re-scored. */
  readonly recomputed?: number | null;
}

// --- aspects ------------------------------------------------------------------------

export interface AspectCreate {
  readonly activity: string;
  readonly aspect: string;
  readonly impact?: string | null;
  readonly impact_type?: ImpactType;
  readonly condition?: Condition;
  readonly lifecycle_stages?: readonly LifecycleStage[];
  readonly control_level?: ControlLevel;
  readonly site?: string | null;
  readonly scores?: Readonly<Record<string, number | null>>;
  readonly significance_override?: boolean | null;
  readonly override_reason?: string | null;
  readonly legal_requirement?: boolean;
  readonly operational_controls?: string | null;
  readonly status?: RecordStatus;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly review_due_at?: string | null;
}

/** Only the keys present are applied; `scores` merges (null clears one criterion). */
export type AspectUpdate = Partial<AspectCreate> & { readonly change_reason?: string | null };

export interface Aspect {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly activity: string;
  readonly aspect: string;
  readonly impact: string | null;
  readonly impact_type: ImpactType;
  readonly condition: Condition;
  readonly lifecycle_stages: readonly LifecycleStage[];
  readonly control_level: ControlLevel;
  readonly site: string | null;
  readonly scores: Readonly<Record<string, number>>;
  readonly score: number | null;
  readonly evaluated: boolean;
  readonly computed_significant: boolean;
  readonly significant: boolean;
  readonly significance_reasons: readonly SignificanceReason[];
  readonly significance_override: boolean | null;
  readonly override_reason: string | null;
  readonly legal_requirement: boolean;
  readonly operational_controls: string | null;
  readonly status: RecordStatus;
  readonly owner_user_id: string | null;
  readonly owner_name: string | null;
  readonly department_id: string | null;
  readonly review_due_at: string | null;
  readonly last_reviewed_at: string | null;
  readonly review_overdue: boolean;
  readonly url: string;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AspectListQuery {
  readonly q?: string;
  readonly status?: readonly RecordStatus[];
  readonly significant?: boolean;
  readonly impact_type?: ImpactType;
  readonly condition?: Condition;
  readonly lifecycle_stage?: LifecycleStage;
  readonly owner?: string;
  readonly department_id?: string;
  readonly site?: string;
  readonly sort?: AspectSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ReviewIn {
  readonly next_review_at?: string | null;
  readonly note?: string | null;
}

// --- emergency plans and drills -----------------------------------------------------

export interface EmergencyContact {
  readonly name: string;
  readonly role?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
}

export interface PlanCreate {
  readonly title: string;
  readonly scenario?: string | null;
  readonly potential_impact?: string | null;
  readonly response_procedure?: string | null;
  readonly resources?: string | null;
  readonly contacts?: readonly EmergencyContact[];
  readonly site?: string | null;
  readonly status?: RecordStatus;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly drill_rrule?: string | null;
  readonly drill_start?: string | null;
  readonly review_due_at?: string | null;
}

export type PlanUpdate = Partial<PlanCreate> & { readonly change_reason?: string | null };

export interface EmergencyPlan {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly scenario: string | null;
  readonly potential_impact: string | null;
  readonly response_procedure: string | null;
  readonly resources: string | null;
  readonly contacts: readonly EmergencyContact[];
  readonly site: string | null;
  readonly status: RecordStatus;
  readonly owner_user_id: string | null;
  readonly owner_name: string | null;
  readonly department_id: string | null;
  readonly drill_rrule: string | null;
  readonly drill_recurrence_id: string | null;
  readonly next_drill_due_at: string | null;
  readonly last_drill_at: string | null;
  readonly last_drill_outcome: DrillOutcome | null;
  readonly drill_count: number;
  readonly drill_overdue: boolean;
  readonly review_due_at: string | null;
  readonly last_reviewed_at: string | null;
  readonly review_overdue: boolean;
  readonly url: string;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PlanListQuery {
  readonly q?: string;
  readonly status?: readonly RecordStatus[];
  readonly owner?: string;
  readonly site?: string;
  readonly sort?: PlanSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface DrillCreate {
  readonly held_at: string;
  readonly kind?: DrillKind;
  readonly outcome: DrillOutcome;
  readonly participants?: number | null;
  readonly findings?: string | null;
  readonly lessons_learned?: string | null;
  readonly plan_revision_needed?: boolean;
}

export interface Drill {
  readonly id: string;
  readonly plan_id: string;
  readonly held_at: string;
  readonly kind: DrillKind;
  readonly outcome: DrillOutcome;
  readonly participants: number | null;
  readonly findings: string | null;
  readonly lessons_learned: string | null;
  readonly plan_revision_needed: boolean;
  readonly recorded_by: string | null;
  readonly recorded_by_name: string | null;
  readonly completed_task_id: string | null;
  readonly created_at: string;
}

// --- metrics and measurements -------------------------------------------------------

export interface MetricCreate {
  readonly name: string;
  readonly category: MetricCategory;
  readonly unit: string;
  readonly ghg_scope?: GhgScope | null;
  readonly emission_factor?: number | null;
  readonly description?: string | null;
  readonly site?: string | null;
  readonly status?: MetricStatus;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly collection_rrule?: string | null;
  readonly collection_start?: string | null;
}

export type MetricUpdate = Partial<MetricCreate>;

export interface Metric {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly name: string;
  readonly category: MetricCategory;
  readonly unit: string;
  readonly ghg_scope: GhgScope | null;
  readonly emission_factor: number | null;
  readonly description: string | null;
  readonly site: string | null;
  readonly status: MetricStatus;
  readonly owner_user_id: string | null;
  readonly owner_name: string | null;
  readonly department_id: string | null;
  readonly collection_rrule: string | null;
  readonly collection_recurrence_id: string | null;
  readonly measurement_count: number;
  readonly latest_value: number | null;
  readonly latest_period_end: string | null;
  readonly url: string;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MetricListQuery {
  readonly q?: string;
  readonly category?: MetricCategory;
  readonly ghg_scope?: GhgScope;
  readonly status?: readonly MetricStatus[];
  readonly owner?: string;
  readonly site?: string;
  readonly sort?: MetricSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface MeasurementCreate {
  readonly period_start: string;
  readonly period_end?: string | null;
  readonly value: number;
  readonly site?: string | null;
  readonly note?: string | null;
}

export type MeasurementUpdate = Partial<MeasurementCreate>;

export interface Measurement {
  readonly id: string;
  readonly metric_id: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly value: number;
  readonly unit: string;
  readonly emission_factor: number | null;
  readonly co2e_kg: number | null;
  readonly site: string | null;
  readonly note: string | null;
  readonly recorded_by: string | null;
  readonly recorded_by_name: string | null;
  readonly can_edit: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MeasurementQuery {
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface TrendPoint {
  readonly period: string;
  readonly value: number;
  readonly co2e_kg: number | null;
  readonly count: number;
  readonly change_pct: number | null;
}

export interface Trend {
  readonly metric_id: string;
  readonly unit: string;
  readonly bucket: TrendBucket;
  readonly points: readonly TrendPoint[];
  readonly total: number;
  readonly total_co2e_kg: number | null;
}

export interface EmissionsByMetric {
  readonly metric_id: string;
  readonly code: string;
  readonly name: string;
  readonly ghg_scope: GhgScope | null;
  readonly unit: string;
  readonly value: number;
  readonly co2e_kg: number;
}

export interface Emissions {
  readonly year: number;
  readonly scopes: Readonly<Partial<Record<GhgScope, number>>>;
  readonly total_kg: number;
  readonly total_t: number;
  readonly by_metric: readonly EmissionsByMetric[];
}

// --- AI assists ---------------------------------------------------------------------

export const ASSIST_SUGGEST_ASPECTS = 'environment.suggest_aspects';
export const ASSIST_DRAFT_RESPONSE = 'environment.draft_emergency_response';

/** One suggestion of `environment.suggest_aspects`. */
export interface SuggestedAspect {
  readonly aspect: string;
  readonly impact: string;
  readonly impact_type: ImpactType;
  readonly condition: Condition;
  readonly lifecycle_stages: readonly LifecycleStage[];
  readonly suggested_controls: string;
  readonly rationale: string;
}

/** Entity types of this module (platform contracts 1.2, plus env_drill and env_metric). */
export const ENTITY_ASPECT = 'env_aspect';
export const ENTITY_PLAN = 'emergency_plan';
export const ENTITY_DRILL = 'env_drill';
export const ENTITY_METRIC = 'env_metric';
export const ENTITY_MEASUREMENT = 'env_measurement';
