/**
 * M01 "Context of the organisation and leadership" DTOs. They mirror
 * coreflow-core `app/modules/context/schemas.py` (base path
 * `/api/v1/orgs/{org_id}/context`). Datetimes are naive-UTC ISO strings.
 *
 * Fields added by the A04 polish are optional, so the pages keep working
 * against a backend that does not send them yet.
 */

export const FRAMEWORK_KEYS = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso42001',
  'iso45001',
  'gdpr',
  'eu_ai_act',
  'nis2',
] as const;
export type FrameworkKey = (typeof FRAMEWORK_KEYS)[number];

/** The ISO management-system standards (they share the clause structure 4-10). */
export const ISO_FRAMEWORKS: readonly string[] = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso42001',
  'iso45001',
];

export const CONTROLLED_STATUSES = ['draft', 'in_review', 'approved', 'retired'] as const;
export type ControlledStatus = (typeof CONTROLLED_STATUSES)[number];

export const SIMPLE_STATUSES = ['active', 'archived'] as const;
export type SimpleStatus = (typeof SIMPLE_STATUSES)[number];

export const ANALYSIS_METHODS = ['swot', 'pestle'] as const;
export type AnalysisMethod = (typeof ANALYSIS_METHODS)[number];

export const LEVELS = ['low', 'medium', 'high'] as const;
export type Level = (typeof LEVELS)[number];

export const SWOT_CATEGORIES = ['strength', 'weakness', 'opportunity', 'threat'] as const;
export const PESTLE_CATEGORIES = [
  'political',
  'economic',
  'social',
  'technological',
  'legal',
  'environmental',
] as const;
export type AnalysisCategory =
  | (typeof SWOT_CATEGORIES)[number]
  | (typeof PESTLE_CATEGORIES)[number];

export const PARTY_CATEGORIES = [
  'customer',
  'employee',
  'owner',
  'regulator',
  'supplier',
  'partner',
  'community',
  'competitor',
  'other',
] as const;
export type PartyCategory = (typeof PARTY_CATEGORIES)[number];

export const PARTY_TYPES = ['internal', 'external'] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const ADDRESSED_STATUSES = [
  'not_addressed',
  'partially',
  'addressed',
  'not_relevant',
] as const;
export type AddressedStatus = (typeof ADDRESSED_STATUSES)[number];

export const PARTY_PRIORITIES = [
  'manage_closely',
  'keep_satisfied',
  'keep_informed',
  'monitor',
] as const;
export type PartyPriority = (typeof PARTY_PRIORITIES)[number];

export const POLICY_KINDS = [
  'quality',
  'information_security',
  'environment',
  'ai',
  'privacy',
  'health_safety',
  'other',
] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

export const RACI_ROLES = ['R', 'A', 'C', 'I'] as const;
export type Raci = (typeof RACI_ROLES)[number];

export const ASSIGNEE_TYPES = ['user', 'role', 'department'] as const;
export type AssigneeType = (typeof ASSIGNEE_TYPES)[number];

export const RACI_WARNINGS = ['no_accountable', 'no_responsible', 'segregation_of_duties'] as const;
export type RaciWarning = (typeof RACI_WARNINGS)[number];

/** Warnings on a RACI matrix column. */
export const COLUMN_WARNINGS = ['no_members'] as const;

/** Warnings on a scope: an ISO 27001 scope while there is no SoA yet. */
export const SCOPE_WARNINGS = ['soa_missing'] as const;

/** Review intervals offered on the forms (months). */
export const REVIEW_INTERVALS = [6, 12, 24, 36] as const;

/** Records a SWOT / PESTEL factor can lead to (`POST …/follow-ups`). */
export const FOLLOW_UP_TYPES = ['risk', 'opportunity', 'objective', 'task', 'deviation'] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

// --- shared --------------------------------------------------------------------------

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface EntityRef {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly url: string | null;
  readonly status: string | null;
  readonly module: string | null;
  readonly label_key: string | null;
}

/** Fields every M01 record returns. */
export interface ContextRecordBase {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly entity_type: string;
  /** Portal path of the detail page, `/context/<segment>/<id>`. */
  readonly url: string;
  readonly owner: UserRef | null;
  readonly created_by: UserRef | null;
  readonly updated_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly can_edit: boolean;
}

/** Analyses, scopes and policies: the controlled (approval) lifecycle. */
export interface ControlledFields {
  readonly status: ControlledStatus;
  readonly version_no: number;
  readonly submitted_by: UserRef | null;
  readonly submitted_at: string | null;
  readonly approved_by: UserRef | null;
  /** Role names the approver holds in this organisation (HS 5.1). */
  readonly approver_roles?: readonly string[];
  readonly approved_at: string | null;
  readonly review_interval_months: number | null;
  readonly next_review_at: string | null;
  readonly last_reviewed_at: string | null;
  readonly review_overdue: boolean;
  readonly can_approve: boolean;
  /** U16: the controlled document the record is published as (Documents). */
  readonly document_id?: string | null;
}

export interface ListResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/** Query parameters every list accepts (plus per-type extras). */
export interface ContextListQuery {
  readonly q?: string;
  readonly status?: readonly string[];
  readonly owner?: string;
  readonly framework?: string;
  readonly review_due?: boolean;
  readonly sort?: string;
  readonly limit?: number;
  readonly offset?: number;
  /** Per-type filters (method, kind, category, party_type, addressed_status, influence, interest). */
  readonly extra?: Readonly<Record<string, string | undefined>>;
}

export const LIST_SORTS = [
  '-updated_at',
  'updated_at',
  'title',
  '-title',
  'code',
  '-code',
  'next_review_at',
] as const;

// --- analyses ------------------------------------------------------------------------

export interface AnalysisItem {
  readonly id?: string;
  readonly category: string;
  readonly text: string;
  readonly impact: Level;
  /** Read-only: the records created from (or answering) this factor. */
  readonly follow_ups?: readonly EntityRef[];
}

export interface FollowUpRequest {
  readonly entity_type: FollowUpType;
  readonly entity_id: string;
}

export interface ContextAnalysis extends ContextRecordBase, ControlledFields {
  readonly title: string;
  readonly method: AnalysisMethod;
  /** Legacy single standard (kept in sync by the API); `frameworks` is the truth. */
  readonly framework: string | null;
  /** The standards the analysis applies to; empty = the whole management system. */
  readonly frameworks?: readonly string[];
  readonly summary: string | null;
  readonly items: readonly AnalysisItem[];
  readonly counts: Readonly<Record<string, number>>;
  /** Weaknesses / threats (or high-impact PESTEL factors) without a follow-up. */
  readonly open_factors?: number;
}

export interface AnalysisCreate {
  readonly title: string;
  readonly method: AnalysisMethod;
  readonly framework?: string | null;
  readonly frameworks?: readonly string[];
  readonly summary?: string | null;
  readonly items?: readonly AnalysisItem[];
  readonly owner_user_id?: string | null;
  readonly review_interval_months?: number | null;
  readonly next_review_at?: string | null;
}

// --- interested parties --------------------------------------------------------------

export interface InterestedParty extends ContextRecordBase {
  readonly name: string;
  readonly category: PartyCategory;
  readonly party_type: PartyType;
  readonly description: string | null;
  readonly needs: string | null;
  readonly expectations: string | null;
  readonly requirements: string | null;
  readonly is_compliance_obligation: boolean;
  readonly addressed_status: AddressedStatus;
  readonly how_addressed: string | null;
  readonly influence: Level;
  readonly interest: Level;
  readonly priority: PartyPriority;
  readonly frameworks: readonly string[];
  readonly status: SimpleStatus;
  readonly next_review_at: string | null;
  readonly review_interval_months?: number | null;
  /** How the organisation monitors this party's requirements (HS 4.2). */
  readonly monitoring?: string | null;
  readonly review_overdue?: boolean;
}

export interface PartyListResponse extends ListResponse<InterestedParty> {
  readonly summary: Readonly<Record<string, number>>;
}

export interface PartyCreate {
  readonly name: string;
  readonly category: PartyCategory;
  readonly party_type: PartyType;
  readonly description?: string | null;
  readonly needs?: string | null;
  readonly expectations?: string | null;
  readonly requirements?: string | null;
  readonly is_compliance_obligation?: boolean;
  readonly addressed_status?: AddressedStatus;
  readonly how_addressed?: string | null;
  readonly influence?: Level;
  readonly interest?: Level;
  readonly frameworks?: readonly string[];
  readonly owner_user_id?: string | null;
  readonly next_review_at?: string | null;
  readonly review_interval_months?: number | null;
  readonly monitoring?: string | null;
}

// --- scope statements ----------------------------------------------------------------

/** An excluded requirement. `clause` is canonical (`iso9001:8.3`); `number` is for display. */
export interface ScopeExclusion {
  readonly clause: string;
  readonly number?: string | null;
  readonly justification: string;
}

export interface ScopeStatement extends ContextRecordBase, ControlledFields {
  readonly framework: string;
  readonly title: string;
  readonly statement: string | null;
  readonly boundaries: string | null;
  readonly products_services: string | null;
  readonly sites: readonly string[];
  readonly exclusions: readonly ScopeExclusion[];
  /** Processes inside the scope (HS 4.4). */
  readonly processes?: readonly EntityRef[];
  readonly warnings?: readonly string[];
}

export interface ScopeCreate {
  readonly framework: string;
  readonly title: string;
  readonly statement?: string | null;
  readonly boundaries?: string | null;
  readonly products_services?: string | null;
  readonly sites?: readonly string[];
  readonly exclusions?: readonly ScopeExclusion[];
  readonly process_ids?: readonly string[];
  readonly owner_user_id?: string | null;
  readonly review_interval_months?: number | null;
  readonly next_review_at?: string | null;
}

// --- policies ------------------------------------------------------------------------

/** Who has read and confirmed the current approved version (HS 5.2 / 7.3). */
export interface AcknowledgementSummary {
  readonly total: number;
  readonly acknowledged: number;
  readonly pending: number;
  readonly overdue: number;
  readonly percent: number;
}

export interface Policy extends ContextRecordBase, ControlledFields {
  readonly kind: PolicyKind;
  readonly title: string;
  readonly statement: string | null;
  readonly frameworks: readonly string[];
  readonly documents: readonly EntityRef[];
  readonly available_to_interested_parties?: boolean;
  /** Objectives set from this policy (HS 5.2 b -> 6.2). */
  readonly objectives?: readonly EntityRef[];
  readonly acknowledgements?: AcknowledgementSummary;
}

export interface PolicyCreate {
  readonly kind: PolicyKind;
  readonly title: string;
  readonly statement?: string | null;
  readonly frameworks?: readonly string[];
  readonly available_to_interested_parties?: boolean;
  readonly owner_user_id?: string | null;
  readonly review_interval_months?: number | null;
  readonly next_review_at?: string | null;
  /** Links the controlled document carrying the policy (create and edit). */
  readonly document_id?: string | null;
}

export interface AcknowledgementItem {
  readonly task_id: string;
  readonly user: UserRef | null;
  /** Task status: open | in_progress | done. */
  readonly status: string;
  readonly acknowledged: boolean;
  readonly due_at: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly overdue: boolean;
}

export interface Acknowledgements extends AcknowledgementSummary {
  readonly policy_id: string;
  readonly version_no: number;
  /** Approval of the current version; only tasks created since then count. */
  readonly since: string | null;
  readonly items: readonly AcknowledgementItem[];
}

export interface RemindResponse {
  readonly reminded: number;
}

export interface AssigneeIn {
  readonly type: AssigneeType;
  readonly value: string;
}

export interface CommunicateRequest {
  readonly assignee: AssigneeIn;
  readonly due_at?: string | null;
  readonly message?: string | null;
}

export interface CommunicateResponse {
  /** The first task created (null when everybody already had one). */
  readonly task_id: string | null;
  readonly task_ids?: readonly string[];
  readonly policy_id: string;
  /** One task per person (roles and departments are expanded). */
  readonly created?: number;
  /** People who already had a task for this version. */
  readonly skipped?: number;
}

// --- responsibilities (RACI) ---------------------------------------------------------

export interface RaciAssignmentIn {
  readonly type: AssigneeType;
  readonly value: string;
  readonly raci: Raci;
}

export interface RaciAssignment extends RaciAssignmentIn {
  readonly name: string | null;
}

export interface Responsibility extends ContextRecordBase {
  readonly title: string;
  readonly area: string | null;
  readonly description: string | null;
  readonly authorities: string | null;
  readonly frameworks: readonly string[];
  readonly assignments: readonly RaciAssignment[];
  readonly status: SimpleStatus;
  readonly next_review_at: string | null;
  readonly review_interval_months?: number | null;
  readonly review_overdue?: boolean;
  /** The process the duty belongs to (process register). */
  readonly process?: EntityRef | null;
  /** no_accountable | no_responsible | segregation_of_duties */
  readonly warnings: readonly string[];
}

export interface ResponsibilityCreate {
  readonly title: string;
  readonly area?: string | null;
  readonly process_id?: string | null;
  readonly review_interval_months?: number | null;
  readonly description?: string | null;
  readonly authorities?: string | null;
  readonly frameworks?: readonly string[];
  readonly assignments?: readonly RaciAssignmentIn[];
  readonly owner_user_id?: string | null;
  readonly next_review_at?: string | null;
}

export interface MatrixColumn {
  readonly type: AssigneeType;
  readonly value: string;
  readonly name: string | null;
  /** The people holding the role / in the department today (the person itself for a user). */
  readonly members?: readonly UserRef[];
  /** R / A / C / I -> rows. */
  readonly counts?: Readonly<Partial<Record<Raci, number>>>;
  /** `no_members`: a role or department nobody holds. */
  readonly warnings?: readonly string[];
}

export interface MatrixRow {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly area: string | null;
  /** `"<type>:<value>"` -> R | A | C | I. */
  readonly cells: Readonly<Record<string, Raci>>;
  readonly warnings: readonly string[];
  readonly url?: string | null;
}

export interface RaciMatrix {
  readonly columns: readonly MatrixColumn[];
  readonly rows: readonly MatrixRow[];
  /** Rows per warning (no_accountable, no_responsible, segregation_of_duties). */
  readonly warning_counts?: Readonly<Record<string, number>>;
}

// --- lifecycle -----------------------------------------------------------------------

export interface ApproveRequest {
  readonly comment?: string | null;
  readonly next_review_at?: string | null;
}

export interface ReturnRequest {
  readonly reason: string;
}

export interface ReviewRequest {
  readonly notes?: string | null;
  readonly next_review_at?: string | null;
}

export interface RetireRequest {
  readonly reason?: string | null;
}

export type LifecycleAction = 'submit' | 'approve' | 'return' | 'review' | 'retire';

// --- overview ------------------------------------------------------------------------

export const SETUP_STEP_KEYS = [
  'context_analysis',
  'interested_party',
  'scope_statement',
  'policy',
  'responsibility',
] as const;
export type SetupStepKey = (typeof SETUP_STEP_KEYS)[number];

export interface SetupStep {
  readonly key: string;
  readonly done: boolean;
  readonly count: number;
}

export interface ContextOverview {
  readonly analyses: Readonly<Record<string, number>>;
  readonly interested_parties: Readonly<Record<string, number>>;
  readonly scope_statements: Readonly<Record<string, number>>;
  readonly policies: Readonly<Record<string, number>>;
  readonly responsibilities: Readonly<Record<string, number>>;
  readonly frameworks_without_scope: readonly string[];
  readonly policy_kinds_missing: readonly string[];
  readonly reviews_overdue: number;
  readonly in_review: number;
  readonly parties_not_addressed?: number;
  readonly responsibilities_without_responsible?: number;
  readonly responsibilities_without_accountable?: number;
  readonly responsibilities_segregation?: number;
  readonly analyses_without_follow_up?: number;
  readonly policies_without_objectives?: number;
  readonly policies_not_communicated?: number;
  /** The beginner's "get started" order (analysis, parties, scope, policy, responsibilities). */
  readonly setup_steps?: readonly SetupStep[];
}

// --- AI assists ----------------------------------------------------------------------

export interface DraftAnalysisResult {
  readonly summary?: string;
  readonly items?: readonly { category: string; text: string; impact?: string }[];
}

export interface SuggestedParty {
  readonly name: string;
  readonly category?: string;
  readonly party_type?: string;
  readonly needs?: string;
  readonly expectations?: string;
  readonly influence?: string;
  readonly interest?: string;
}

export interface SuggestPartiesResult {
  readonly parties?: readonly SuggestedParty[];
}

// --- the five record kinds -----------------------------------------------------------

export type ContextKind = 'analysis' | 'party' | 'scope' | 'policy' | 'responsibility';

export type ContextRecord =
  | ContextAnalysis
  | InterestedParty
  | ScopeStatement
  | Policy
  | Responsibility;
