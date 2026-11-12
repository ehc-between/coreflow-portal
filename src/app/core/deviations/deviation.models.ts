import { WorkflowInstance } from '../records/record.models';

/** An ISO/management standard a deviation can relate to. */
export type Standard =
  | 'iso9001'
  | 'iso14001'
  | 'iso45001'
  | 'iso27001'
  | 'gdpr'
  | 'iso42001'
  | 'eu_ai_act'
  | 'nis2';

/** Deviation severity, low → critical. */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/** Deviation lifecycle status. */
export type DeviationStatus =
  | 'open'
  | 'investigating'
  | 'action'
  | 'verification'
  | 'closed'
  | 'cancelled';

/**
 * The lifecycle category of a status. Legacy statuses map onto it; a record-typed
 * deviation's custom workflow state carries its own category.
 */
export type StatusCategory = 'open' | 'in_progress' | 'done' | 'cancelled';

/** Where a deviation was raised from. */
export type Source = 'internal' | 'audit' | 'inspection' | 'customer' | 'incident' | 'other';

/** Structured root-cause analysis method. */
export type RootCauseMethod = 'five_why' | 'fishbone' | '8d' | 'other';

/** Who may see a deviation: the whole org, or a restricted set of subjects. */
export type DeviationVisibility = 'organization' | 'restricted';

/** The kind of control a dynamic schema field renders as. */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'user'
  | 'department';

/** How wide a field renders in the deviation form layout. */
export type FieldWidth = 'full' | 'half';

/** A single dynamic field in a deviation type's schema. */
export interface FieldDef {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly required: boolean;
  /** Option values for `select` / `multiselect`. */
  readonly options?: readonly string[];
  readonly help?: string;
  readonly placeholder?: string;
  /**
   * Column width in the form layout: `full` spans both columns, `half` is one
   * of a two-column pair. Defaults to `full`.
   */
  readonly width: FieldWidth;
  /**
   * The section this field belongs to, grouping fields in list order. A
   * `null`/empty section is the default (first, untitled) section.
   */
  readonly section?: string | null;
}

/** A deviation type: its identity, the standards it covers and its dynamic schema. */
export interface DeviationType {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly standards: readonly Standard[];
  readonly code_prefix: string;
  readonly schema: readonly FieldDef[];
  readonly is_active: boolean;
  /**
   * The F4 record type this deviation type is bound to (M03). New deviations of a
   * bound type use the record type's fields and workflow; `schema` is unused for them.
   */
  readonly record_type_id?: string | null;
}

/** Body for creating or updating a deviation type (admin form-builder). */
export interface DeviationTypeInput {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly standards?: readonly Standard[];
  readonly code_prefix: string;
  readonly schema: readonly FieldDef[];
  readonly is_active?: boolean;
  /** Bind to an F4 record type (`deviations:admin`); an explicit null unbinds. */
  readonly record_type_id?: string | null;
}

/** AI-proposed draft of a deviation type, to populate the editor for review. */
export interface DeviationTypeDraftResponse {
  readonly name: string;
  readonly key: string;
  readonly code_prefix: string;
  readonly description: string | null;
  readonly standards: readonly Standard[];
  readonly schema: readonly FieldDef[];
}

/** A standard + clause reference pair (e.g. iso9001 / "8.7"). */
export interface ClauseRef {
  readonly standard: Standard;
  readonly clause: string;
}

/** A row in the deviations list (also the shape returned by create). */
export interface DeviationListItem {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly type_id: string;
  readonly type_name?: string;
  readonly standards: readonly Standard[];
  readonly clauses: readonly ClauseRef[];
  readonly tags: readonly string[];
  readonly severity: Severity;
  /**
   * A legacy {@link DeviationStatus}, or the current state key of the deviation's
   * F4 workflow (record-typed deviations).
   */
  readonly status: string;
  /** The status's lifecycle category (always set by the M03 API). */
  readonly status_category?: StatusCategory;
  /** The pinned record type version (null / absent for legacy deviations). */
  readonly record_type_version_id?: string | null;
  readonly source: Source;
  readonly owner_user_id?: string;
  readonly owner_name?: string;
  readonly department_id?: string;
  readonly raised_at: string;
  readonly due_at?: string;
  readonly closed_at?: string;
  readonly created_at: string;
}

/** What a CAPA action is meant to do: contain, correct or prevent recurrence. */
export type ActionKind = 'containment' | 'corrective' | 'preventive';

/** Lifecycle status of a CAPA action. */
export type ActionStatus = 'open' | 'in_progress' | 'done' | 'verified' | 'cancelled';

/** Outcome of an action's effectiveness verification. */
export type ActionEffectiveness = 'effective' | 'not_effective' | 'pending';

/** A containment / corrective / preventive action attached to a deviation. */
export interface Action {
  readonly id: string;
  readonly deviation_id: string;
  readonly kind: ActionKind;
  readonly description: string;
  readonly status: ActionStatus;
  readonly owner_user_id?: string;
  readonly owner_name?: string;
  readonly due_at?: string;
  readonly completed_at?: string;
  readonly verified_at?: string;
  readonly verified_by_user_id?: string;
  readonly verified_by_name?: string;
  readonly effectiveness?: ActionEffectiveness;
  readonly notes?: string;
  /** When the action's effectiveness is to be reviewed (schedules an F2 task). */
  readonly effectiveness_review_due_at?: string | null;
  /** The F2 review task created for `effectiveness_review_due_at`. */
  readonly effectiveness_review_task_id?: string | null;
  readonly created_at: string;
}

/** A row in the cross-deviation action list: the action plus its parent deviation's headline. */
export interface ActionListItem extends Action {
  readonly deviation_code: string;
  readonly deviation_title: string;
  readonly deviation_status: string;
  readonly deviation_severity: Severity;
}

/**
 * Filters for `GET orgs/{org}/actions`. With no `status` the backend returns
 * open + in-progress actions; `overdue` narrows to those past their due date.
 */
export interface ActionFilters {
  /** A user id, or `me` for the caller. */
  readonly owner_user_id?: string;
  readonly status?: readonly ActionStatus[];
  readonly overdue?: boolean;
  readonly due_before?: string;
  readonly due_after?: string;
  /** `due_at` (default, undated last), `created_at`, `status`, `kind`, `deviation_code`; `-` prefix for descending. */
  readonly sort?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/** A page of actions plus the unpaged total. */
export interface ActionListResponse {
  readonly items: readonly ActionListItem[];
  readonly total: number;
}

/** Body for creating or updating an action (all fields optional on update). */
export interface ActionInput {
  readonly kind?: ActionKind;
  readonly description?: string;
  readonly status?: ActionStatus;
  readonly owner_user_id?: string;
  readonly due_at?: string;
  readonly effectiveness?: ActionEffectiveness;
  readonly notes?: string;
  /** Schedules (or moves) the effectiveness review task; `null` cancels it. */
  readonly effectiveness_review_due_at?: string | null;
}

/** An audit-trail event on a deviation (status change, edit, action, …). */
export interface DeviationEvent {
  readonly id: string;
  readonly deviation_id: string;
  /** Machine-readable event kind (`created`, `status_changed`, `action_added`, …). */
  readonly kind: string;
  /** The backend's English one-liner; the UI localises from `kind` + `detail` instead. */
  readonly summary: string;
  /**
   * Structured context, e.g. `{from, to, reason}` for a status change,
   * `{fields}` for an edit, `{kind}` / `{status}` for actions.
   */
  readonly detail?: Readonly<Record<string, unknown>> | null;
  readonly actor_user_id?: string;
  readonly actor_name?: string;
  readonly created_at: string;
}

/** Whether an access grant targets a single user or a whole department. */
export type AccessSubjectType = 'user' | 'department';

/** Access level a grant confers on its subject. */
export type AccessLevel = 'view' | 'edit';

/** A single access grant on a deviation. */
export interface AccessGrant {
  readonly id: string;
  readonly subject_type: AccessSubjectType;
  readonly subject_id: string;
  readonly subject_name: string;
  readonly level: AccessLevel;
}

/** A locally-chosen grant (no id yet), submitted with create. */
export interface AccessGrantInput {
  readonly subject_type: AccessSubjectType;
  readonly subject_id: string;
  readonly level: AccessLevel;
}

/** Full access state for a deviation: visibility, owner and explicit grants. */
export interface DeviationAccess {
  readonly visibility: DeviationVisibility;
  readonly owner_user_id?: string;
  readonly owner_name?: string;
  readonly grants: readonly AccessGrant[];
}

/** Full deviation detail: the list shape plus body, actions, events and data. */
export interface DeviationDetail extends DeviationListItem {
  readonly description?: string;
  readonly root_cause?: string;
  readonly root_cause_method?: RootCauseMethod | null;
  readonly visibility: DeviationVisibility;
  /** Values for the type's dynamic schema fields, keyed by field key. */
  readonly data: Record<string, unknown>;
  readonly actions: readonly Action[];
  readonly events: readonly DeviationEvent[];
  /**
   * Status transitions the workflow offers from the current status. Blocked
   * ones carry `blocked_by`. Optional so an API without the workflow rules
   * still renders.
   */
  readonly allowed_transitions?: readonly DeviationTransition[];
  /** The bound record type (record-typed deviations only). */
  readonly record_type_id?: string | null;
  /** The pinned record type version number (record-typed deviations only). */
  readonly record_type_version?: number | null;
  /**
   * The F4 workflow instance view of a record-typed deviation (state, SLA,
   * transitions, approvals, definition); null for legacy deviations.
   */
  readonly workflow?: DeviationWorkflow | null;
}

/**
 * The F4 workflow instance view embedded in a record-typed deviation's detail
 * (same shape as `GET workflow-instances/deviation/{id}`).
 */
export type DeviationWorkflow = Omit<WorkflowInstance, 'id' | 'entity_type' | 'entity_id'> &
  Partial<Pick<WorkflowInstance, 'id' | 'entity_type' | 'entity_id'>>;

/** Body of `POST deviations/{id}/transitions/{key}`. */
export interface DeviationTransitionRequest {
  readonly comment?: string | null;
  readonly lang?: 'en' | 'nb';
}

/** Error codes the deviation workflow returns (409) or uses to block a transition. */
export type WorkflowErrorCode =
  | 'invalid_transition'
  | 'reason_required'
  | 'root_cause_required'
  | 'open_actions'
  | 'verification_required'
  | 'deviation_closed';

/** One status the deviation can move to, as offered by `GET deviations/{id}`. */
export interface DeviationTransition {
  readonly to: DeviationStatus;
  readonly requires_reason: boolean;
  /** Present when the transition is currently blocked; explains why. */
  readonly blocked_by?: WorkflowErrorCode | null;
}

/** An action that blocks a status transition (e.g. still open when closing). */
export interface WorkflowBlockingAction {
  readonly action_id: string;
  readonly description: string;
}

/** The `detail` body of a 409 from a rejected status change. */
export interface WorkflowErrorDetail {
  readonly code: WorkflowErrorCode;
  readonly message: string;
  readonly blocking?: readonly WorkflowBlockingAction[];
}

/** Body for creating a deviation. `data` holds the dynamic schema values. */
export interface CreateDeviationRequest {
  readonly type_id: string;
  readonly title: string;
  readonly description?: string;
  readonly standards?: readonly Standard[];
  readonly clauses?: readonly ClauseRef[];
  readonly tags?: readonly string[];
  readonly severity: Severity;
  readonly source: Source;
  readonly owner_user_id?: string;
  readonly department_id?: string;
  readonly due_at?: string;
  readonly root_cause?: string;
  readonly root_cause_method?: RootCauseMethod;
  readonly data: Record<string, unknown>;
  readonly visibility?: DeviationVisibility;
  /** F8 links created from the new deviation (at most 20). */
  readonly links?: readonly DeviationLinkInput[];
}

/** The link types a new deviation may be linked with (F8). */
export const DEVIATION_LINK_TYPES = [
  'relates_to',
  'caused_by',
  'mitigates',
  'evidence_for',
  'supersedes',
  'implements',
  'derived_from',
] as const;
export type DeviationLinkType = (typeof DEVIATION_LINK_TYPES)[number];

/** An F8 link to create from a new deviation. */
export interface DeviationLinkInput {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly link_type: DeviationLinkType;
}

/** Partial update to a deviation (every field optional). */
export interface UpdateDeviationRequest {
  readonly title?: string;
  readonly description?: string;
  readonly standards?: readonly Standard[];
  readonly clauses?: readonly ClauseRef[];
  readonly tags?: readonly string[];
  readonly severity?: Severity;
  readonly status?: string;
  /** Why the status is changing (max 2000 chars); required by transitions with `requires_reason`. */
  readonly status_reason?: string;
  readonly source?: Source;
  readonly owner_user_id?: string;
  /** `null` clears the department. */
  readonly department_id?: string | null;
  readonly due_at?: string;
  readonly root_cause?: string;
  /** `null` clears the method. */
  readonly root_cause_method?: RootCauseMethod | null;
  readonly data?: Record<string, unknown>;
  readonly visibility?: DeviationVisibility;
}

/** Filters accepted by the deviations list endpoint. */
export interface DeviationFilters {
  /** Legacy statuses or workflow state keys (repeatable). */
  readonly status?: string | readonly string[];
  /** Lifecycle category (list only). */
  readonly category?: StatusCategory;
  /** Only deviations pinned to this record type (list only). */
  readonly record_type_id?: string;
  readonly type_id?: string;
  readonly standard?: Standard;
  readonly severity?: Severity;
  readonly tag?: string;
  readonly clause?: string;
  readonly owner_user_id?: string;
  readonly department_id?: string;
  readonly source?: Source;
  readonly due_before?: string;
  readonly due_after?: string;
  readonly q?: string;
  /** Only deviations that are not closed or cancelled. */
  readonly active?: boolean;
  /** Only deviations that are not closed or cancelled and past their due date. */
  readonly overdue?: boolean;
  readonly sort?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/** A page of deviations plus the unpaged total for pagination. */
export interface DeviationListResponse {
  readonly items: readonly DeviationListItem[];
  readonly total: number;
}

/** A deviation type's contribution to the stats breakdown. */
export interface StatsTypeCount {
  readonly type_id: string;
  readonly name: string;
  readonly count: number;
}

/** A standard + clause pair's contribution to the stats breakdown. */
export interface StatsClauseCount {
  readonly standard: Standard;
  readonly clause: string;
  readonly count: number;
}

/** A single month bucket in the opened-over-time trend. */
export interface StatsMonthCount {
  /** Month bucket as `YYYY-MM`. */
  readonly month: string;
  readonly count: number;
}

/** Aggregate deviation metrics for the stats dashboard. */
export interface DeviationStats {
  readonly total: number;
  readonly open: number;
  readonly closed: number;
  readonly overdue: number;
  readonly by_status: Record<string, number>;
  readonly by_type: readonly StatsTypeCount[];
  readonly by_standard: Record<string, number>;
  readonly by_severity: Record<Severity, number>;
  readonly by_department: Record<string, number>;
  readonly by_clause: readonly StatsClauseCount[];
  readonly opened_over_time: readonly StatsMonthCount[];
  readonly open_actions: number;
  readonly overdue_actions: number;
}

/** The selectable subjects for the user/department pickers, split by kind. */
export interface AccessSubjects {
  readonly users: readonly { readonly id: string; readonly name: string; readonly email: string }[];
  readonly departments: readonly { readonly id: string; readonly name: string }[];
}

// --- M03: templates, root-cause analyses, similar cases -------------------------------

/** A built-in deviation record template (`GET deviation-templates`). */
export interface DeviationTemplate {
  readonly key: string;
  /** Per-language name, `{en, nb}`. */
  readonly name: Readonly<Record<string, string>>;
  readonly description: Readonly<Record<string, string>>;
  readonly code_prefix: string | null;
  readonly standards: readonly string[];
  readonly field_count: number;
  readonly state_count: number;
  readonly transition_count: number;
  /** The org's deviation type installed from this template (null: not installed). */
  readonly deviation_type_id: string | null;
  readonly record_type_id: string | null;
}

export interface DeviationTemplateList {
  readonly items: readonly DeviationTemplate[];
}

/** Body of `POST deviation-templates/{key}/install`. */
export interface InstallDeviationTemplateRequest {
  readonly lang?: 'en' | 'nb';
  readonly name?: string;
}

/** Root-cause worksheet methods (5 Whys, fishbone, free form). */
export const ROOT_CAUSE_ANALYSIS_METHODS = ['five_whys', 'fishbone', 'other'] as const;
export type RootCauseAnalysisMethod = (typeof ROOT_CAUSE_ANALYSIS_METHODS)[number];

/** The fishbone (Ishikawa) cause categories, in display order. */
export const FISHBONE_CATEGORIES = [
  'people',
  'method',
  'machine',
  'material',
  'measurement',
  'environment',
  'management',
] as const;
export type FishboneCategory = (typeof FISHBONE_CATEGORIES)[number];

/** One step of a 5 Whys chain. */
export interface FiveWhysStep {
  readonly question: string;
  readonly answer: string;
}

/** A root-cause worksheet on a deviation. */
export interface RootCauseAnalysis {
  readonly id: string;
  readonly deviation_id: string;
  readonly method: string;
  readonly problem: string | null;
  readonly whys: readonly FiveWhysStep[];
  readonly categories: Readonly<Record<string, readonly string[]>>;
  readonly conclusion: string | null;
  /** When the conclusion was copied into the deviation's root cause. */
  readonly applied_at: string | null;
  /** Where the worksheet came from (e.g. `manual`). */
  readonly source: string;
  readonly created_by: string | null;
  readonly created_by_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface RootCauseAnalysisList {
  readonly items: readonly RootCauseAnalysis[];
}

/** Body of `POST deviations/{id}/root-causes`. */
export interface CreateRootCauseRequest {
  readonly method: RootCauseAnalysisMethod;
  readonly problem?: string | null;
  readonly whys?: readonly FiveWhysStep[];
  readonly categories?: Partial<Record<FishboneCategory, readonly string[]>>;
  readonly conclusion?: string | null;
  /** Copy the conclusion into the deviation's root cause right away. */
  readonly apply?: boolean;
}

/** Body of `PATCH deviations/{id}/root-causes/{rid}`. */
export interface UpdateRootCauseRequest {
  readonly problem?: string | null;
  readonly whys?: readonly FiveWhysStep[];
  readonly categories?: Partial<Record<FishboneCategory, readonly string[]>>;
  readonly conclusion?: string | null;
}

/** A similar past deviation (`GET deviations/{id}/similar`). */
export interface SimilarDeviation {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly status_category: string;
  readonly severity: string;
  readonly type_name: string;
  readonly raised_at: string;
  readonly closed_at: string | null;
  readonly root_cause: string | null;
  readonly score: number;
}

export interface SimilarDeviationList {
  readonly items: readonly SimilarDeviation[];
}

// --- M03: AI assist results ------------------------------------------------------------

/** `deviations.register_from_text`: structured fields drafted from free text. */
export interface RegisterFromTextResult {
  readonly type_id: string | null;
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly source: Source;
  readonly data: Record<string, unknown>;
  readonly missing: readonly string[];
}

/** `deviations.suggest_root_cause`: a proposed worksheet. */
export interface SuggestedRootCause {
  readonly problem: string;
  readonly whys: readonly FiveWhysStep[];
  readonly categories: Readonly<Record<string, readonly string[]>>;
  readonly conclusion: string;
}

/** One proposed CAPA action from `deviations.suggest_actions`. */
export interface SuggestedAction {
  readonly kind: ActionKind;
  readonly description: string;
  readonly due_in_days: number | null;
  readonly rationale: string;
}

export interface SuggestedActions {
  readonly actions: readonly SuggestedAction[];
}
