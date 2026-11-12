/**
 * Training (M11) DTOs, mirroring coreflow-core `app/modules/training/schemas.py`.
 * All endpoints live under `/api/v1/orgs/{org_id}/training`. Datetimes are naive
 * UTC ISO strings.
 */

export const COURSE_CATEGORIES = [
  'general',
  'onboarding',
  'quality',
  'information_security',
  'privacy',
  'ai_literacy',
  'hse',
  'environment',
  'compliance',
  'other',
] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const COURSE_KINDS = ['course', 'read_and_understood', 'external'] as const;
export type CourseKind = (typeof COURSE_KINDS)[number];

export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export type CourseSource = 'manual' | 'ai';
export type CourseSort = 'title' | 'code' | '-updated_at' | '-created_at';

export const RULE_TARGETS = ['all', 'role', 'department', 'user', 'new_hire'] as const;
export type RuleTarget = (typeof RULE_TARGETS)[number];

export const ASSIGNMENT_STATUSES = ['assigned', 'in_progress', 'completed', 'cancelled'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_REASONS = ['manual', 'rule', 'new_hire', 'retraining'] as const;
export type AssignmentReason = (typeof ASSIGNMENT_REASONS)[number];
export type AssignmentSort = 'due_at' | '-due_at' | '-created_at' | '-completed_at';

export const RECORD_METHODS = ['course', 'read_ack', 'manual', 'external'] as const;
export type RecordMethod = (typeof RECORD_METHODS)[number];
export type ManualMethod = 'manual' | 'external';
export type RecordSort = '-completed_at' | 'completed_at' | 'expires_at';

export const EFFECTIVENESS = ['effective', 'partially_effective', 'not_effective'] as const;
export type Effectiveness = (typeof EFFECTIVENESS)[number];

export const CELL_STATUSES = [
  'compliant',
  'expiring',
  'expired',
  'assigned',
  'overdue',
  'missing',
] as const;
export type CellStatus = (typeof CELL_STATUSES)[number];

export interface UserBrief {
  readonly id: string;
  readonly name: string;
}

export interface CourseBrief {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly kind: string;
  readonly status: string;
  readonly url: string;
}

export interface DocumentBrief {
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
  readonly url: string;
  readonly rev?: string | null;
}

export interface QuizQuestionDto {
  readonly question: string;
  readonly options: readonly string[];
  /** Index into `options`. */
  readonly answer: number;
  readonly explanation?: string | null;
}

export interface LessonIn {
  readonly id?: string;
  readonly title: string;
  readonly body: string;
  readonly video_url?: string | null;
  readonly document_id?: string | null;
  readonly minutes?: number | null;
  readonly quiz: readonly QuizQuestionDto[];
}

export interface LessonOut {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly body: string;
  readonly video_url: string | null;
  readonly document_id: string | null;
  readonly minutes: number | null;
  readonly quiz: readonly QuizQuestionDto[];
}

export interface Course {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: CourseCategory;
  readonly kind: CourseKind;
  readonly status: CourseStatus;
  readonly owner: UserBrief | null;
  /** Fraction of correct answers needed to pass (0-1). */
  readonly pass_mark: number;
  readonly validity_months: number | null;
  readonly estimated_minutes: number | null;
  readonly document_id: string | null;
  readonly source: CourseSource;
  readonly version: number;
  readonly published_at: string | null;
  readonly lesson_count: number;
  readonly quiz_count: number;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
  readonly can_edit: boolean;
}

export interface CourseCounts {
  readonly assigned: number;
  readonly overdue: number;
  readonly completed: number;
}

export interface CourseDetail extends Course {
  readonly lessons: readonly LessonOut[];
  readonly document: DocumentBrief | null;
  readonly rule_count: number;
  readonly counts: CourseCounts;
}

export interface CourseList {
  readonly items: readonly Course[];
  readonly total: number;
}

export interface CourseQuery {
  readonly q?: string;
  readonly status?: readonly CourseStatus[];
  readonly category?: CourseCategory | '';
  readonly kind?: CourseKind | '';
  readonly owner?: string;
  readonly sort?: CourseSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CourseCreate {
  readonly title: string;
  readonly description?: string | null;
  readonly category?: CourseCategory;
  readonly kind?: CourseKind;
  readonly owner_user_id?: string | null;
  readonly pass_mark?: number;
  readonly validity_months?: number | null;
  readonly estimated_minutes?: number | null;
  readonly document_id?: string | null;
  readonly source?: CourseSource;
  readonly lessons?: readonly LessonIn[];
}

export type CourseUpdate = Partial<Omit<CourseCreate, 'source' | 'lessons'>> & {
  readonly change_reason?: string | null;
};

// --- player / attempts ------------------------------------------------------------

/** A quiz question as the learner gets it (no `answer` / `explanation`). */
export type PlayerQuizQuestion = Pick<QuizQuestionDto, 'question' | 'options'>;

export interface PlayerLesson {
  readonly title: string;
  readonly minutes: number | null;
  readonly sections: readonly { readonly heading: string; readonly body: string }[];
  /** The answer key is never sent to the player: attempts are scored on the server. */
  readonly quiz: readonly PlayerQuizQuestion[];
  readonly pass_mark: number;
}

export interface ProgressDto {
  readonly seen_at: string | null;
  readonly completed_at: string | null;
  readonly quiz_score: number | null;
  readonly quiz_passed: boolean | null;
  readonly attempts: number;
}

export interface PlayerItem {
  readonly id: string;
  readonly position: number;
  readonly lesson_key: string;
  readonly video_url: string | null;
  readonly document: DocumentBrief | null;
  readonly lesson: PlayerLesson;
  readonly progress: ProgressDto | null;
}

export interface PlayerOut {
  readonly course: Course;
  readonly document: DocumentBrief | null;
  readonly items: readonly PlayerItem[];
  readonly assignment: Assignment | null;
  readonly latest_record: TrainingRecord | null;
}

export interface AttemptIn {
  /** Lesson id -> the chosen option index per quiz question (null = unanswered). */
  readonly answers: Readonly<Record<string, readonly (number | null)[]>>;
  readonly acknowledged?: boolean;
  readonly feedback_rating?: number | null;
  readonly feedback_comment?: string | null;
}

export interface LessonScore {
  readonly lesson_id: string;
  readonly correct: number;
  readonly total: number;
}

export interface AttemptOut {
  readonly passed: boolean;
  readonly score: number | null;
  readonly pass_mark: number;
  readonly results: readonly LessonScore[];
  readonly assignment: Assignment | null;
  readonly record: TrainingRecord | null;
}

// --- rules ------------------------------------------------------------------------

export interface Rule {
  readonly id: string;
  readonly course_id: string;
  readonly target_type: RuleTarget;
  readonly target_value: string | null;
  readonly target_label: string | null;
  readonly due_days: number;
  readonly active: boolean;
  readonly created_by: string | null;
  readonly created_at: string;
}

export interface RuleCreated extends Rule {
  readonly assignments_created: number;
}

export interface RuleCreate {
  readonly target_type: RuleTarget;
  readonly target_value?: string | null;
  readonly due_days?: number;
}

export interface RuleUpdate {
  readonly due_days?: number;
  readonly active?: boolean;
}

// --- assignments ------------------------------------------------------------------

export interface Assignment {
  readonly id: string;
  readonly course: CourseBrief;
  readonly user: UserBrief;
  readonly status: AssignmentStatus;
  readonly overdue: boolean;
  readonly reason: AssignmentReason;
  readonly due_at: string | null;
  readonly assigned_by: UserBrief | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly cancelled_at: string | null;
  readonly attempts: number;
  readonly last_score: number | null;
  readonly rule_id: string | null;
  readonly record_id: string | null;
  readonly created_at: string;
  readonly url: string;
  readonly can_manage: boolean;
}

export interface AssignmentList {
  readonly items: readonly Assignment[];
  readonly total: number;
}

export interface AssignmentQuery {
  readonly course_id?: string;
  readonly user_id?: string;
  readonly mine?: boolean;
  readonly status?: readonly AssignmentStatus[];
  readonly overdue?: boolean;
  readonly sort?: AssignmentSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AssignmentsCreate {
  readonly course_id: string;
  readonly user_ids: readonly string[];
  readonly due_at?: string | null;
}

export interface AssignmentsCreated {
  readonly items: readonly Assignment[];
  readonly created: number;
  readonly skipped: readonly {
    readonly user_id: string;
    readonly reason: 'already_assigned' | 'not_a_member';
  }[];
}

// --- records ----------------------------------------------------------------------

export interface TrainingRecord {
  readonly id: string;
  readonly course: CourseBrief;
  readonly user: UserBrief;
  readonly assignment_id: string | null;
  readonly course_version: number;
  readonly completed_at: string;
  readonly score: number | null;
  readonly passed: boolean;
  readonly method: RecordMethod;
  readonly expires_at: string | null;
  readonly expired: boolean;
  readonly certificate_no: string | null;
  readonly acknowledged_revision_id: string | null;
  readonly recorded_by: UserBrief | null;
  readonly notes: string | null;
  readonly feedback_rating: number | null;
  readonly feedback_comment: string | null;
  readonly effectiveness: Effectiveness | null;
  readonly effectiveness_notes: string | null;
  readonly evaluated_by: UserBrief | null;
  readonly evaluated_at: string | null;
  readonly created_at: string;
  readonly url: string;
}

export interface RecordList {
  readonly items: readonly TrainingRecord[];
  readonly total: number;
}

export interface RecordQuery {
  readonly course_id?: string;
  readonly user_id?: string;
  readonly mine?: boolean;
  readonly passed?: boolean;
  readonly expiring_within_days?: number;
  readonly expired?: boolean;
  readonly sort?: RecordSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface RecordCreate {
  readonly course_id: string;
  readonly user_id: string;
  readonly completed_at: string;
  readonly score?: number | null;
  readonly passed?: boolean;
  readonly method: ManualMethod;
  readonly expires_at?: string | null;
  readonly notes?: string | null;
}

export interface Certificate {
  readonly certificate_no: string;
  readonly org_name: string;
  readonly user_name: string;
  readonly course_code: string;
  readonly course_title: string;
  readonly course_version: number;
  readonly completed_at: string;
  readonly expires_at: string | null;
  readonly score: number | null;
  readonly method: RecordMethod;
  readonly issued_at: string;
}

// --- overviews --------------------------------------------------------------------

export interface MatrixCell {
  readonly user_id: string;
  readonly course_id: string;
  readonly status: CellStatus;
  readonly required: boolean;
  readonly due_at: string | null;
  readonly completed_at: string | null;
  readonly expires_at: string | null;
  readonly assignment_id: string | null;
  readonly record_id: string | null;
}

export interface Matrix {
  readonly courses: readonly {
    readonly id: string;
    readonly code: string;
    readonly title: string;
  }[];
  readonly users: readonly UserBrief[];
  readonly cells: readonly MatrixCell[];
  readonly summary: { readonly required: number; readonly compliant: number; readonly pct: number };
}

export interface MatrixQuery {
  readonly course_ids?: readonly string[];
  readonly category?: CourseCategory | '';
  readonly department_id?: string;
}

export interface NeedItem {
  readonly course: CourseBrief;
  readonly status: CellStatus;
  readonly required: boolean;
  readonly due_at: string | null;
  readonly completed_at: string | null;
  readonly expires_at: string | null;
  readonly assignment_id: string | null;
  readonly record_id: string | null;
}

export interface Needs {
  readonly user: UserBrief;
  readonly items: readonly NeedItem[];
}

export interface TrainingStats {
  readonly courses_published: number;
  readonly assignments_open: number;
  readonly assignments_overdue: number;
  readonly completed_last_365_days: number;
  /** Percentage (0-100). */
  readonly completion_rate: number;
  readonly expiring_30_days: number;
  readonly expired: number;
  readonly effectiveness: {
    readonly effective: number;
    readonly partially_effective: number;
    readonly not_effective: number;
    readonly not_evaluated: number;
  };
  readonly average_feedback: number | null;
}

// --- AI assists -------------------------------------------------------------------

/** `training.generate_course` result. */
export interface GeneratedCourse {
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly estimated_minutes: number | null;
  readonly lessons: readonly {
    readonly title: string;
    readonly body: string;
    readonly minutes?: number | null;
    readonly quiz?: readonly QuizQuestionDto[];
  }[];
}

/** `training.generate_quiz` result. */
export interface GeneratedQuiz {
  readonly quiz: readonly QuizQuestionDto[];
}
