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
  readonly notes: string | null;
}

export interface EmployeeCreate extends EmployeeFields {
  readonly start_onboarding?: boolean;
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

export interface AwarenessRecord {
  readonly id: string;
  readonly employee_id: string;
  readonly topic: string;
  readonly kind: AwarenessKind;
  readonly completed_on: string;
  readonly notes: string | null;
  readonly created_by: Ref | null;
  readonly created_at: string;
}

export interface AwarenessIn {
  readonly topic: string;
  readonly kind: AwarenessKind;
  readonly completed_on: string;
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
}

export interface Checklist {
  readonly id: string;
  readonly org_id: string;
  readonly employee_id: string;
  readonly employee_code: string;
  readonly employee_name: string;
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
  readonly owner_user_id?: string;
  readonly assignee?: { readonly type: 'user' | 'role' | 'department'; readonly value: string };
  readonly items?: readonly ChecklistItemIn[];
}

export interface TemplateItem {
  readonly text: string;
  readonly category: ItemCategory;
  readonly required: boolean;
}

export interface ChecklistTemplates {
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
