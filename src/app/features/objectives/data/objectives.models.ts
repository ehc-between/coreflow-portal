/**
 * Objectives, KPIs and measurement (M08) DTOs. They mirror coreflow-core
 * `app/modules/objectives/schemas.py` (routes under `/api/v1/orgs/{org}/objectives`).
 * Dates are `YYYY-MM-DD`; datetimes are naive UTC ISO strings.
 */

export const MANAGEMENT_SYSTEMS = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso42001',
  'iso45001',
  'gdpr',
  'eu_ai_act',
  'nis2',
] as const;
export type ManagementSystem = (typeof MANAGEMENT_SYSTEMS)[number];

export const OBJECTIVE_STATUSES = [
  'draft',
  'active',
  'achieved',
  'not_achieved',
  'cancelled',
] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];
/** Statuses a new objective may start in. */
export const NEW_OBJECTIVE_STATUSES: readonly ObjectiveStatus[] = ['draft', 'active'];
export const CLOSED_OBJECTIVE_STATUSES: readonly ObjectiveStatus[] = [
  'achieved',
  'not_achieved',
  'cancelled',
];

export const KPI_STATUSES = ['active', 'paused', 'retired'] as const;
export type KpiStatus = (typeof KPI_STATUSES)[number];

export const KPI_DIRECTIONS = ['higher', 'lower'] as const;
export type KpiDirection = (typeof KPI_DIRECTIONS)[number];

export const KPI_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly'] as const;
export type KpiFrequency = (typeof KPI_FREQUENCIES)[number];

export const MEASUREMENT_STATUSES = ['on_track', 'at_risk', 'off_track', 'no_target'] as const;
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];

/** `last_status` filter values (adds `no_data` for KPIs never measured). */
export const KPI_HEALTH_FILTERS = [...MEASUREMENT_STATUSES, 'no_data'] as const;
export type KpiHealthFilter = (typeof KPI_HEALTH_FILTERS)[number];

export const TRENDS = ['improving', 'worsening', 'stable', 'insufficient_data'] as const;
export type Trend = (typeof TRENDS)[number];

export const OBJECTIVE_SORTS = [
  'due_date',
  '-due_date',
  'code',
  '-code',
  'title',
  '-updated_at',
] as const;
export type ObjectiveSort = (typeof OBJECTIVE_SORTS)[number];

export const KPI_SORTS = [
  'code',
  '-code',
  'name',
  'status',
  '-last_period_end',
  '-updated_at',
] as const;
export type KpiSort = (typeof KPI_SORTS)[number];

export interface UserRef {
  readonly id: string;
  readonly name: string;
}

export interface ObjectiveRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
}

export interface KpiSummary {
  readonly total: number;
  readonly on_track: number;
  readonly at_risk: number;
  readonly off_track: number;
  readonly no_data: number;
}

export interface Objective {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly management_system: ManagementSystem | null;
  readonly status: ObjectiveStatus;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly target: string | null;
  readonly plan: string | null;
  readonly resources: string | null;
  readonly evaluation_method: string | null;
  readonly start_date: string | null;
  readonly due_date: string | null;
  readonly overdue: boolean;
  readonly progress: number | null;
  readonly closed_at: string | null;
  readonly closing_note: string | null;
  readonly kpis: KpiSummary;
  readonly url: string;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ObjectiveDetail extends Objective {
  readonly kpi_items: readonly Kpi[];
  readonly can_edit: boolean;
  readonly can_delete: boolean;
}

export interface ObjectiveList {
  readonly items: readonly Objective[];
  readonly total: number;
}

export interface ObjectiveListQuery {
  readonly q?: string;
  readonly status?: readonly ObjectiveStatus[];
  readonly management_system?: ManagementSystem;
  readonly owner?: string;
  readonly department_id?: string;
  readonly overdue?: boolean;
  readonly sort?: ObjectiveSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateObjectiveRequest {
  readonly title: string;
  readonly description?: string | null;
  readonly management_system?: ManagementSystem | null;
  readonly status?: 'draft' | 'active';
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly target?: string | null;
  readonly plan?: string | null;
  readonly resources?: string | null;
  readonly evaluation_method?: string | null;
  readonly start_date?: string | null;
  readonly due_date?: string | null;
  readonly progress?: number | null;
}

export interface UpdateObjectiveRequest extends Omit<Partial<CreateObjectiveRequest>, 'status'> {
  readonly status?: ObjectiveStatus;
  readonly closing_note?: string | null;
  readonly change_reason?: string | null;
}

export interface ObjectivesOverview {
  readonly objectives: {
    readonly total: number;
    readonly by_status: Readonly<Record<ObjectiveStatus, number>>;
    readonly overdue: number;
  };
  readonly kpis: {
    readonly total: number;
    readonly on_track: number;
    readonly at_risk: number;
    readonly off_track: number;
    readonly no_data: number;
    readonly measurement_overdue: number;
  };
}

export interface Kpi {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly objective: ObjectiveRef | null;
  readonly management_system: ManagementSystem | null;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly unit: string | null;
  readonly direction: KpiDirection;
  readonly baseline_value: number | null;
  readonly target_value: number | null;
  readonly warning_value: number | null;
  readonly frequency: KpiFrequency;
  readonly data_source: string | null;
  readonly status: KpiStatus;
  readonly start_date: string | null;
  readonly measurement_reminders: boolean;
  readonly last_value: number | null;
  readonly last_period_end: string | null;
  readonly last_status: MeasurementStatus | null;
  readonly next_due_date: string | null;
  readonly measurement_overdue: boolean;
  readonly url: string;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface KpiDetail extends Kpi {
  readonly can_edit: boolean;
  readonly can_delete: boolean;
  readonly can_measure: boolean;
}

export interface KpiList {
  readonly items: readonly Kpi[];
  readonly total: number;
}

export interface KpiListQuery {
  readonly q?: string;
  readonly status?: readonly KpiStatus[];
  readonly last_status?: readonly KpiHealthFilter[];
  readonly objective_id?: string;
  readonly management_system?: ManagementSystem;
  readonly owner?: string;
  readonly department_id?: string;
  readonly sort?: KpiSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateKpiRequest {
  readonly name: string;
  readonly description?: string | null;
  readonly objective_id?: string | null;
  readonly management_system?: ManagementSystem | null;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly unit?: string | null;
  readonly direction?: KpiDirection;
  readonly baseline_value?: number | null;
  readonly target_value?: number | null;
  readonly warning_value?: number | null;
  readonly frequency?: KpiFrequency;
  readonly data_source?: string | null;
  readonly start_date?: string | null;
  readonly measurement_reminders?: boolean;
}

export interface UpdateKpiRequest extends Partial<CreateKpiRequest> {
  readonly status?: KpiStatus;
  readonly change_reason?: string | null;
}

export interface SeriesPoint {
  readonly period_end: string;
  readonly value: number;
  readonly status: MeasurementStatus;
  readonly target_value: number | null;
  readonly warning_value: number | null;
}

export interface SeriesStats {
  readonly count: number;
  readonly latest: number | null;
  readonly previous: number | null;
  readonly change: number | null;
  readonly change_pct: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly average: number | null;
  readonly trend: Trend;
  readonly on_track_share: number | null;
}

export interface KpiSeries {
  readonly kpi_id: string;
  readonly unit: string | null;
  readonly direction: KpiDirection;
  readonly target_value: number | null;
  readonly warning_value: number | null;
  readonly baseline_value: number | null;
  readonly points: readonly SeriesPoint[];
  readonly stats: SeriesStats;
}

export interface Measurement {
  readonly id: string;
  readonly kpi_id: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly value: number;
  readonly status: MeasurementStatus;
  readonly target_value: number | null;
  readonly warning_value: number | null;
  readonly note: string | null;
  readonly recorded_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly can_edit: boolean;
}

export interface MeasurementList {
  readonly items: readonly Measurement[];
  readonly total: number;
}

export interface MeasurementListQuery {
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateMeasurementRequest {
  readonly period_end: string;
  readonly period_start?: string | null;
  readonly value: number;
  readonly note?: string | null;
}

export interface UpdateMeasurementRequest {
  readonly value?: number;
  readonly period_start?: string | null;
  readonly note?: string | null;
}

// --- AI assists ------------------------------------------------------------------

/** Assist keys the backend registers (`POST /ai/assist/{key}`). */
export const ASSIST_SUGGEST_SMART = 'objectives.suggest_smart';
export const ASSIST_EXPLAIN_DEVIATION = 'objectives.explain_deviation';

export interface SuggestedKpi {
  readonly name: string;
  readonly unit?: string | null;
  readonly direction?: KpiDirection | null;
  readonly baseline_value?: number | null;
  readonly target_value?: number | null;
  readonly warning_value?: number | null;
  readonly frequency?: KpiFrequency | null;
}

export interface SuggestedObjective {
  readonly title: string;
  readonly description?: string | null;
  readonly target?: string | null;
  readonly plan?: string | null;
  readonly resources?: string | null;
  readonly evaluation_method?: string | null;
  readonly due_in_months?: number | null;
  readonly kpis?: readonly SuggestedKpi[];
}

export interface SmartSuggestions {
  readonly objectives: readonly SuggestedObjective[];
}
