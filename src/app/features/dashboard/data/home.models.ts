/**
 * DTOs of the P5 home and journey API (`/api/v1/orgs/{org_id}/home`, `/next-actions`,
 * `/journeys`). Mirrors `app/platform/journeys/schemas.py` in coreflow-core. Datetimes
 * are naive UTC; text fields (`title`, `summary`, `body`, gap titles) come back in the
 * language passed as `?lang=`.
 */

/** One open gap of a standard: a clause with requirements still missing evidence. */
export interface HomeGap {
  /** Canonical clause ref, e.g. `iso27001:4.2`. */
  readonly ref: string;
  readonly number: string;
  readonly title: string;
  /** Applicable requirements of the clause still not covered. */
  readonly missing: number;
  readonly total: number;
  /** Portal route of the clause, e.g. `/standards/iso27001-2022/4.2`. */
  readonly url: string;
}

/** Requirement coverage of one enabled standard. */
export interface FrameworkStatus {
  readonly framework: string;
  readonly standard_key: string;
  readonly name: string;
  /** `standard` (ISO) or `regulation` (GDPR, NIS2, AI Act). */
  readonly kind: string;
  /** Requirement coverage 0-100. */
  readonly score: number;
  readonly covered: number;
  readonly partial: number;
  readonly applicable: number;
  /** Change of the covered share over 30 days, in percentage points. */
  readonly trend_30d: number;
  /** Clauses with at least one open requirement. */
  readonly open_gaps: number;
  readonly top_gaps: readonly HomeGap[];
  readonly url: string;
}

export type NextActionKind =
  | 'overdue'
  | 'due_soon'
  | 'gap'
  | 'confirm_suggestions'
  | 'journey_step'
  | 'setup'
  | 'review';

/**
 * One "do this now" item. `title_key` / `why_key` are scoped keys of the `home`
 * scope (`home:next.<name>.title`); `params` fill them.
 */
export interface NextAction {
  /** Stable key; dismissing hides the action until the key changes. */
  readonly key: string;
  readonly kind: NextActionKind | string;
  readonly title_key: string;
  readonly why_key: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly url: string;
  /** 0 = most urgent. */
  readonly priority: number;
  readonly module: string | null;
}

export interface MyWorkSummary {
  readonly overdue: number;
  readonly due_this_week: number;
  readonly later: number;
  readonly awaiting_review: number;
  readonly total: number;
}

/** The next open step of a journey (`url` is the requirement page when it only needs a link). */
export interface JourneyNextStep {
  readonly key: string;
  readonly title: string;
  readonly url: string;
  readonly needs_link: boolean;
  readonly module: string | null;
  readonly module_enabled: boolean;
}

export type JourneyStatus = 'active' | 'completed' | 'archived';

export interface JourneySummary {
  readonly id: string;
  readonly framework: string;
  readonly title: string;
  readonly summary: string;
  readonly status: JourneyStatus | string;
  readonly started_at: string;
  readonly started_by: string | null;
  readonly completed_at: string | null;
  /** `/standards/journey/<framework>`. */
  readonly url: string;
  readonly done: number;
  /** Steps that count (skipped steps excluded). */
  readonly total: number;
  readonly skipped: number;
  readonly percent: number;
  readonly next_step: JourneyNextStep | null;
}

export interface SetupSummary {
  readonly complete: boolean;
  /** What is still missing: `wizard`, `standards`, `members`. */
  readonly missing: readonly string[];
}

export interface HomeResponse {
  readonly frameworks: readonly FrameworkStatus[];
  readonly next_actions: readonly NextAction[];
  readonly my_work: MyWorkSummary;
  readonly journeys: readonly JourneySummary[];
  readonly setup: SetupSummary;
}

export interface NextActionList {
  readonly items: readonly NextAction[];
}

// --- journeys ------------------------------------------------------------------------

export type StepStatus = 'todo' | 'done' | 'skipped';
export type StepActionKind = 'create' | 'open' | 'lesson' | 'task';
export type StepDoneWhen = 'record_exists' | 'requirement_covered' | 'coverage' | 'manual';

export interface StepLesson {
  readonly scope: string;
  readonly key: string;
  /** `/account/learning/<scope>/<lesson>`. */
  readonly url: string;
}

export interface StepAction {
  readonly kind: StepActionKind | string;
  readonly url: string | null;
}

export interface StepProgress {
  readonly current: number;
  readonly target: number;
  /** For record steps with requirements: records already linked to them. */
  readonly linked?: number | null;
}

export interface StepTask {
  readonly id: string;
  readonly status: string;
  readonly url: string;
}

export interface JourneyStep {
  readonly key: string;
  readonly phase: string;
  readonly title: string;
  readonly body: string;
  readonly requirement_refs: readonly string[];
  readonly module: string | null;
  readonly module_enabled: boolean;
  readonly lesson: StepLesson | null;
  readonly action: StepAction | null;
  readonly done_when: StepDoneWhen | string;
  readonly status: StepStatus;
  /** Why it is done: by hand, through its task, or because the data shows it. */
  readonly done_source: 'manual' | 'task' | 'auto' | null;
  readonly progress: StepProgress | null;
  /** The records exist but none is confirmed evidence for the step's requirements yet. */
  readonly needs_link: boolean;
  /** Where the step's evidence is linked (the requirement page). */
  readonly requirement_url: string | null;
  readonly done_at: string | null;
  readonly done_by: string | null;
  readonly task: StepTask | null;
  readonly url: string;
}

export interface JourneyPhase {
  readonly key: string;
  readonly title: string;
  readonly summary: string | null;
  readonly done: number;
  readonly total: number;
  readonly skipped: number;
  readonly percent: number;
  readonly steps: readonly JourneyStep[];
}

export interface Journey extends JourneySummary {
  readonly phases: readonly JourneyPhase[];
}

export interface AvailableJourney {
  readonly framework: string;
  readonly title: string;
  readonly summary: string;
  readonly steps: number;
  readonly standard_enabled: boolean;
}

export interface JourneyList {
  readonly items: readonly JourneySummary[];
  readonly available: readonly AvailableJourney[];
}

/** Optional body of "make it a task". */
export interface StepTaskRequest {
  readonly assignee?: { readonly type: 'user' | 'role' | 'department'; readonly value: string };
  readonly due_at?: string;
}
