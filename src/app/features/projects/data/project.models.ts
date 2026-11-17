/**
 * DTOs of the M14 projects API (`v1/orgs/{org}/projects/...`), mirroring
 * `app/modules/projects/schemas.py` in coreflow-core. Plan dates are calendar
 * dates (`YYYY-MM-DD`); timestamps are naive UTC ISO strings.
 */

export const PERM_READ = 'projects:read';
export const PERM_WRITE = 'projects:write';
export const PERM_MANAGE = 'projects:manage';

export const PROJECT_STATUSES = [
  'proposed',
  'planned',
  'active',
  'on_hold',
  'completed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const OPEN_PROJECT_STATUSES = ['proposed', 'planned', 'active', 'on_hold'] as const;
export type OpenProjectStatus = (typeof OPEN_PROJECT_STATUSES)[number];

export const CLOSE_OUTCOMES = ['completed', 'cancelled'] as const;
export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number];

export const PROJECT_KINDS = [
  'general',
  'design_development',
  'improvement',
  'implementation',
  'other',
] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export const PROJECT_HEALTHS = ['green', 'amber', 'red'] as const;
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number];

export const MEMBER_ROLES = ['manager', 'member', 'reviewer', 'stakeholder'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MILESTONE_KINDS = ['phase', 'milestone'] as const;
export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export const MILESTONE_STATUSES = ['planned', 'in_progress', 'done', 'cancelled'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const REVIEW_KINDS = ['review', 'verification', 'validation', 'change'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const REVIEW_OUTCOMES = ['pending', 'passed', 'passed_with_actions', 'failed'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export const LESSON_CATEGORIES = ['went_well', 'improve', 'risk', 'other'] as const;
export type LessonCategory = (typeof LESSON_CATEGORIES)[number];

export const PROJECT_SORTS = [
  '-updated_at',
  'updated_at',
  'code',
  '-code',
  'title',
  '-title',
  'due_date',
  '-due_date',
] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

export const OBJECTIVE_MET = ['yes', 'partial', 'no'] as const;
export type ObjectiveMet = (typeof OBJECTIVE_MET)[number];

/** What `progress.percent` is based on. */
export type PercentBasis = 'completed' | 'milestones' | 'tasks' | 'none';

/** Link types a new project may be linked to records with (`ProjectCreate.related`). */
export type RelatedLinkType =
  | 'relates_to'
  | 'implements'
  | 'derived_from'
  | 'evidence_for'
  | 'mitigates';

export const SECURITY_CHECKS = [
  'risk_assessment',
  'dpia',
  'supplier_security',
  'security_test',
] as const;
export type SecurityCheckKey = (typeof SECURITY_CHECKS)[number];

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export interface UserRef {
  readonly id: string;
  readonly name: string;
}

/** A linked record (kit `EntityRefDto` shape). */
export interface EntityRef {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code?: string | null;
  readonly url?: string | null;
  readonly status?: string | null;
  readonly module?: string | null;
  readonly label_key?: string | null;
}

// --- projects --------------------------------------------------------------------------

export interface Project {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly objective: string | null;
  readonly scope: string | null;
  readonly kind: ProjectKind;
  readonly status: ProjectStatus;
  readonly priority: ProjectPriority;
  readonly health: ProjectHealth | null;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly start_date: string | null;
  readonly due_date: string | null;
  readonly security_relevant: boolean;
  readonly security_requirements: string | null;
  readonly closed_at: string | null;
  readonly closed_by: UserRef | null;
  readonly closeout_summary: string | null;
  /** ISO 9001 6.3 b/c: possible consequences of the change, and the resources it needs. */
  readonly change_consequences?: string | null;
  readonly change_resources?: string | null;
  /** Close-out: was the objective met, the evidence, and who approved it. */
  readonly objective_met?: ObjectiveMet | null;
  readonly objective_evidence?: string | null;
  readonly closeout_approved_by?: UserRef | null;
  readonly closeout_approved_at?: string | null;
  readonly is_overdue: boolean;
  readonly member_count: number;
  /** Same rule as `progress.percent`. */
  readonly progress_percent?: number;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface ProjectList {
  readonly items: readonly Project[];
  readonly total: number;
}

export interface ProjectProgress {
  readonly milestones_total: number;
  readonly milestones_done: number;
  readonly milestones_overdue: number;
  readonly tasks_total: number;
  readonly tasks_open: number;
  readonly tasks_done: number;
  readonly tasks_overdue: number;
  readonly design_reviews_total: number;
  readonly design_reviews_pending: number;
  /** Tasks raised from design-review findings. */
  readonly review_actions_total?: number;
  readonly review_actions_open?: number;
  readonly percent: number;
  readonly percent_basis?: PercentBasis;
}

/** Portfolio summary (`GET projects/overview`). */
export interface ProjectOverview {
  readonly total: number;
  readonly open: number;
  readonly closed: number;
  readonly active: number;
  readonly at_risk: number;
  readonly overdue: number;
  readonly reviews_pending: number;
  readonly milestones_overdue: number;
  readonly by_status: Readonly<Record<string, number>>;
  readonly by_health: Readonly<Record<string, number>>;
  readonly by_kind: Readonly<Record<string, number>>;
}

/** One ISO/IEC 27001 A.5.8 check of a security-relevant project. */
export interface SecurityCheck {
  readonly key: SecurityCheckKey;
  readonly done: boolean;
  readonly count: number;
  readonly items: readonly EntityRef[];
}

export interface ProjectMember {
  readonly user_id: string;
  readonly name: string;
  readonly role: MemberRole;
  readonly is_owner: boolean;
  readonly added_at: string;
}

export interface ProjectDetail extends Project {
  readonly members: readonly ProjectMember[];
  readonly progress: ProjectProgress;
  /** What blocks closing as completed (all zero = it can be completed). */
  readonly open_items?: OpenItemsDetail;
  /** Only for security-relevant projects. */
  readonly security_checklist?: readonly SecurityCheck[];
  /** Documents linked as design outputs (`derived_from`, ISO 9001 8.3.5). */
  readonly design_outputs?: readonly EntityRef[];
  readonly can_edit: boolean;
  readonly can_contribute: boolean;
  readonly can_manage: boolean;
  readonly can_delete: boolean;
}

export interface ProjectListQuery {
  readonly q?: string;
  readonly status?: readonly ProjectStatus[];
  /** `me` or a user id. */
  readonly owner?: string;
  /** `me` or a user id. */
  readonly member?: string;
  readonly kind?: ProjectKind;
  readonly department_id?: string;
  readonly overdue?: boolean;
  readonly sort?: ProjectSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface MemberIn {
  readonly user_id: string;
  readonly role: MemberRole;
}

export interface ProjectCreate {
  readonly title: string;
  readonly description?: string | null;
  readonly objective?: string | null;
  readonly scope?: string | null;
  readonly kind?: ProjectKind;
  readonly status?: OpenProjectStatus;
  readonly priority?: ProjectPriority;
  readonly health?: ProjectHealth | null;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly start_date?: string | null;
  readonly due_date?: string | null;
  readonly security_relevant?: boolean;
  readonly security_requirements?: string | null;
  readonly change_consequences?: string | null;
  readonly change_resources?: string | null;
  readonly members?: readonly MemberIn[];
  /** Records the new project is linked to (affected processes, documents, objectives). */
  readonly related?: readonly RelatedIn[];
}

export interface RelatedIn {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly link_type?: RelatedLinkType;
}

export type ProjectUpdate = Partial<Omit<ProjectCreate, 'members' | 'related'>> & {
  readonly change_reason?: string | null;
};

export interface LessonIn {
  readonly category?: LessonCategory;
  readonly title: string;
  readonly description?: string | null;
  readonly recommendation?: string | null;
}

export type LessonUpdate = Partial<LessonIn>;

export interface ProjectCloseBody {
  readonly outcome: CloseOutcome;
  readonly closeout_summary?: string | null;
  readonly lessons?: readonly LessonIn[];
  readonly objective_met?: ObjectiveMet | null;
  readonly objective_evidence?: string | null;
  readonly approver_user_id?: string | null;
}

export interface ProjectReopenBody {
  readonly reason?: string | null;
  readonly status?: OpenProjectStatus;
}

// --- phases and milestones -------------------------------------------------------------

export interface Milestone {
  readonly id: string;
  readonly project_id: string;
  readonly phase_id: string | null;
  readonly kind: MilestoneKind;
  readonly title: string;
  readonly description: string | null;
  readonly status: MilestoneStatus;
  readonly position: number;
  readonly start_date: string | null;
  readonly due_date: string | null;
  readonly owner: UserRef | null;
  readonly completed_at: string | null;
  readonly is_overdue: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface MilestoneCreate {
  readonly kind?: MilestoneKind;
  readonly title: string;
  readonly description?: string | null;
  readonly phase_id?: string | null;
  readonly status?: MilestoneStatus;
  readonly position?: number | null;
  readonly start_date?: string | null;
  readonly due_date?: string | null;
  readonly owner_user_id?: string | null;
}

export type MilestoneUpdate = Partial<Omit<MilestoneCreate, 'kind'>>;

// --- design reviews --------------------------------------------------------------------

export interface DesignReview {
  readonly id: string;
  readonly project_id: string;
  readonly milestone_id: string | null;
  readonly kind: ReviewKind;
  readonly title: string;
  readonly stage: string | null;
  readonly planned_date: string | null;
  readonly held_on: string | null;
  readonly participants: readonly UserRef[];
  readonly inputs: string | null;
  readonly findings: string | null;
  /** Controlled documents reviewed, pinned to the revision that was reviewed. */
  readonly input_documents?: readonly InputDocument[];
  readonly outcome: ReviewOutcome;
  readonly decided_by: UserRef | null;
  readonly decided_at: string | null;
  /** The phase the review belongs to (derived from its milestone). */
  readonly phase?: { readonly id: string; readonly title: string } | null;
  readonly milestone_title?: string | null;
  /** Follow-up tasks raised from the findings (review actions). */
  readonly actions?: { readonly total: number; readonly open: number; readonly overdue: number };
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface DesignReviewCreate {
  readonly kind?: ReviewKind;
  readonly title: string;
  readonly stage?: string | null;
  readonly milestone_id?: string | null;
  readonly planned_date?: string | null;
  readonly held_on?: string | null;
  readonly participant_ids?: readonly string[];
  readonly inputs?: string | null;
  readonly findings?: string | null;
  readonly input_documents?: readonly InputDocumentIn[];
  readonly outcome?: ReviewOutcome;
}

export interface InputDocumentIn {
  readonly document_id: string;
  /** Omitted = the document's current approved revision. */
  readonly revision?: string | null;
}

export interface InputDocument {
  readonly document_id: string;
  readonly revision: string | null;
  /** Null when the caller cannot read the document. */
  readonly document: EntityRef | null;
  readonly current_revision: string | null;
  /** A newer approved revision exists than the one reviewed. */
  readonly outdated: boolean;
}

export type DesignReviewUpdate = Partial<DesignReviewCreate> & {
  readonly change_reason?: string | null;
};

// --- lessons ---------------------------------------------------------------------------

export interface Lesson {
  readonly id: string;
  readonly project_id: string;
  readonly category: LessonCategory;
  readonly title: string;
  readonly description: string | null;
  readonly recommendation: string | null;
  /** The records the lesson became (improvement task, risk, …). */
  readonly follow_ups?: readonly EntityRef[];
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
}

// --- plan and summary ------------------------------------------------------------------

export type PlanItemKind = 'phase' | 'milestone' | 'task';

export interface PlanItem {
  readonly kind: PlanItemKind;
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly start: string | null;
  readonly end: string | null;
  /** Phase id for milestones, milestone id for tasks (null when directly on the project). */
  readonly parent_id: string | null;
  readonly owner: UserRef | null;
  readonly is_overdue: boolean;
  readonly url: string;
}

export interface ProjectPlan {
  readonly project_id: string;
  readonly start: string | null;
  readonly end: string | null;
  readonly items: readonly PlanItem[];
}

export interface ProjectSummary {
  readonly project_id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ProjectStatus;
  readonly health: ProjectHealth | null;
  readonly progress: ProjectProgress;
  readonly next_milestone: Milestone | null;
  readonly overdue_milestones: readonly Milestone[];
  readonly open_design_reviews: readonly DesignReview[];
  readonly days_to_due: number | null;
  readonly facts: Readonly<Record<string, unknown>>;
}

/** `projects.risk_prompts` assist result. */
export interface RiskPrompt {
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly likelihood: RiskLevel;
  readonly impact: RiskLevel;
  readonly mitigation: string;
}

export interface RiskPrompts {
  readonly risks: readonly RiskPrompt[];
}

/** `409 project_has_open_items` detail. */
export interface OpenItemsDetail {
  readonly open_milestones: number;
  readonly pending_design_reviews: number;
  readonly open_tasks: number;
  /** Open tasks from design-review findings (included in `open_tasks`). */
  readonly open_review_actions?: number;
}

export function isClosedStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'cancelled';
}

export function isOpenProjectStatus(value: string): value is OpenProjectStatus {
  return (OPEN_PROJECT_STATUSES as readonly string[]).includes(value);
}

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
