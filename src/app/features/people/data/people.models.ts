/**
 * DTOs of the people API (M09, `v1/orgs/{org}/people/...`), mirroring the backend
 * schemas in `app/modules/people/schemas.py`. Dates are `YYYY-MM-DD`; timestamps
 * are naive UTC ISO strings.
 */

export const PERM_READ = 'people:read';
export const PERM_WRITE = 'people:write';
export const PERM_MANAGE = 'people:manage';
export const PERM_DISCIPLINARY = 'people:disciplinary';

export const EMPLOYMENT_TYPES = [
  'permanent',
  'temporary',
  'contractor',
  'intern',
  'other',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYEE_STATUSES = [
  'onboarding',
  'active',
  'on_leave',
  'offboarding',
  'former',
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const SCREENING_STATUSES = ['not_required', 'pending', 'completed', 'failed'] as const;
export type ScreeningStatus = (typeof SCREENING_STATUSES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RECORD_STATUSES = ['active', 'retired'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const COMPETENCE_CATEGORIES = [
  'skill',
  'knowledge',
  'qualification',
  'certificate',
  'language',
  'behaviour',
  'other',
] as const;
export type CompetenceCategory = (typeof COMPETENCE_CATEGORIES)[number];

export const CHECKLIST_KINDS = ['onboarding', 'offboarding'] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

/** System checklist items the backend ticks itself; nobody can tick, edit or delete them. */
export const SYSTEM_ITEM_KEYS = ['access_revoked'] as const;
export type SystemItemKey = (typeof SYSTEM_ITEM_KEYS)[number];

/**
 * What ticking a checklist item also records on the person (A11): the agreement
 * date, the background check, the post-employment acknowledgement, or that the
 * equipment came back (refused with `assets_outstanding` while assets are registered).
 */
export const ACTION_KEYS = [
  'confidentiality_signed',
  'security_terms_accepted',
  'screening_completed',
  'post_employment_ack',
  'equipment_returned',
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

/** What a background check covered (A.6.1; criminal records need a legal basis, GDPR Art. 10). */
export const SCREENING_SCOPES = [
  'identity',
  'references',
  'education',
  'criminal_record',
  'credit',
  'other',
] as const;
export type ScreeningScope = (typeof SCREENING_SCOPES)[number];

/** How a competence was assessed (HS 7.2 d). */
export const ASSESSMENT_METHODS = [
  'test',
  'observation',
  'certificate',
  'course',
  'interview',
  'self',
  'other',
] as const;
export type AssessmentMethod = (typeof ASSESSMENT_METHODS)[number];

/** Open issues of a current person; also the employee list filter `?flag=`. */
export const EMPLOYEE_FLAGS = [
  'missing_confidentiality',
  'missing_security_terms',
  'screening_missing',
  'screening_recheck_due',
  'competence_gaps',
  'expiring_soon',
  'no_user_account',
] as const;
export type EmployeeFlag = (typeof EMPLOYEE_FLAGS)[number];

/** Ways to close a competence gap (HS 7.2 c). */
export const GAP_ACTION_KINDS = ['training', 'task', 'assessment', 'other'] as const;
export type GapActionKind = (typeof GAP_ACTION_KINDS)[number];

export const GAP_ACTION_STATUSES = [
  'open',
  'done',
  'effective',
  'not_effective',
  'cancelled',
] as const;
export type GapActionStatus = (typeof GAP_ACTION_STATUSES)[number];

/** Template / checklist languages the backend ships. */
export type PeopleLang = 'en' | 'nb';

export const CHECKLIST_STATUSES = ['open', 'completed', 'cancelled'] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

export const ITEM_CATEGORIES = [
  'access',
  'equipment',
  'confidentiality',
  'training',
  'documentation',
  'other',
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const AWARENESS_KINDS = [
  'policy',
  'security_awareness',
  'briefing',
  'campaign',
  'induction',
  'other',
] as const;
export type AwarenessKind = (typeof AWARENESS_KINDS)[number];

export const DISCIPLINARY_TYPES = ['security_breach', 'conduct', 'performance', 'other'] as const;
export type DisciplinaryType = (typeof DISCIPLINARY_TYPES)[number];

export const DISCIPLINARY_STATUSES = ['open', 'closed'] as const;
export type DisciplinaryStatus = (typeof DISCIPLINARY_STATUSES)[number];

export const EMPLOYEE_SORTS = [
  'name',
  '-name',
  'code',
  '-code',
  'start_date',
  '-start_date',
  '-created_at',
] as const;
export type EmployeeSort = (typeof EMPLOYEE_SORTS)[number];

export const CELL_STATUSES = ['met', 'gap', 'missing', 'expired', 'not_required'] as const;
export type CellStatus = (typeof CELL_STATUSES)[number];

/** Gap statuses the `/gaps` filter accepts. */
export const GAP_STATUSES = ['gap', 'missing', 'expired'] as const;
export type GapStatus = (typeof GAP_STATUSES)[number];

/** Competence levels: 0 = none, 1 = basic ... 4 = expert (can teach others). */
export const COMPETENCE_LEVELS = [0, 1, 2, 3, 4] as const;
export const REQUIRED_LEVELS = [1, 2, 3, 4] as const;

export interface Ref {
  readonly id: string;
  readonly name: string | null;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

// --- summary ---------------------------------------------------------------------------

export interface PeopleSummary {
  readonly employees_by_status: Readonly<Record<EmployeeStatus, number>>;
  readonly positions: number;
  readonly competences: number;
  readonly open_checklists: number;
  readonly overdue_checklists: number;
  readonly gaps: number;
  readonly expiring_soon: number;
  readonly missing_confidentiality: number;
  // A11 tiles (each opens an employee list filter `?flag=` or a positions view).
  readonly missing_security_terms?: number;
  readonly screening_missing?: number;
  readonly screening_recheck_due?: number;
  readonly no_user_account?: number;
  readonly members_without_employee?: number;
  readonly positions_review_due?: number;
  readonly open_gap_actions?: number;
}

/** A reference to a document (the policy read, a job description). */
export interface DocumentRef {
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly type: string | null;
  readonly status: string | null;
  readonly url: string;
}

export interface SourceApplicationRef {
  readonly id: string;
  readonly requisition: { readonly id: string; readonly code: string };
  readonly url: string;
}

// --- employees -------------------------------------------------------------------------

export interface Employee {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly employee_number: string | null;
  readonly full_name: string;
  readonly user: Ref | null;
  readonly email: string | null;
  /** Null unless the caller holds `people:write` or is the employee. */
  readonly phone: string | null;
  readonly job_title: string | null;
  readonly position: Ref | null;
  readonly department: Ref | null;
  readonly manager: Ref | null;
  readonly employment_type: EmploymentType;
  readonly status: EmployeeStatus;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly location: string | null;
  readonly confidentiality_signed_on: string | null;
  readonly security_terms_accepted_on: string | null;
  readonly screening_status: ScreeningStatus;
  readonly screening_completed_on: string | null;
  /** Null unless the caller holds `people:write` or is the employee. */
  readonly notes: string | null;
  readonly gap_count: number;
  readonly open_checklists: number;
  /**
   * When access to this system was removed (memberships and sessions revoked), naive
   * UTC; null while the person still has access. Set by the daily job on the last
   * working day (`end_date`) or by `POST .../revoke-access`.
   */
  readonly access_revoked_at: string | null;
  /** Private details: [] / null unless the caller may see them. */
  readonly screening_scope?: readonly ScreeningScope[];
  readonly screening_legal_basis?: string | null;
  readonly screening_recheck_on?: string | null;
  /** The position's risk level requires a background check (A.6.1). */
  readonly screening_required?: boolean;
  readonly position_risk_level?: RiskLevel | null;
  /** When the person acknowledged their duties after leaving (A.6.5). */
  readonly post_employment_ack_on?: string | null;
  /** The recruitment application the person was hired through. */
  readonly source_application?: SourceApplicationRef | null;
  /** Held competences expiring within 60 days. */
  readonly expiring_count?: number;
  readonly flags?: readonly EmployeeFlag[];
  readonly open_onboarding_id?: string | null;
  readonly open_offboarding_id?: string | null;
  readonly url: string;
  readonly can_edit: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export type EmployeeList = Page<Employee>;

export interface EmployeeListQuery {
  readonly q?: string;
  readonly status?: readonly EmployeeStatus[];
  readonly position_id?: string;
  readonly department_id?: string;
  readonly manager_id?: string;
  readonly user_id?: string;
  readonly employment_type?: EmploymentType;
  readonly flag?: EmployeeFlag;
  readonly sort?: EmployeeSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface EmployeeFields {
  readonly full_name: string;
  readonly user_id: string | null;
  readonly employee_number: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly job_title: string | null;
  readonly position_id: string | null;
  readonly department_id: string | null;
  readonly manager_id: string | null;
  readonly employment_type: EmploymentType;
  readonly status: EmployeeStatus;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly location: string | null;
  readonly confidentiality_signed_on: string | null;
  readonly security_terms_accepted_on: string | null;
  readonly screening_status: ScreeningStatus;
  readonly screening_completed_on: string | null;
  readonly screening_scope: readonly ScreeningScope[];
  readonly screening_legal_basis: string | null;
  readonly screening_recheck_on: string | null;
  readonly post_employment_ack_on: string | null;
  readonly notes: string | null;
}

export interface EmployeeCreate extends EmployeeFields {
  readonly start_onboarding?: boolean;
  /** Language of the onboarding checklist. */
  readonly lang?: PeopleLang;
  readonly source_application_id?: string;
}

export type EmployeeUpdate = Partial<EmployeeFields> & { readonly change_reason?: string };

// --- held competences / matrix ---------------------------------------------------------

export interface HeldCompetence {
  readonly competence_id: string;
  readonly competence_name: string;
  readonly category: CompetenceCategory;
  readonly required_level: number | null;
  readonly mandatory: boolean;
  readonly level: number | null;
  readonly assessed_on: string | null;
  readonly assessed_by: Ref | null;
  readonly expires_on: string | null;
  readonly evidence_note: string | null;
  readonly status: CellStatus;
  readonly method?: AssessmentMethod | null;
  readonly training_record?: TrainingRecordRef | null;
  /** Actions on this gap that are not evaluated yet. */
  readonly actions?: readonly GapAction[];
}

export interface TrainingRecordRef {
  readonly id: string;
  readonly course_code: string | null;
  readonly completed_on: string | null;
  readonly url: string;
}

export interface CourseRef {
  readonly id: string | null;
  readonly code: string | null;
  readonly title: string | null;
}

/** An action planned on a competence gap: training, a task or a re-assessment (HS 7.2 c). */
export interface GapAction {
  readonly id: string;
  readonly employee_id: string;
  readonly employee_code: string;
  readonly employee_name: string;
  readonly competence_id: string;
  readonly kind: GapActionKind;
  readonly description: string | null;
  readonly status: GapActionStatus;
  readonly due_date: string | null;
  readonly owner: Ref | null;
  readonly task: {
    readonly id: string;
    readonly status: string;
    readonly due_at: string | null;
    readonly title: string | null;
    readonly url: string;
  } | null;
  readonly training_assignment: {
    readonly id: string;
    readonly status: string;
    readonly due_at: string | null;
    readonly completed_at: string | null;
    readonly course: CourseRef;
    readonly url: string;
  } | null;
  readonly evaluated_on: string | null;
  readonly evaluated_by: Ref | null;
  readonly evaluation_note: string | null;
  readonly result_level: number | null;
  readonly url: string;
  readonly created_by: Ref | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface GapActionCreate {
  readonly employee_id: string;
  readonly competence_id: string;
  readonly kind: GapActionKind;
  readonly description?: string | null;
  readonly due_date?: string | null;
  readonly owner_user_id?: string | null;
  readonly course_id?: string | null;
  readonly assignee_user_id?: string | null;
}

export interface GapActionUpdate {
  readonly description?: string | null;
  readonly due_date?: string | null;
  readonly status?: GapActionStatus;
  readonly evaluated_on?: string | null;
  readonly evaluation_note?: string | null;
}

/** A published course offered for a "training" gap action. */
export interface CourseOption {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
}

export interface EmployeeCompetences {
  readonly employee_id: string;
  readonly position_id: string | null;
  readonly items: readonly HeldCompetence[];
  readonly gap_count: number;
}

export interface CompetenceAssessment {
  readonly level: number;
  readonly assessed_on?: string | null;
  readonly expires_on?: string | null;
  readonly evidence_note?: string | null;
  readonly method?: AssessmentMethod | null;
  /** A member of the org; the backend defaults to the caller. */
  readonly assessed_by_user_id?: string | null;
  /** One of the same person's training records. */
  readonly training_record_id?: string | null;
}

export interface MatrixCompetence {
  readonly id: string;
  readonly name: string;
  readonly category: CompetenceCategory;
}

export interface MatrixCell {
  readonly competence_id: string;
  readonly required_level: number | null;
  readonly mandatory: boolean;
  readonly level: number | null;
  readonly expires_on: string | null;
  readonly status: CellStatus;
}

export interface MatrixRow {
  readonly employee_id: string;
  readonly code: string;
  readonly full_name: string;
  readonly position: Ref | null;
  readonly department: Ref | null;
  readonly cells: readonly MatrixCell[];
  readonly gap_count: number;
}

export interface Matrix {
  readonly competences: readonly MatrixCompetence[];
  readonly rows: readonly MatrixRow[];
}

export interface MatrixQuery {
  readonly department_id?: string;
  readonly position_id?: string;
  readonly competence_ids?: readonly string[];
  readonly include_former?: boolean;
}

export interface Gap {
  readonly employee_id: string;
  readonly employee_code: string;
  readonly employee_name: string;
  readonly position: Ref | null;
  readonly department: Ref | null;
  readonly competence_id: string;
  readonly competence_name: string;
  readonly required_level: number;
  readonly mandatory: boolean;
  readonly level: number | null;
  readonly expires_on: string | null;
  readonly status: CellStatus;
  readonly actions?: readonly GapAction[];
}

export interface GapQuery {
  readonly department_id?: string;
  readonly position_id?: string;
  readonly employee_id?: string;
  readonly competence_ids?: readonly string[];
  readonly status?: readonly GapStatus[];
  readonly mandatory_only?: boolean;
}

// --- awareness / disciplinary ----------------------------------------------------------

/** Where an awareness row comes from; only `manual` rows can be edited here. */
export type AwarenessSource = 'manual' | 'document_ack' | 'training';

export interface AwarenessRecord {
  readonly id: string;
  readonly employee_id: string;
  readonly topic: string;
  /** An awareness kind, or `training` for a completed course pulled in from Training. */
  readonly kind: AwarenessKind | 'training';
  readonly completed_on: string | null;
  readonly notes: string | null;
  readonly document?: DocumentRef | null;
  readonly revision?: { readonly id: string; readonly rev: string } | null;
  readonly source?: AwarenessSource;
  readonly editable?: boolean;
  readonly url?: string | null;
  readonly created_by: Ref | null;
  readonly created_at: string | null;
}

export interface AwarenessIn {
  /** Optional with a document (its title is used). */
  readonly topic?: string | null;
  readonly kind?: AwarenessKind | null;
  readonly completed_on: string;
  readonly document_id?: string | null;
  readonly revision_id?: string | null;
  readonly notes?: string | null;
}

export interface DisciplinaryCase {
  readonly id: string;
  readonly employee_id: string;
  readonly case_type: DisciplinaryType;
  readonly status: DisciplinaryStatus;
  readonly opened_on: string;
  readonly closed_on: string | null;
  readonly summary: string | null;
  readonly outcome: string | null;
  readonly created_by: Ref | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface DisciplinaryIn {
  readonly case_type: DisciplinaryType;
  readonly opened_on: string;
  readonly summary?: string | null;
}

export interface DisciplinaryUpdate {
  readonly case_type?: DisciplinaryType;
  readonly status?: DisciplinaryStatus;
  readonly opened_on?: string;
  readonly closed_on?: string | null;
  readonly summary?: string | null;
  readonly outcome?: string | null;
}

// --- checklists ------------------------------------------------------------------------

export interface ChecklistItem {
  readonly id: string;
  readonly position: number;
  readonly category: ItemCategory;
  readonly text: string;
  readonly required: boolean;
  readonly done: boolean;
  readonly done_by: Ref | null;
  readonly done_at: string | null;
  readonly note: string | null;
  /** Set on items the system ticks itself; only `note` may be changed by hand. */
  readonly system_key: SystemItemKey | null;
  /** Ticking it also records the fact on the person. */
  readonly action_key?: ActionKey | null;
}

export interface Checklist {
  readonly id: string;
  readonly org_id: string;
  readonly employee_id: string;
  readonly employee_code: string;
  readonly employee_name: string;
  readonly employee_url?: string | null;
  readonly kind: ChecklistKind;
  readonly title: string;
  readonly status: ChecklistStatus;
  readonly due_date: string | null;
  readonly owner: Ref | null;
  readonly task_id: string | null;
  readonly items_total: number;
  readonly items_done: number;
  readonly required_open: number;
  readonly completed_at: string | null;
  readonly completed_by: Ref | null;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ChecklistDetail extends Checklist {
  readonly items: readonly ChecklistItem[];
}

export interface ChecklistQuery {
  readonly employee_id?: string;
  readonly kind?: ChecklistKind;
  readonly status?: readonly ChecklistStatus[];
  readonly limit?: number;
  readonly offset?: number;
}

export interface ChecklistItemIn {
  readonly text: string;
  readonly category: ItemCategory;
  readonly required: boolean;
  readonly action_key?: ActionKey | null;
}

export interface ChecklistItemUpdate {
  readonly text?: string;
  readonly category?: ItemCategory;
  readonly required?: boolean;
  readonly done?: boolean;
  readonly note?: string | null;
}

export interface ChecklistCreate {
  readonly kind: ChecklistKind;
  readonly title?: string;
  readonly due_date?: string;
  /**
   * The last working day (YYYY-MM-DD). Required for offboarding unless the employee
   * already has an `end_date`; access is revoked automatically on that day.
   */
  readonly end_date?: string;
  readonly owner_user_id?: string;
  readonly assignee?: { readonly type: 'user' | 'role' | 'department'; readonly value: string };
  readonly items?: readonly ChecklistItemIn[];
  readonly lang?: PeopleLang;
}

export interface TemplateItem {
  readonly text: string;
  readonly category: ItemCategory;
  readonly required: boolean;
  readonly system_key: SystemItemKey | null;
  readonly action_key?: ActionKey | null;
}

export interface ChecklistTemplates {
  readonly lang?: PeopleLang;
  /** Whether the organisation replaced the built-in template of each kind. */
  readonly custom?: { readonly onboarding: boolean; readonly offboarding: boolean };
  readonly onboarding: readonly TemplateItem[];
  readonly offboarding: readonly TemplateItem[];
}

// --- positions -------------------------------------------------------------------------

export interface Position {
  readonly id: string;
  readonly org_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly description: string | null;
  readonly responsibilities: string | null;
  readonly authorities: string | null;
  readonly department: Ref | null;
  readonly reports_to: Ref | null;
  readonly risk_level: RiskLevel;
  readonly status: RecordStatus;
  readonly owner: Ref | null;
  readonly employee_count: number;
  readonly requirement_count: number;
  /** The role's security risk requires a background check (A.6.1). */
  readonly screening_required?: boolean;
  readonly next_review_on?: string | null;
  readonly last_reviewed_on?: string | null;
  readonly review_due?: boolean;
  readonly job_description?: DocumentRef | null;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Requirement {
  readonly competence_id: string;
  readonly competence_name: string;
  readonly category: CompetenceCategory;
  readonly required_level: number;
  readonly mandatory: boolean;
  readonly note: string | null;
}

export interface PositionDetail extends Position {
  readonly requirements: readonly Requirement[];
}

export interface PositionQuery {
  readonly q?: string;
  readonly status?: RecordStatus;
  readonly department_id?: string;
  readonly risk_level?: RiskLevel;
  readonly limit?: number;
  readonly offset?: number;
}

export interface PositionFields {
  readonly title: string;
  readonly code: string | null;
  readonly description: string | null;
  readonly responsibilities: string | null;
  readonly authorities: string | null;
  readonly department_id: string | null;
  readonly reports_to_id: string | null;
  readonly risk_level: RiskLevel;
  readonly owner_user_id: string | null;
  /** Default on create: 12 months from today. */
  readonly next_review_on?: string | null;
  readonly job_description_document_id?: string | null;
}

export type PositionUpdate = Partial<PositionFields> & {
  readonly status?: RecordStatus;
  readonly change_reason?: string;
};

export interface RequirementIn {
  readonly competence_id: string;
  readonly required_level: number;
  readonly mandatory: boolean;
  readonly note?: string | null;
}

// --- competences -----------------------------------------------------------------------

export interface Competence {
  readonly id: string;
  readonly org_id: string;
  readonly name: string;
  readonly category: CompetenceCategory;
  readonly description: string | null;
  readonly validity_months: number | null;
  readonly status: RecordStatus;
  readonly position_count: number;
  readonly holder_count: number;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CompetenceQuery {
  readonly q?: string;
  readonly category?: CompetenceCategory;
  readonly status?: RecordStatus;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CompetenceFields {
  readonly name: string;
  readonly category: CompetenceCategory;
  readonly description: string | null;
  readonly validity_months: number | null;
}

export type CompetenceUpdate = Partial<CompetenceFields> & {
  readonly status?: RecordStatus;
  readonly change_reason?: string;
};

// --- AI assists ------------------------------------------------------------------------

/** One suggestion of `people.suggest_competences`. */
export interface SuggestedCompetence {
  readonly name: string;
  readonly category: CompetenceCategory;
  readonly required_level: number;
  readonly mandatory: boolean;
  readonly rationale: string;
  readonly existing_competence_id: string | null;
}

export interface CompetenceSuggestions {
  readonly competences: readonly SuggestedCompetence[];
}

// --- A11: connected views of one person ------------------------------------------------

/** The people controls evidenced per person. Leavers also get the last three. */
export const COMPLIANCE_KEYS = [
  'confidentiality',
  'security_terms',
  'screening',
  'competence',
  'awareness',
  'post_employment',
  'access_revoked',
  'equipment_returned',
] as const;
export type ComplianceKey = (typeof COMPLIANCE_KEYS)[number];

export type ComplianceStatus = 'ok' | 'missing' | 'due' | 'pending' | 'not_required';

export interface ComplianceItem {
  readonly key: ComplianceKey | string;
  /** Canonical clause refs the control evidences, e.g. `iso27001:A.6.6`. */
  readonly clause_refs: readonly string[];
  readonly status: ComplianceStatus;
  readonly done_on?: string | null;
  readonly recheck_on?: string | null;
  readonly required?: boolean | null;
  readonly gaps?: number | null;
  readonly expiring?: number | null;
  readonly outstanding?: number | null;
}

export interface EmployeeCompliance {
  readonly employee_id: string;
  readonly items: readonly ComplianceItem[];
  /** Controls not in order (missing / due / pending). */
  readonly open: number;
}

export interface TrainingAssignmentRow {
  readonly id: string;
  readonly course: CourseRef;
  readonly status: string;
  readonly due_at: string | null;
  readonly completed_at: string | null;
  readonly overdue: boolean;
  readonly url: string;
}

export interface TrainingRecordRow {
  readonly id: string;
  readonly course: CourseRef;
  readonly completed_at: string;
  readonly expires_at: string | null;
  readonly passed: boolean;
  readonly method: string | null;
  readonly url: string;
}

export interface EmployeeTraining {
  /** False: the person has no user account (training is assigned to users). */
  readonly linked: boolean;
  /** False: the caller may not see other people's training. */
  readonly visible: boolean;
  readonly assignments: readonly TrainingAssignmentRow[];
  readonly records: readonly TrainingRecordRow[];
}

export interface HandoverAsset {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly asset_type: string;
  readonly status: string;
  readonly url: string;
}

export interface HandoverAccess {
  readonly id: string;
  readonly review: { readonly id: string; readonly code: string; readonly title: string };
  readonly system: string | null;
  readonly account: string | null;
  readonly access_level: string | null;
  readonly decision: string;
  readonly removed: boolean;
  readonly url: string;
}

/** What to recover and remove when the person leaves (A.5.11, A.5.18). */
export interface EmployeeHandover {
  readonly linked: boolean;
  readonly user_active: boolean | null;
  readonly access_revoked_at: string | null;
  readonly assets: readonly HandoverAsset[];
  readonly access: readonly HandoverAccess[];
}

/** The printable competence record of one person ("kompetansebevis"). */
export interface CompetenceRecord {
  readonly generated_at: string;
  readonly employee: Employee;
  readonly position: PositionDetail | null;
  readonly competences: EmployeeCompetences;
  readonly actions: readonly GapAction[];
  readonly awareness: readonly AwarenessRecord[];
  readonly training: {
    readonly assignments?: readonly TrainingAssignmentRow[];
    readonly records?: readonly TrainingRecordRow[];
  } | null;
  readonly compliance: EmployeeCompliance;
}

export interface MemberRef {
  readonly id: string;
  readonly name: string | null;
  readonly email: string;
}

export interface UserMatch {
  readonly employee_id: string;
  readonly employee_code: string;
  readonly employee_name: string;
  readonly user: MemberRef;
  readonly reason: 'email' | 'name';
}

export interface MemberWithoutEmployee extends MemberRef {
  /** Also proposed as the match of an existing person. */
  readonly suggested: boolean;
}

export interface UserMatches {
  readonly suggestions: readonly UserMatch[];
  readonly members_without_employee: readonly MemberWithoutEmployee[];
}

export interface ImportUsersIn {
  readonly user_ids: readonly string[];
  readonly status: 'active' | 'onboarding';
  /** U26: e.g. `contractor` for consultants and auditors (default `permanent`). */
  readonly employment_type?: EmploymentType;
}

export interface OrgChartNode {
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
  readonly risk_level: RiskLevel;
  readonly reports_to_id: string | null;
  readonly holders: readonly { readonly id: string; readonly name: string; readonly url: string }[];
  readonly url: string;
}

export interface OrgChart {
  readonly nodes: readonly OrgChartNode[];
}

export interface PositionReviewIn {
  readonly next_review_on?: string | null;
  readonly note?: string | null;
}
