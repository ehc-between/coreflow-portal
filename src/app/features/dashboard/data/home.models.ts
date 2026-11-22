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
  /** The one readiness number (U07): requirement coverage 0-100, equal to `percent`. */
  readonly score: number;
  readonly percent: number;
  readonly covered: number;
  readonly partial: number;
  readonly applicable: number;
  /** Applicable requirements not covered yet ("N ting gjenstår"). */
  readonly remaining: number;
  /** Portal page listing what is still missing (`/standards/gaps/<key>`). */
  readonly remaining_url: string;
  /** A certification target of the org (every enabled standard when none is set). */
  readonly is_target: boolean;
  /** ISO date of the target certification, when set. */
  readonly target_date: string | null;
  /** `planned` | `in_progress` | `certified`. */
  readonly target_status: string | null;
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
  /** U07 employee counters: documents to read and acknowledge, training due, the rest. */
  readonly acknowledge: number;
  readonly training: number;
  readonly tasks: number;
}

/** U07 home templates, resolved by the API from the caller's RBAC roles. */
export type WorkspaceKey = 'employee' | 'owner' | 'quality_lead' | 'management' | 'auditor';

export const WORKSPACE_KEYS: readonly WorkspaceKey[] = [
  'employee',
  'owner',
  'quality_lead',
  'management',
  'auditor',
];

export interface HomeWorkspace {
  readonly key: WorkspaceKey;
  /** `role` from the roles, `requested` via `?workspace=`, `default` from permissions. */
  readonly source: 'role' | 'requested' | 'default';
  readonly roles: readonly string[];
}

/** One "Hva vil du gjøre?" button; labelled by `home.quick.<key>`. */
export interface QuickAction {
  readonly key: string;
  readonly url: string;
  readonly module: string | null;
}

/** `GET` / `PUT /home/workspaces`: the home template per RBAC role (`org:manage`). */
export interface RoleWorkspace {
  readonly role: string;
  readonly name: string;
  readonly workspace: WorkspaceKey;
  readonly default_workspace: WorkspaceKey;
  readonly overridden: boolean;
}

export interface WorkspaceSettings {
  readonly workspaces: readonly WorkspaceKey[];
  readonly roles: readonly RoleWorkspace[];
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
  /** U09: the target audit date (ISO date), from the org's certification target. */
  readonly target_date?: string | null;
  readonly schedule?: JourneySchedule | null;
}

/** U09: progress against the target audit date. */
export interface JourneySchedule {
  readonly status: 'on_track' | 'behind' | 'overdue' | 'done';
  readonly weeks_behind: number;
  readonly days_left: number;
}

export interface SetupSummary {
  readonly complete: boolean;
  /** What is still missing: `wizard`, `standards`, `members`. */
  readonly missing: readonly string[];
}

export interface HomeResponse {
  readonly workspace: HomeWorkspace;
  readonly quick_actions: readonly QuickAction[];
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

export interface JourneyStepLocation {
  readonly outcome: 'met' | 'partial' | 'not_met' | string;
  /** Plain reason, e.g. "1 kontekstanalyse registrert, men ikke godkjent ennå". */
  readonly text: string;
  /** e.g. "Godkjenn kontekstanalyse" / "Legg til interessenter". */
  readonly action_label: string;
  readonly url: string;
  readonly location: string;
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
  /**
   * Record steps with requirements: the requirement-location verdict the step's
   * completion comes from (no manual link needed), with the plain reason and a
   * direct action when it is not met yet.
   */
  readonly location?: JourneyStepLocation | null;
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
