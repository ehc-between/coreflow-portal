/**
 * DTOs for configurable record types, workflow definitions, templates, workflow
 * instances and approvals (coreflow-core `app/platform/records/schemas.py`,
 * platform contracts 7.1, 7.2 and 7.6). Field and workflow JSON mirror the
 * backend shapes exactly; transitions use the wire key `from`.
 */

/** A label stored either as one string or per language (`{en, nb}`). */
export type LocalizedText = string | Readonly<Record<string, string>>;

export const FIELD_TYPES = [
  'text',
  'textarea',
  'richtext',
  'number',
  'date',
  'datetime',
  'select',
  'multiselect',
  'checkbox',
  'user',
  'department',
  'file',
  'entity_ref',
  'calculated',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldOption {
  readonly value: string;
  readonly label?: LocalizedText | null;
}

export interface VisibleIf {
  readonly field: string;
  readonly equals: unknown;
}

/** One field definition (contracts 7.1). */
export interface FieldSpec {
  readonly key: string;
  readonly label: LocalizedText;
  readonly type: FieldType;
  readonly required?: boolean;
  readonly options?: readonly (string | FieldOption)[] | null;
  readonly help?: LocalizedText | null;
  readonly placeholder?: LocalizedText | null;
  readonly width?: 'full' | 'half';
  readonly section?: string | null;
  readonly min?: number | null;
  readonly max?: number | null;
  readonly entity_type?: string | null;
  readonly formula?: string | null;
  readonly visible_if?: VisibleIf | null;
  readonly default?: unknown;
}

/** A form layout section. */
export interface LayoutSection {
  readonly key: string;
  readonly label?: LocalizedText | null;
  readonly fields: readonly string[];
  readonly columns: 1 | 2;
}

/** Record data keyed by field key. */
export type RecordData = Readonly<Record<string, unknown>>;

/** Per-field validation codes from the validate endpoint. */
export const DATA_ERROR_CODES = [
  'required',
  'invalid_type',
  'invalid_option',
  'too_small',
  'too_large',
  'unknown_field',
  'invalid_reference',
] as const;

export type DataErrorCode = (typeof DATA_ERROR_CODES)[number];

// --- workflow definition (contracts 7.2) ------------------------------------------------

export const STATE_CATEGORIES = ['open', 'in_progress', 'done', 'cancelled'] as const;
export type StateCategory = (typeof STATE_CATEGORIES)[number];

export interface StateDef {
  readonly key: string;
  readonly label: LocalizedText;
  readonly category: StateCategory;
  readonly sla_hours?: number | null;
}

export const APPROVAL_MODES = ['single', 'all', 'quorum'] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export interface ApprovalDef {
  readonly mode: ApprovalMode;
  readonly quorum?: number | null;
  readonly approver_roles: readonly string[];
  readonly approver_user_field?: string | null;
  readonly segregation_of_duties: boolean;
}

export const ASSIGNEE_TYPES = ['role', 'user_field', 'owner'] as const;
export type AssigneeType = (typeof ASSIGNEE_TYPES)[number];

export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskTemplateDef {
  readonly title: LocalizedText;
  readonly description?: LocalizedText | null;
  readonly due_in_days?: number | null;
  readonly priority?: TaskPriority;
  readonly assignee?: { readonly type: AssigneeType; readonly value?: string | null } | null;
}

export const NOTIFY_TYPES = ['owner', 'role', 'user_field', 'watchers', 'user'] as const;
export type NotifyType = (typeof NOTIFY_TYPES)[number];

export interface NotifyDef {
  readonly type: NotifyType;
  readonly value?: string | null;
}

export interface TransitionDef {
  readonly key: string;
  readonly from: readonly string[];
  readonly to: string;
  readonly label: LocalizedText;
  readonly required_fields?: readonly string[];
  readonly allowed_roles?: readonly string[];
  readonly allowed_permissions?: readonly string[];
  readonly allow_owner?: boolean;
  readonly approval?: ApprovalDef | null;
  readonly guards?: readonly string[];
  readonly create_tasks?: readonly TaskTemplateDef[];
  readonly notify?: readonly NotifyDef[];
  readonly require_comment?: boolean;
}

export interface WorkflowDefinition {
  readonly initial_state: string;
  readonly states: readonly StateDef[];
  readonly transitions: readonly TransitionDef[];
}

/** One `{code, loc}` problem from a 422 `invalid_definition`. */
export interface DefinitionIssue {
  readonly code: string;
  readonly loc: string;
  readonly state?: string;
  readonly role?: string;
  readonly guard?: string;
  readonly message?: string;
}

/** One problem from a 422 `invalid_fields` / `invalid_layout`. */
export interface FieldIssue {
  readonly index: number | null;
  readonly key?: string | null;
  readonly code: string;
  readonly message?: string;
}

// --- record types ---------------------------------------------------------------------

export interface RecordTypeVersion {
  readonly id: string;
  readonly record_type_id: string;
  readonly version: number;
  readonly fields: readonly FieldSpec[];
  readonly layout: readonly LayoutSection[];
  readonly workflow_version_id: string | null;
  readonly change_note: string | null;
  readonly published_by: string | null;
  readonly published_by_name: string | null;
  readonly published_at: string;
}

export interface RecordTypeVersionSummary {
  readonly id: string;
  readonly version: number;
  readonly field_count: number;
  readonly workflow_version_id: string | null;
  readonly change_note: string | null;
  readonly published_by: string | null;
  readonly published_by_name: string | null;
  readonly published_at: string;
}

export interface RecordType {
  readonly id: string;
  readonly org_id: string;
  readonly module: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly code_prefix: string | null;
  readonly is_active: boolean;
  readonly template_key: string | null;
  readonly current_version: RecordTypeVersion | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateRecordTypeRequest {
  readonly module: string;
  readonly key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly code_prefix?: string | null;
  readonly is_active?: boolean;
  readonly fields?: readonly FieldSpec[];
  readonly layout?: readonly LayoutSection[];
  readonly workflow_version_id?: string | null;
  readonly change_note?: string | null;
}

export interface UpdateRecordTypeRequest {
  readonly name?: string;
  readonly description?: string | null;
  readonly code_prefix?: string | null;
  readonly is_active?: boolean;
}

export interface PublishRecordTypeVersionRequest {
  readonly fields: readonly FieldSpec[];
  readonly layout?: readonly LayoutSection[];
  readonly workflow_version_id?: string | null;
  readonly change_note?: string | null;
}

export interface ValidateDataRequest {
  readonly data: RecordData;
  readonly partial?: boolean;
  readonly version?: number;
}

export interface ValidateDataResponse {
  readonly data: Record<string, unknown>;
  readonly errors: Readonly<Record<string, string>>;
}

// --- workflows ------------------------------------------------------------------------

export interface WorkflowVersion {
  readonly id: string;
  readonly workflow_id: string;
  readonly version: number;
  readonly definition: WorkflowDefinition;
  readonly change_note: string | null;
  readonly published_by: string | null;
  readonly published_by_name: string | null;
  readonly published_at: string;
}

export interface WorkflowVersionSummary {
  readonly id: string;
  readonly version: number;
  readonly state_count: number;
  readonly transition_count: number;
  readonly change_note: string | null;
  readonly published_by: string | null;
  readonly published_by_name: string | null;
  readonly published_at: string;
}

export interface Workflow {
  readonly id: string;
  readonly org_id: string;
  readonly module: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly template_key: string | null;
  readonly current_version: WorkflowVersion | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateWorkflowRequest {
  readonly module: string;
  readonly key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly definition?: WorkflowDefinition;
  readonly change_note?: string | null;
}

export interface UpdateWorkflowRequest {
  readonly name?: string;
  readonly description?: string | null;
}

export interface WorkflowAiDraftRequest {
  readonly module: string;
  readonly description: string;
  readonly lang?: 'en' | 'nb';
}

/** A designed (never persisted) record type + workflow. */
export interface WorkflowAiDraft {
  readonly name: string;
  readonly key: string;
  readonly description: string | null;
  readonly code_prefix: string | null;
  readonly fields: readonly FieldSpec[];
  readonly layout: readonly LayoutSection[];
  readonly workflow: WorkflowDefinition;
}

// --- templates ------------------------------------------------------------------------

export interface RecordTemplate {
  readonly key: string;
  readonly module: string;
  readonly name: Readonly<Record<string, string>>;
  readonly description: Readonly<Record<string, string>>;
  readonly code_prefix: string | null;
  readonly field_count: number;
  readonly state_count: number;
  readonly transition_count: number;
  readonly installed: boolean;
}

export interface InstallTemplateRequest {
  readonly key?: string;
  readonly name?: string;
  readonly lang?: 'en' | 'nb';
}

export interface InstallTemplateResponse {
  readonly record_type: RecordType;
  readonly workflow: Workflow;
}

// --- instances + approvals ------------------------------------------------------------

export interface TransitionOption {
  readonly key: string;
  readonly to: string;
  readonly label: LocalizedText;
  readonly needs_approval: boolean;
  readonly required_fields: readonly string[];
  readonly require_comment: boolean;
  readonly to_category: StateCategory | string;
  readonly missing_fields: readonly string[];
  readonly blocked_by: string | null;
}

export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface Approval {
  readonly id: string;
  readonly request_id: string;
  readonly transition_key: string;
  readonly decision: ApprovalDecision;
  readonly requested_by: string | null;
  readonly requested_by_name: string | null;
  readonly approver_user_id: string | null;
  readonly approver_role_key: string | null;
  readonly eligible_roles: readonly string[];
  readonly eligible_user_ids: readonly string[];
  readonly decided_by: string | null;
  readonly decided_by_name: string | null;
  readonly decided_at: string | null;
  readonly comment: string | null;
  readonly created_at: string;
  readonly can_decide: boolean;
}

export interface DefinitionVersionRef {
  readonly workflow_id: string;
  readonly workflow_version_id: string;
  readonly version: number;
  readonly name: string;
}

export interface WorkflowInstance {
  readonly id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly state: string;
  readonly state_label: LocalizedText;
  readonly state_category: StateCategory | string;
  readonly state_entered_at: string;
  readonly sla_due_at: string | null;
  readonly closed_at: string | null;
  readonly transitions: readonly TransitionOption[];
  readonly approvals: readonly Approval[];
  readonly definition_version: DefinitionVersionRef;
  readonly definition: WorkflowDefinition;
}

export interface TransitionRequest {
  readonly data?: RecordData;
  readonly comment?: string | null;
  readonly lang?: 'en' | 'nb';
}

export interface TransitionResult {
  readonly state: string;
  readonly pending_approval_ids: readonly string[];
  readonly created_task_ids: readonly string[];
  readonly instance: WorkflowInstance;
}

export interface DecisionRequest {
  readonly approve: boolean;
  readonly comment?: string | null;
}

export interface DecisionResult {
  readonly state: string;
  readonly pending_approval_ids: readonly string[];
  readonly created_task_ids: readonly string[];
}

export interface ApprovalEntityRef {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly url: string | null;
  readonly status: string | null;
  readonly module: string | null;
}

export interface PendingApproval {
  readonly approval: Approval;
  readonly entity: ApprovalEntityRef;
  readonly state: string;
  readonly transition_label: LocalizedText;
  readonly to: string;
}

export interface PendingApprovals {
  readonly items: readonly PendingApproval[];
}
