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

export const REVIEW_KINDS = ['review', 'verification', 'validation'] as const;
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

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export interface UserRef {
  readonly id: string;
  readonly name: string;
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
  readonly is_overdue: boolean;
  readonly member_count: number;
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
  readonly percent: number;
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
  readonly members?: readonly MemberIn[];
}

export type ProjectUpdate = Partial<Omit<ProjectCreate, 'members'>> & {
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
  readonly outcome: ReviewOutcome;
  readonly decided_by: UserRef | null;
  readonly decided_at: string | null;
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
  readonly outcome?: ReviewOutcome;
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
