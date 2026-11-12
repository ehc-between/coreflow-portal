/**
 * Reports (M23) DTOs, mirroring coreflow-core `app/modules/reports/schemas.py`.
 * All endpoints live under `v1/orgs/{org}/reports` and answer 404
 * `{detail: {code: 'module_disabled'}}` while the module is off. Datetimes are
 * naive-UTC ISO strings.
 */

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['csv', 'xlsx', 'pdf'];

export type ReportLang = 'en' | 'nb';
export const REPORT_LANGS: readonly ReportLang[] = ['en', 'nb'];

export type WidgetSize = 'sm' | 'md' | 'lg';
export const WIDGET_SIZES: readonly WidgetSize[] = ['sm', 'md', 'lg'];

export type FrameworkKey =
  | 'iso9001'
  | 'iso27001'
  | 'iso14001'
  | 'iso42001'
  | 'iso45001'
  | 'gdpr'
  | 'eu_ai_act'
  | 'nis2';

export const FRAMEWORK_KEYS: readonly FrameworkKey[] = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso42001',
  'iso45001',
  'gdpr',
  'eu_ai_act',
  'nis2',
];

export function isFrameworkKey(value: unknown): value is FrameworkKey {
  return typeof value === 'string' && (FRAMEWORK_KEYS as readonly string[]).includes(value);
}

export type DefinitionSort = 'name' | '-updated_at' | '-created_at' | 'register_key';
export const DEFINITION_SORTS: readonly DefinitionSort[] = [
  'name',
  '-updated_at',
  '-created_at',
  'register_key',
];

/** A localized label from the backend (`{en, nb}`). */
export type LocalizedLabel = Readonly<Partial<Record<string, string>>>;

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

// --- calendar ------------------------------------------------------------------

export type CalendarItemKind = 'due' | 'review' | 'action';

export interface CalendarItem {
  readonly module: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly due_at: string;
  readonly kind: CalendarItemKind | string;
  readonly url: string | null;
  readonly status: string | null;
  readonly overdue: boolean;
  readonly label_key: string | null;
}

export interface CalendarResponse {
  readonly start: string;
  readonly end: string;
  readonly items: readonly CalendarItem[];
  readonly truncated: boolean;
}

export interface CalendarQuery {
  readonly from?: string | null;
  readonly to?: string | null;
  readonly modules?: readonly string[];
  readonly framework?: FrameworkKey | null;
  readonly include_overdue?: boolean;
}

// --- compliance dashboard --------------------------------------------------------

export interface ComplianceFramework {
  readonly framework: string;
  readonly standard_key: string;
  readonly name: string;
  readonly kind: string;
  readonly enabled: boolean;
  readonly in_profile: boolean;
  readonly readiness: number | null;
}

export interface ReadinessItem {
  readonly framework: string | null;
  readonly standard_key: string;
  readonly applicable: number;
  readonly covered: number;
  readonly partial: number;
  readonly fresh: number;
  readonly score: number;
}

export interface ReadinessSummary {
  readonly items: readonly ReadinessItem[];
  readonly average: number | null;
}

export interface ModuleCount {
  readonly module: string;
  readonly count: number;
}

export interface OverdueSummary {
  readonly total: number;
  readonly truncated: boolean;
  readonly by_module: readonly ModuleCount[];
  readonly items: readonly CalendarItem[];
}

/** A metric computed by a module (built in, or registered through `report_metrics`). */
export interface MetricBlock {
  readonly key: string;
  readonly module: string;
  readonly title_key: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface DeviationFindings {
  readonly open: number;
  readonly overdue: number;
  readonly open_actions: number;
  readonly overdue_actions: number;
  readonly by_severity: Readonly<Record<string, number>>;
  readonly by_standard: Readonly<Record<string, number>>;
}

export interface OpenFindings {
  readonly total: number;
  readonly sources: readonly MetricBlock[];
  readonly deviations?: DeviationFindings;
}

export interface ComplianceResponse {
  readonly framework: string | null;
  readonly generated_at: string;
  readonly frameworks: readonly ComplianceFramework[];
  readonly readiness: ReadinessSummary | null;
  readonly overdue: OverdueSummary;
  readonly open_findings: OpenFindings;
  readonly risk_heat_map: MetricBlock | null;
  readonly training_compliance: MetricBlock | null;
  readonly documents: { readonly overdue: number; readonly due_soon: number } | null;
  readonly tasks: { readonly value: number; readonly due_soon: number } | null;
}

// --- dashboards --------------------------------------------------------------------

export interface WidgetCatalogItem {
  readonly key: string;
  readonly module: string;
  readonly kind: string;
  readonly permission: string;
  readonly title_key: string;
  readonly description_key: string | null;
  readonly frameworks: readonly string[];
  readonly default: boolean;
  readonly available: boolean;
}

export interface WidgetCatalog {
  readonly items: readonly WidgetCatalogItem[];
}

export interface DashboardWidget {
  readonly key: string;
  readonly framework: string | null;
  readonly size: WidgetSize | string;
  readonly module: string | null;
  readonly kind: string | null;
  readonly title_key: string | null;
  readonly available: boolean;
  readonly data: Readonly<Record<string, unknown>> | null;
}

export type DashboardSource = 'role' | 'org' | 'builtin';

export interface DashboardResponse {
  readonly source: DashboardSource;
  readonly role_key: string | null;
  readonly framework: string | null;
  readonly generated_at: string;
  readonly widgets: readonly DashboardWidget[];
}

/** One widget of a stored layout (`PUT /dashboards/{scope}` body item). */
export interface WidgetConfig {
  readonly key: string;
  readonly framework?: FrameworkKey | null;
  readonly size: WidgetSize;
}

export interface DashboardConfig {
  /** `default` (the organisation default) or a role key. */
  readonly scope: string;
  readonly role_key: string | null;
  readonly widgets: readonly WidgetConfig[];
  readonly updated_at: string;
  readonly updated_by: UserRef | null;
}

export interface DashboardConfigList {
  readonly items: readonly DashboardConfig[];
}

export const MAX_DASHBOARD_WIDGETS = 24;

// --- registers ------------------------------------------------------------------------

export type RegisterParam = 'q' | 'status' | 'from' | 'to' | 'standard_key';

export interface RegisterColumn {
  readonly key: string;
  readonly label: LocalizedLabel;
}

export interface Register {
  readonly key: string;
  readonly module: string;
  readonly label: LocalizedLabel;
  readonly columns: readonly RegisterColumn[];
  readonly params: readonly string[];
  readonly statuses: readonly string[];
  readonly requires_standard: boolean;
  readonly frameworks: readonly string[];
  readonly formats: readonly string[];
}

export interface RegisterList {
  readonly items: readonly Register[];
}

export interface RegisterPreview {
  readonly register_key: string;
  readonly columns: readonly RegisterColumn[];
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly total: number;
  readonly truncated: boolean;
}

/** Register filters, as stored on a definition and sent as query params. */
export interface ReportFilters {
  readonly q?: string | null;
  readonly status?: readonly string[];
  readonly from?: string | null;
  readonly to?: string | null;
  readonly standard_key?: string | null;
}

export interface RegisterQuery extends ReportFilters {
  readonly lang?: ReportLang;
  readonly limit?: number;
}

export interface RegisterExportQuery extends ReportFilters {
  readonly format: ExportFormat;
  readonly columns?: readonly string[];
  readonly lang?: ReportLang;
}

// --- saved reports (definitions) ---------------------------------------------------------

export interface ReportDefinition {
  readonly id: string;
  readonly org_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly register_key: string;
  readonly register_label: LocalizedLabel | null;
  readonly filters: ReportFilters;
  readonly columns: readonly string[];
  readonly default_format: ExportFormat;
  readonly lang: ReportLang;
  readonly owner: UserRef | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_exported_at: string | null;
  readonly url: string;
  readonly can_edit: boolean;
}

export interface DefinitionList {
  readonly items: readonly ReportDefinition[];
  readonly total: number;
}

export interface DefinitionListQuery {
  readonly q?: string | null;
  readonly register_key?: string | null;
  /** `me` or a user id. */
  readonly owner?: string | null;
  readonly sort?: DefinitionSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateDefinitionRequest {
  readonly name: string;
  readonly description?: string | null;
  readonly register_key: string;
  readonly filters?: ReportFilters;
  readonly columns?: readonly string[];
  readonly default_format: ExportFormat;
  readonly lang: ReportLang;
}

export interface UpdateDefinitionRequest {
  readonly name?: string;
  readonly description?: string | null;
  readonly filters?: ReportFilters;
  readonly columns?: readonly string[];
  readonly default_format?: ExportFormat;
  readonly lang?: ReportLang;
  readonly owner_user_id?: string;
  readonly change_reason?: string | null;
}

export interface ScheduleRequest {
  readonly rrule: string;
  readonly dtstart: string;
  readonly lead_days?: number;
  readonly assignee_type?: 'user' | 'role' | 'department';
  readonly assignee_value?: string;
}

export interface ScheduleResponse {
  readonly task_id: string;
  readonly recurrence_id: string | null;
  readonly due_at: string | null;
}

// --- audit packs -----------------------------------------------------------------------

export interface AuditPackFile {
  readonly path: string;
  readonly kind: string;
  readonly rows: number | null;
  readonly size_bytes: number;
}

export interface AuditPackSummary {
  readonly readiness?: number | null;
  readonly requirements?: number;
  readonly applicable?: number;
  readonly covered?: number;
  readonly evidence_links?: number;
  readonly policies?: number;
  readonly registers?: number | readonly string[];
  readonly [key: string]: unknown;
}

export interface AuditPack {
  readonly id: string;
  readonly org_id: string;
  readonly title: string;
  readonly standard_key: string;
  readonly framework: string | null;
  readonly status: string;
  readonly lang: ReportLang | string;
  readonly file_name: string;
  readonly size_bytes: number;
  readonly sha256: string | null;
  readonly contents: readonly AuditPackFile[];
  readonly summary: AuditPackSummary;
  readonly generated_by: UserRef | null;
  readonly generated_at: string;
  readonly url: string;
  readonly download_url: string;
}

export interface AuditPackList {
  readonly items: readonly AuditPack[];
  readonly total: number;
}

export interface AuditPackListQuery {
  readonly standard_key?: string | null;
  readonly framework?: FrameworkKey | null;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateAuditPackRequest {
  readonly standard_key: string;
  readonly title?: string | null;
  readonly lang: ReportLang;
  readonly include_policies: boolean;
  readonly registers?: readonly string[] | null;
}

// --- AI -------------------------------------------------------------------------------

export type ComplianceAudience = 'management' | 'auditor' | 'staff';
export const COMPLIANCE_AUDIENCES: readonly ComplianceAudience[] = [
  'management',
  'auditor',
  'staff',
];

/** Assist key of the narrative "state of compliance" report. */
export const STATE_OF_COMPLIANCE_ASSIST = 'reports.state_of_compliance';

// --- permissions ----------------------------------------------------------------------

export const REPORTS_PERMISSIONS = {
  read: 'reports:read',
  write: 'reports:write',
  manage: 'reports:manage',
  auditPack: 'reports:audit_pack',
} as const;

/** Backend module key (page context, module gate). */
export const REPORTS_MODULE = 'reports';
