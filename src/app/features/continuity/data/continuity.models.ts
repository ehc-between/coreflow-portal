/**
 * DTOs of the M20 business continuity API (`v1/orgs/{org}/continuity`), mirroring
 * `app/modules/continuity/schemas.py`. Durations are integer minutes, dates are
 * `YYYY-MM-DD`, timestamps naive UTC. Lists return `{items, total}`.
 */
import { AssigneeIn, Task } from '../../../core/tasks/task.models';

export const CONTROLLED_STATUSES = ['draft', 'in_review', 'approved', 'retired'] as const;
export type ControlledStatus = (typeof CONTROLLED_STATUSES)[number];

export const CONTROLLED_ACTIONS = [
  'submit',
  'approve',
  'reject',
  'review',
  'retire',
  'restore',
] as const;
export type ControlledAction = (typeof CONTROLLED_ACTIONS)[number];

export const CRITICALITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Criticality = (typeof CRITICALITIES)[number];

export const IMPACT_CATEGORIES = [
  'financial',
  'operational',
  'legal_regulatory',
  'reputational',
  'customer',
  'health_safety',
  'environmental',
] as const;
export type ImpactCategory = (typeof IMPACT_CATEGORIES)[number];
export type Impacts = Readonly<Record<ImpactCategory, number | null>>;

export const DEPENDENCY_KINDS = [
  'people',
  'site',
  'ict',
  'supplier',
  'equipment',
  'information',
  'other',
] as const;
export type DependencyKind = (typeof DEPENDENCY_KINDS)[number];

export const PLAN_TYPES = [
  'business_continuity',
  'disaster_recovery',
  'crisis_management',
  'emergency_response',
  'ict_continuity',
  'incident_response',
  'pandemic',
  'other',
] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const STEP_PHASES = [
  'activation',
  'response',
  'recovery',
  'restoration',
  'stand_down',
] as const;
export type StepPhase = (typeof STEP_PHASES)[number];

export const EXERCISE_TYPES = [
  'tabletop',
  'walkthrough',
  'simulation',
  'functional',
  'full_scale',
  'ict_recovery',
  'evacuation_drill',
  'call_tree',
  'other',
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const EXERCISE_STATUSES = ['planned', 'completed', 'cancelled'] as const;
export type ExerciseStatus = (typeof EXERCISE_STATUSES)[number];

export const EXERCISE_ACTIONS = ['complete', 'cancel', 'reopen'] as const;
export type ExerciseAction = (typeof EXERCISE_ACTIONS)[number];

export const OUTCOMES = ['successful', 'partially_successful', 'unsuccessful'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const ICT_STATUSES = ['active', 'retired'] as const;
export type IctStatus = (typeof ICT_STATUSES)[number];

export const READINESS_STATES = ['ready', 'attention', 'gap', 'retired'] as const;
export type ReadinessState = (typeof READINESS_STATES)[number];

export const READINESS_ISSUES = [
  'rto_gap',
  'rpo_gap',
  'rto_capability_unknown',
  'rpo_capability_unknown',
  'never_tested',
  'test_overdue',
  'last_test_failed',
] as const;
export type ReadinessIssue = (typeof READINESS_ISSUES)[number];

export const CONTACT_TYPES = [
  'internal',
  'external',
  'authority',
  'supplier',
  'emergency_service',
  'other',
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const REVIEW_STATES = ['not_scheduled', 'ok', 'due_soon', 'overdue'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const BIA_SORTS = [
  'code',
  '-code',
  'title',
  '-title',
  'rto_minutes',
  'next_review_on',
  '-updated_at',
  '-created_at',
] as const;
export type BiaSort = (typeof BIA_SORTS)[number];

export const PLAN_SORTS = [
  'code',
  '-code',
  'title',
  '-title',
  'next_review_on',
  '-updated_at',
  '-created_at',
] as const;
export type PlanSort = (typeof PLAN_SORTS)[number];

export const EXERCISE_SORTS = [
  'scheduled_on',
  '-scheduled_on',
  'code',
  '-code',
  '-updated_at',
  '-created_at',
] as const;
export type ExerciseSort = (typeof EXERCISE_SORTS)[number];

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface CodeRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string | null;
}

export interface RecoveryTargets {
  readonly rto_minutes: number | null;
  readonly rpo_minutes: number | null;
  readonly mtpd_minutes: number | null;
}

/** Shared fields of the controlled records (BIA, plan). */
export interface ControlledDetail {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ControlledStatus;
  readonly version: number;
  readonly review_interval_months: number;
  readonly last_reviewed_on: string | null;
  readonly next_review_on: string | null;
  readonly review_state: ReviewState;
  readonly submitted_at: string | null;
  readonly submitted_by: UserRef | null;
  readonly approved_at: string | null;
  readonly approved_by: UserRef | null;
  readonly allowed_actions: readonly string[];
  readonly can_edit: boolean;
  readonly can_delete: boolean;
}

// --- BIA ----------------------------------------------------------------------------

export interface DependencyIn {
  readonly kind: DependencyKind;
  readonly name?: string | null;
  readonly notes?: string | null;
  readonly ict_system_id?: string | null;
}

export interface DependencyOut {
  readonly kind: DependencyKind;
  readonly name: string;
  readonly notes: string | null;
  readonly ict_system_id: string | null;
  readonly ict_system_code: string | null;
}

export interface BiaListItem {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ControlledStatus;
  readonly criticality: Criticality | null;
  readonly max_impact: number;
  readonly mtpd_minutes: number | null;
  readonly rto_minutes: number | null;
  readonly rpo_minutes: number | null;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly version: number;
  readonly next_review_on: string | null;
  readonly review_state: ReviewState;
  readonly plan_count: number;
  readonly updated_at: string;
  readonly url: string;
}

export interface BiaDetail extends BiaListItem, ControlledDetail {
  readonly status: ControlledStatus;
  readonly description: string | null;
  readonly impacts: Impacts;
  readonly impact_notes: string | null;
  readonly mbco: string | null;
  readonly peak_periods: string | null;
  readonly workarounds: string | null;
  readonly dependencies: readonly DependencyOut[];
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly plans: readonly CodeRef[];
}

export interface BiaFields {
  readonly title: string;
  readonly description: string | null;
  readonly owner_user_id: string | null;
  readonly department_id: string | null;
  readonly criticality: Criticality | null;
  readonly impacts: Impacts;
  readonly impact_notes: string | null;
  readonly mtpd_minutes: number | null;
  readonly rto_minutes: number | null;
  readonly rpo_minutes: number | null;
  readonly mbco: string | null;
  readonly peak_periods: string | null;
  readonly workarounds: string | null;
  readonly dependencies: readonly DependencyIn[];
  readonly review_interval_months: number | null;
}

export type BiaUpdate = Partial<BiaFields> & { readonly change_reason?: string | null };

export interface BiaListQuery {
  readonly q?: string;
  readonly status?: readonly ControlledStatus[];
  readonly criticality?: readonly Criticality[];
  readonly owner?: string;
  readonly uncovered?: boolean;
  readonly review_due?: boolean;
  readonly sort?: BiaSort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- plans --------------------------------------------------------------------------

export interface PlanStep {
  readonly phase: StepPhase;
  readonly title: string;
  readonly description: string | null;
  readonly owner_role: string | null;
  readonly target_minutes: number | null;
}

export interface PlanListItem {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly plan_type: PlanType;
  readonly status: ControlledStatus;
  readonly version: number;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly location: string | null;
  readonly bia_count: number;
  readonly recovery_targets: RecoveryTargets;
  readonly last_exercised_on: string | null;
  readonly next_review_on: string | null;
  readonly review_state: ReviewState;
  readonly updated_at: string;
  readonly url: string;
}

export interface PlanBia {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly criticality: Criticality | null;
  readonly mtpd_minutes: number | null;
  readonly rto_minutes: number | null;
  readonly rpo_minutes: number | null;
}

export interface ExerciseBrief {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly exercise_type: ExerciseType;
  readonly status: ExerciseStatus;
  readonly scheduled_on: string | null;
  readonly conducted_on: string | null;
  readonly outcome: Outcome | null;
}

/** The plan's free-text sections, in display order. */
export const PLAN_TEXT_FIELDS = [
  'scope',
  'objectives',
  'activation_criteria',
  'roles_responsibilities',
  'recovery_strategy',
  'communication_plan',
  'resources',
] as const;
export type PlanTextField = (typeof PLAN_TEXT_FIELDS)[number];

export interface PlanDetail extends PlanListItem, ControlledDetail {
  readonly status: ControlledStatus;
  readonly scope: string | null;
  readonly objectives: string | null;
  readonly activation_criteria: string | null;
  readonly roles_responsibilities: string | null;
  readonly recovery_strategy: string | null;
  readonly communication_plan: string | null;
  readonly resources: string | null;
  readonly steps: readonly PlanStep[];
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly bias: readonly PlanBia[];
  readonly contacts: readonly Contact[];
  readonly exercises: readonly ExerciseBrief[];
  readonly next_exercise_on: string | null;
  readonly next_exercise_due_at: string | null;
  readonly exercise_schedule_active: boolean;
}

export interface PlanFields {
  readonly title: string;
  readonly plan_type: PlanType;
  readonly location: string | null;
  readonly scope: string | null;
  readonly objectives: string | null;
  readonly activation_criteria: string | null;
  readonly roles_responsibilities: string | null;
  readonly recovery_strategy: string | null;
  readonly communication_plan: string | null;
  readonly resources: string | null;
  readonly owner_user_id: string | null;
  readonly department_id: string | null;
  readonly review_interval_months: number | null;
  readonly steps: readonly PlanStep[];
  readonly bia_ids: readonly string[];
}

export type PlanUpdate = Partial<PlanFields> & { readonly change_reason?: string | null };

export interface PlanListQuery {
  readonly q?: string;
  readonly status?: readonly ControlledStatus[];
  readonly type?: PlanType;
  readonly owner?: string;
  readonly bia_id?: string;
  readonly review_due?: boolean;
  readonly sort?: PlanSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ExerciseScheduleRequest {
  readonly rrule: string;
  readonly dtstart: string;
  readonly lead_days?: number;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly assignee?: AssigneeIn | null;
}

// --- exercises ----------------------------------------------------------------------

export interface ExercisePlanRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly recovery_targets?: RecoveryTargets | null;
}

export interface ExerciseSystemRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly achievable_rto_minutes?: number | null;
  readonly required_rto_minutes?: number | null;
}

export interface ExerciseListItem {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly exercise_type: ExerciseType;
  readonly status: ExerciseStatus;
  readonly plan: ExercisePlanRef | null;
  readonly ict_system: ExerciseSystemRef | null;
  readonly owner: UserRef | null;
  readonly scheduled_on: string | null;
  readonly overdue: boolean;
  readonly conducted_on: string | null;
  readonly outcome: Outcome | null;
  readonly updated_at: string;
  readonly url: string;
}

export interface ExerciseDetail extends ExerciseListItem {
  readonly scenario: string | null;
  readonly objectives: string | null;
  readonly participants: string | null;
  readonly achieved_recovery_minutes: number | null;
  readonly target_rto_minutes: number | null;
  readonly rto_met: boolean | null;
  readonly results: string | null;
  readonly lessons_learned: string | null;
  readonly completed_at: string | null;
  readonly completed_by: UserRef | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly actions: readonly Task[];
  readonly allowed_actions: readonly string[];
  readonly can_edit: boolean;
  readonly can_delete: boolean;
}

export interface ExerciseCreate {
  readonly title: string;
  readonly exercise_type: ExerciseType;
  readonly plan_id: string | null;
  readonly ict_system_id: string | null;
  readonly owner_user_id: string | null;
  readonly scheduled_on: string | null;
  readonly scenario: string | null;
  readonly objectives: string | null;
  readonly participants: string | null;
}

export interface ExerciseUpdate extends Partial<ExerciseCreate> {
  readonly conducted_on?: string | null;
  readonly outcome?: Outcome | null;
  readonly achieved_recovery_minutes?: number | null;
  readonly results?: string | null;
  readonly lessons_learned?: string | null;
}

export interface ExerciseCompleteRequest {
  readonly conducted_on: string;
  readonly outcome: Outcome;
  readonly achieved_recovery_minutes?: number | null;
  readonly results?: string | null;
  readonly lessons_learned?: string | null;
}

export interface ExerciseListQuery {
  readonly q?: string;
  readonly status?: ExerciseStatus;
  readonly type?: ExerciseType;
  readonly plan_id?: string;
  readonly ict_system_id?: string;
  readonly owner?: string;
  readonly overdue?: boolean;
  readonly from?: string;
  readonly to?: string;
  readonly sort?: ExerciseSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface FollowUpRequest {
  readonly title: string;
  readonly description?: string | null;
  readonly assignee?: AssigneeIn | null;
  readonly due_at?: string | null;
  readonly priority?: string;
}

// --- ICT readiness ------------------------------------------------------------------

export interface Readiness {
  readonly state: ReadinessState;
  readonly issues: readonly ReadinessIssue[];
  readonly required_rto_minutes: number | null;
  readonly required_rpo_minutes: number | null;
  readonly dependent_bia_count: number;
  readonly next_test_due_on: string | null;
}

export interface IctListItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: IctStatus;
  readonly provider: string | null;
  readonly owner: UserRef | null;
  readonly achievable_rto_minutes: number | null;
  readonly achievable_rpo_minutes: number | null;
  readonly test_interval_months: number;
  readonly last_tested_on: string | null;
  readonly last_test_outcome: Outcome | null;
  readonly readiness: Readiness;
  readonly updated_at: string;
  readonly url: string;
}

export interface IctDependentBia {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly rto_minutes: number | null;
  readonly rpo_minutes: number | null;
}

export interface IctTest {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ExerciseStatus;
  readonly scheduled_on: string | null;
  readonly conducted_on: string | null;
  readonly outcome: Outcome | null;
}

export interface IctDetail extends IctListItem {
  readonly description: string | null;
  readonly recovery_strategy: string | null;
  readonly backup_strategy: string | null;
  readonly last_test_recovery_minutes: number | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly dependent_bias: readonly IctDependentBia[];
  readonly tests: readonly IctTest[];
  readonly can_edit: boolean;
  readonly can_delete: boolean;
}

export interface IctFields {
  readonly name: string;
  readonly description: string | null;
  readonly owner_user_id: string | null;
  readonly provider: string | null;
  readonly achievable_rto_minutes: number | null;
  readonly achievable_rpo_minutes: number | null;
  readonly recovery_strategy: string | null;
  readonly backup_strategy: string | null;
  readonly test_interval_months: number | null;
  readonly last_tested_on: string | null;
  readonly last_test_outcome: Outcome | null;
}

export type IctUpdate = Partial<IctFields> & { readonly status?: IctStatus };

export interface IctListQuery {
  readonly q?: string;
  readonly status?: IctStatus;
  readonly readiness?: readonly ReadinessState[];
  readonly limit?: number;
  readonly offset?: number;
}

// --- contacts -----------------------------------------------------------------------

export interface Contact {
  readonly id: string;
  readonly plan_id: string | null;
  readonly name: string;
  readonly crisis_role: string | null;
  readonly organisation: string | null;
  readonly contact_type: ContactType;
  readonly user: UserRef | null;
  readonly phone: string | null;
  readonly alt_phone: string | null;
  readonly email: string | null;
  readonly available_24_7: boolean;
  readonly notes: string | null;
  readonly position: number;
  readonly verified_on: string | null;
  readonly needs_verification: boolean;
  readonly updated_at: string;
}

export interface ContactFields {
  readonly name: string;
  readonly contact_type: ContactType;
  readonly crisis_role: string | null;
  readonly organisation: string | null;
  readonly user_id: string | null;
  readonly phone: string | null;
  readonly alt_phone: string | null;
  readonly email: string | null;
  readonly available_24_7: boolean;
  readonly notes: string | null;
  readonly position: number | null;
  readonly verified_on: string | null;
}

export interface ContactCreate extends ContactFields {
  readonly plan_id: string | null;
}

export type ContactScope = 'org' | 'plan' | 'all';

// --- overview -----------------------------------------------------------------------

export interface AttentionItem {
  readonly code: string;
  readonly title: string;
  readonly url: string;
  readonly [extra: string]: unknown;
}

export interface Overview {
  readonly bia: {
    readonly total: number;
    readonly approved: number;
    readonly uncovered: number;
    readonly review_overdue: number;
    readonly critical: number;
  };
  readonly plans: {
    readonly total: number;
    readonly approved: number;
    readonly in_review: number;
    readonly review_overdue: number;
    readonly not_exercised: number;
  };
  readonly exercises: {
    readonly planned: number;
    readonly overdue: number;
    readonly next: (AttentionItem & { readonly scheduled_on?: string | null }) | null;
  };
  readonly ict: {
    readonly total: number;
    readonly ready: number;
    readonly attention: number;
    readonly gap: number;
  };
  readonly contacts: {
    readonly total: number;
    readonly org_wide: number;
    readonly needs_verification: number;
  };
  readonly attention: {
    readonly uncovered_bias: readonly AttentionItem[];
    readonly plans_review_overdue: readonly AttentionItem[];
    readonly plans_not_exercised: readonly AttentionItem[];
    readonly exercises_overdue: readonly AttentionItem[];
    readonly ict_gaps: readonly AttentionItem[];
  };
}

export const ATTENTION_GROUPS = [
  'uncovered_bias',
  'plans_review_overdue',
  'plans_not_exercised',
  'exercises_overdue',
  'ict_gaps',
] as const;
export type AttentionGroup = (typeof ATTENTION_GROUPS)[number];

// --- assist results -----------------------------------------------------------------

export interface PlanDraftResult {
  readonly title?: string | null;
  readonly plan_type?: PlanType | null;
  readonly scope?: string | null;
  readonly objectives?: string | null;
  readonly activation_criteria?: string | null;
  readonly roles_responsibilities?: string | null;
  readonly recovery_strategy?: string | null;
  readonly communication_plan?: string | null;
  readonly resources?: string | null;
  readonly steps?: readonly Partial<PlanStep>[];
  readonly contact_roles?: readonly string[];
  readonly assumptions?: readonly string[];
}

export interface BiaSuggestion {
  readonly criticality?: Criticality | null;
  readonly impacts?: Partial<Record<ImpactCategory, number | null>>;
  readonly impact_notes?: string | null;
  readonly mtpd_minutes?: number | null;
  readonly rto_minutes?: number | null;
  readonly rpo_minutes?: number | null;
  readonly mbco?: string | null;
  readonly dependencies?: readonly {
    kind?: DependencyKind;
    name?: string;
    notes?: string | null;
  }[];
  readonly rationale?: string | null;
}

export interface ExerciseScenarioResult {
  readonly title?: string | null;
  readonly exercise_type?: ExerciseType | null;
  readonly scenario?: string | null;
  readonly objectives?: string | null;
  readonly participants?: readonly string[];
  readonly injects?: readonly { at_minutes?: number; description?: string }[];
  readonly success_criteria?: readonly string[];
}
