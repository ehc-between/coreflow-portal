/**
 * M17 environmental management DTOs. They mirror coreflow-core
 * `app/modules/environment/schemas.py` (all endpoints under
 * `v1/orgs/{org}/environment`). Datetimes are naive UTC ISO strings; measurement
 * periods are ISO dates (`YYYY-MM-DD`). Fields added by A19 (connections, targets,
 * evidence) are optional so an older backend still renders.
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
  'code',
  '-code',
  '-score',
  'score',
  'aspect',
  'activity',
  '-updated_at',
  'review_due_at',
] as const;
export type AspectSort = (typeof ASPECT_SORTS)[number];

export const PLAN_SORTS = ['code', '-code', 'title', '-updated_at', 'review_due_at'] as const;
export type PlanSort = (typeof PLAN_SORTS)[number];

export const METRIC_SORTS = ['code', '-code', 'name', '-updated_at'] as const;
export type MetricSort = (typeof METRIC_SORTS)[number];

/** Aspects that need follow-up (`GET aspects?attention=`). */
export const ASPECT_ATTENTION = [
  'without_controls',
  'needs_emergency_plan',
  'review_overdue',
] as const;
export type AspectAttention = (typeof ASPECT_ATTENTION)[number];

/** Plans that need follow-up (`GET emergency-plans?attention=`). */
export const PLAN_ATTENTION = ['drill_overdue', 'review_overdue'] as const;
export type PlanAttention = (typeof PLAN_ATTENTION)[number];

/** A metric's last 12 months against its target (`GET metrics?target=`). */
export const TARGET_STATUSES = ['on_track', 'off_track', 'no_target', 'no_data'] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

/** Whether less (energy, waste) or more (recycled share) is better. */
export const METRIC_DIRECTIONS = ['decrease', 'increase'] as const;
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];

/** Where a measured value comes from (its evidence). */
export const MEASUREMENT_SOURCES = [
  'invoice',
  'meter_reading',
  'estimate',
  'calculation',
  'supplier_report',
  'other',
] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * A record of another type this record is connected to, filtered to what the caller
 * may read: an obligation, a plan, a procedure, a process, an objective …
 */
export interface LinkedRecord {
  readonly entity_type: string;
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly status?: string | null;
  readonly url?: string | null;
  readonly link_id?: string | null;
  readonly link_type?: string | null;
}

export interface PersonRef {
  readonly id: string;
  readonly name: string;
}

// --- overview -----------------------------------------------------------------------

export interface OverviewObligation {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly compliance_status: string | null;
  readonly next_evaluation_at: string | null;
  readonly evaluation_overdue: boolean;
  readonly last_evaluated_at: string | null;
  readonly url: string;
}

export interface OverviewObjective {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly progress: number | null;
  readonly due_date: string | null;
  readonly url: string;
}

export interface OverviewRequirements {
  readonly standard_key: string;
  readonly covered: number;
  readonly applicable: number;
  readonly pct: number;
}

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
  readonly aspects_without_controls?: number;
  readonly aspects_needing_plan?: number;
  readonly aspects_legal?: number;
  readonly metrics_off_target?: number;
  readonly metrics_without_target?: number;
  readonly emissions_previous_year_kg?: number | null;
  /** Null when the caller cannot read obligations or the module is off. */
  readonly obligations?: readonly OverviewObligation[] | null;
  readonly obligations_total?: number | null;
  readonly obligations_evaluation_overdue?: number | null;
  readonly next_compliance_evaluation_at?: string | null;
  /** Null without objectives:read. */
  readonly objectives?: readonly OverviewObjective[] | null;
  /** Null without standards:read (or ISO 14001 not enabled). */
  readonly requirements?: OverviewRequirements | null;
}

// --- scoring method -----------------------------------------------------------------

export type LocalText = Readonly<Partial<Record<string, string>>>;

export interface ScoringCriterion {
  /** Generated from the label by the backend; never shown to users. */
  readonly key: string;
  readonly label: LocalText;
  readonly description?: LocalText;
  readonly weight: number;
  /** What each score value means: `{"1": {en, nb}, …}`. */
  readonly levels?: Readonly<Record<string, LocalText>>;
}

export interface ScoringCriterionIn {
  readonly key?: string;
  readonly label: LocalText;
  readonly description: LocalText;
  readonly weight: number;
  readonly levels: Readonly<Record<string, LocalText>>;
}

export interface ScoringMethodIn {
  readonly method: ScoringMethodKind;
  readonly criteria: readonly ScoringCriterionIn[];
  readonly scale_min: number;
  readonly scale_max: number;
  readonly threshold: number;
  readonly legal_requirement_significant: boolean;
  readonly emergency_significant: boolean;
}

export interface ScoringChange {
  readonly at: string;
  readonly actor_name: string | null;
  readonly method: string | null;
  readonly threshold: number | null;
  readonly criteria: readonly string[];
  readonly recomputed: number | null;
}

export interface ScoringMethod {
  readonly method: ScoringMethodKind;
  readonly criteria: readonly ScoringCriterion[];
  readonly scale_min: number;
  readonly scale_max: number;
  readonly threshold: number;
  readonly legal_requirement_significant: boolean;
  readonly emergency_significant: boolean;
  readonly max_score: number;
  readonly is_default: boolean;
  /** Set by `PUT /scoring`: how many aspects were re-scored. */
  readonly recomputed?: number | null;
  readonly updated_at?: string | null;
  readonly updated_by_name?: string | null;
  readonly history?: readonly ScoringChange[];
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
  readonly operational_controls?: string | null;
  readonly status?: RecordStatus;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly review_due_at?: string | null;
  readonly process_id?: string | null;
  /** Null / omitted = unchanged; [] = clear. `legal_requirement` follows the list. */
  readonly obligation_ids?: readonly string[] | null;
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
  readonly threshold?: number;
  readonly max_score?: number;
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
  readonly process_id?: string | null;
  readonly process?: LinkedRecord | null;
  readonly obligations?: readonly LinkedRecord[];
  readonly emergency_plans?: readonly LinkedRecord[];
  /** Linked procedures, processes, objectives, risks, tasks … (operational control). */
  readonly controls?: readonly LinkedRecord[];
  /** A significant aspect with neither control text nor a linked control. */
  readonly controls_missing?: boolean;
  /** An abnormal / emergency aspect with no active emergency plan covering it. */
  readonly needs_emergency_plan?: boolean;
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
  readonly process_id?: string;
  readonly attention?: AspectAttention;
  readonly sort?: AspectSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ReviewIn {
  readonly next_review_at?: string | null;
  readonly note?: string | null;
}

// --- emergency plans and drills -----------------------------------------------------

/** An org member (`user_id`, name filled in by the backend) or an external contact. */
export interface EmergencyContact {
  readonly user_id?: string | null;
  readonly name?: string | null;
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
  /** The aspects (abnormal / emergency situations) the plan covers. */
  readonly aspect_ids?: readonly string[] | null;
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
  readonly aspects?: readonly LinkedRecord[];
  /** Open "revise the plan" tasks raised by drills. */
  readonly open_revision_tasks?: number;
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
  readonly attention?: PlanAttention;
  readonly sort?: PlanSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface DrillCreate {
  readonly held_at: string;
  readonly kind?: DrillKind;
  readonly outcome: DrillOutcome;
  readonly participants?: number | null;
  /** Org members who took part (the count is at least their number). */
  readonly participant_user_ids?: readonly string[];
  readonly findings?: string | null;
  readonly lessons_learned?: string | null;
  /** True: a "revise the plan" task is created for the plan owner. */
  readonly plan_revision_needed?: boolean;
}

export interface Drill {
  readonly id: string;
  readonly plan_id: string;
  readonly held_at: string;
  readonly kind: DrillKind;
  readonly outcome: DrillOutcome;
  readonly participants: number | null;
  readonly participant_list?: readonly PersonRef[];
  readonly findings: string | null;
  readonly lessons_learned: string | null;
  readonly plan_revision_needed: boolean;
  readonly revision_task_id?: string | null;
  readonly recorded_by: string | null;
  readonly recorded_by_name: string | null;
  readonly completed_task_id: string | null;
  readonly url?: string | null;
  readonly created_at: string;
}

// --- metrics and measurements -------------------------------------------------------

export interface MetricCreate {
  readonly name: string;
  readonly category: MetricCategory;
  readonly unit: string;
  readonly ghg_scope?: GhgScope | null;
  readonly emission_factor?: number | null;
  readonly factor_source?: string | null;
  readonly factor_year?: number | null;
  readonly direction?: MetricDirection;
  readonly target_value?: number | null;
  readonly target_year?: number | null;
  readonly baseline_value?: number | null;
  readonly baseline_year?: number | null;
  readonly measurement_method?: string | null;
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
  readonly factor_source?: string | null;
  readonly factor_year?: number | null;
  readonly direction?: MetricDirection;
  readonly target_value?: number | null;
  readonly target_year?: number | null;
  readonly baseline_value?: number | null;
  readonly baseline_year?: number | null;
  readonly measurement_method?: string | null;
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
  readonly latest_period_start?: string | null;
  readonly latest_period_end: string | null;
  /** The latest value against the one before it, in %. */
  readonly latest_change_pct?: number | null;
  readonly last_12_months_value?: number | null;
  readonly current_year_value?: number | null;
  readonly previous_year_value?: number | null;
  readonly target_status?: TargetStatus;
  readonly objectives?: readonly LinkedRecord[];
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
  readonly target?: TargetStatus;
  readonly sort?: MetricSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface MeasurementCreate {
  readonly period_start: string;
  readonly period_end?: string | null;
  readonly value: number;
  readonly source?: MeasurementSource | null;
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
  readonly source?: MeasurementSource | null;
  /** Evidence files (attachments on `env_measurement`). */
  readonly attachment_count?: number;
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
  readonly emission_factor?: number | null;
  readonly factor_source?: string | null;
  readonly factor_year?: number | null;
  readonly previous_co2e_kg?: number | null;
  readonly change_pct?: number | null;
  readonly url?: string | null;
}

/** An active metric whose data is not counted in the emissions. */
export interface MetricGap {
  readonly metric_id: string;
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  readonly category: MetricCategory;
  readonly ghg_scope: GhgScope | null;
  readonly reason: 'no_factor' | 'no_scope';
  readonly url: string;
}

export interface EmissionsYear {
  readonly year: number;
  readonly scopes: Readonly<Partial<Record<GhgScope, number>>>;
  readonly total_kg: number;
}

export type ScopeStatus = 'measured' | 'not_measured';

export interface Emissions {
  readonly year: number;
  readonly scopes: Readonly<Partial<Record<GhgScope, number>>>;
  readonly scope_status?: Readonly<Partial<Record<GhgScope, ScopeStatus>>>;
  readonly total_kg: number;
  readonly total_t: number;
  readonly by_metric: readonly EmissionsByMetric[];
  readonly previous_year?: EmissionsYear | null;
  readonly change_pct?: number | null;
  readonly scope_change_pct?: Readonly<Partial<Record<GhgScope, number | null>>>;
  readonly missing_factor?: readonly MetricGap[];
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

/** Entity types of the records environment links to. */
export const ENTITY_OBLIGATION = 'compliance_obligation';
export const ENTITY_PROCESS = 'process';

/** The create-from-here flows the module offers in its own buttons (backend `flows.py`). */
export const FLOWS = {
  aspectToObjective: 'env_aspect.to_objective',
  aspectToRisk: 'env_aspect.to_risk',
  aspectToDocument: 'env_aspect.to_document',
  aspectToTask: 'env_aspect.to_task',
  aspectToPlan: 'env_aspect.to_emergency_plan',
  planToDeviation: 'emergency_plan.to_deviation',
  planToTask: 'emergency_plan.to_task',
  drillToDeviation: 'env_drill.to_deviation',
  drillToTask: 'env_drill.to_task',
  metricToObjective: 'env_metric.to_objective',
  metricToKpi: 'env_metric.to_kpi',
  metricToDeviation: 'env_metric.to_deviation',
} as const;
