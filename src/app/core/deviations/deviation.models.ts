/** An ISO/management standard a deviation can relate to. */
export type Standard = 'iso9001' | 'iso14001' | 'iso45001' | 'iso27001' | 'gdpr';

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

/** Where a deviation was raised from. */
export type Source = 'internal' | 'audit' | 'inspection' | 'customer' | 'incident' | 'other';

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
  readonly status: DeviationStatus;
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
  readonly effectiveness?: ActionEffectiveness;
  readonly notes?: string;
  readonly created_at: string;
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
}

/** An audit-trail event on a deviation (status change, edit, action, …). */
export interface DeviationEvent {
  readonly id: string;
  readonly deviation_id: string;
  readonly kind: string;
  readonly summary: string;
  readonly detail?: string;
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
  readonly root_cause_method?: string;
  readonly visibility: DeviationVisibility;
  /** Values for the type's dynamic schema fields, keyed by field key. */
  readonly data: Record<string, unknown>;
  readonly actions: readonly Action[];
  readonly events: readonly DeviationEvent[];
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
  readonly root_cause_method?: string;
  readonly data: Record<string, unknown>;
  readonly visibility?: DeviationVisibility;
}

/** Partial update to a deviation (every field optional). */
export interface UpdateDeviationRequest {
  readonly title?: string;
  readonly description?: string;
  readonly standards?: readonly Standard[];
  readonly clauses?: readonly ClauseRef[];
  readonly tags?: readonly string[];
  readonly severity?: Severity;
  readonly status?: DeviationStatus;
  readonly source?: Source;
  readonly owner_user_id?: string;
  readonly department_id?: string;
  readonly due_at?: string;
  readonly root_cause?: string;
  readonly root_cause_method?: string;
  readonly data?: Record<string, unknown>;
  readonly visibility?: DeviationVisibility;
}

/** Filters accepted by the deviations list endpoint. */
export interface DeviationFilters {
  readonly status?: DeviationStatus;
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
  readonly by_status: Record<DeviationStatus, number>;
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
