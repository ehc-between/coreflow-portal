/*
 * Recruitment (M10) DTOs, mirroring `app/modules/recruitment/schemas.py` in
 * coreflow-core. Datetimes are naive-UTC ISO strings, dates are `YYYY-MM-DD`.
 */

export const REQUISITION_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'open',
  'on_hold',
  'filled',
  'cancelled',
] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const EMPLOYMENT_TYPES = [
  'permanent',
  'temporary',
  'contractor',
  'intern',
  'other',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const ROLE_RISKS = ['low', 'medium', 'high'] as const;
export type RoleRisk = (typeof ROLE_RISKS)[number];

export const TEAM_ROLES = ['hiring_manager', 'recruiter', 'interviewer', 'member'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const SOURCES = [
  'direct',
  'referral',
  'agency',
  'job_board',
  'internal',
  'website',
  'other',
] as const;
export type CandidateSource = (typeof SOURCES)[number];

/** Kanban order. `offer` and `hired` are reached through the offer / hire endpoints. */
export const STAGES = [
  'applied',
  'screening',
  'interview',
  'assessment',
  'reference_check',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
] as const;
export type Stage = (typeof STAGES)[number];

/** Stages `POST /applications/{id}/move` accepts. */
export const MOVE_STAGES = [
  'applied',
  'screening',
  'interview',
  'assessment',
  'reference_check',
  'rejected',
  'withdrawn',
] as const;
export type MoveStage = (typeof MOVE_STAGES)[number];

export const CLOSED_STAGES: readonly Stage[] = ['hired', 'rejected', 'withdrawn'];

export const REJECTION_REASONS = [
  'not_qualified',
  'criteria_not_met',
  'better_match_hired',
  'position_closed',
  'candidate_unresponsive',
  'other',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const OFFER_STATUSES = ['none', 'extended', 'accepted', 'declined'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const INTERVIEW_KINDS = ['phone', 'video', 'onsite', 'technical', 'panel'] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

export const INTERVIEW_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const RECOMMENDATIONS = ['strong_no', 'no', 'yes', 'strong_yes'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const SCREENING_RESULTS = ['met', 'partly', 'not_met', 'unknown'] as const;
export type ScreeningResult = (typeof SCREENING_RESULTS)[number];

export const CHECK_TYPES = [
  'identity',
  'right_to_work',
  'reference',
  'employment_history',
  'education',
  'criminal_record',
  'credit',
  'other',
] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

export const CHECK_STATUSES = [
  'requested',
  'in_progress',
  'passed',
  'concerns',
  'failed',
  'waived',
] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const REQUISITION_SORTS = [
  '-created_at',
  'created_at',
  'title',
  'status',
  'target_start_date',
] as const;
export type RequisitionSort = (typeof REQUISITION_SORTS)[number];

export const CANDIDATE_SORTS = ['-created_at', 'created_at', 'name', 'retention_until'] as const;
export type CandidateSort = (typeof CANDIDATE_SORTS)[number];

// --- shared ---------------------------------------------------------------------------

export interface UserRef {
  readonly id: string;
  readonly name: string;
}

export interface Criterion {
  readonly id: string;
  readonly label: string;
  readonly description: string | null;
}

export interface CriterionInput {
  readonly id?: string | null;
  readonly label: string;
  readonly description?: string | null;
}

export interface ListResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
}

// --- requisitions ---------------------------------------------------------------------

export interface RequisitionCreate {
  readonly title: string;
  readonly description?: string | null;
  readonly justification?: string | null;
  readonly department_id?: string | null;
  readonly location?: string | null;
  readonly employment_type: EmploymentType;
  readonly headcount: number;
  readonly role_risk: RoleRisk;
  readonly target_start_date?: string | null;
  readonly hiring_manager_user_id?: string | null;
  readonly recruiter_user_id?: string | null;
  readonly screening_criteria: readonly CriterionInput[];
  readonly posting_title?: string | null;
  readonly posting_text?: string | null;
  readonly posting_closes_at?: string | null;
}

export type RequisitionUpdate = Partial<RequisitionCreate> & {
  readonly change_reason?: string | null;
};

export interface Requisition {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly justification: string | null;
  readonly department_id: string | null;
  readonly location: string | null;
  readonly employment_type: EmploymentType;
  readonly headcount: number;
  readonly role_risk: RoleRisk;
  readonly status: RequisitionStatus;
  readonly target_start_date: string | null;
  readonly hiring_manager: UserRef | null;
  readonly recruiter: UserRef | null;
  readonly screening_criteria: readonly Criterion[];
  readonly posting_title: string | null;
  readonly posting_text: string | null;
  readonly posting_closes_at: string | null;
  readonly opened_at: string | null;
  readonly submitted_at: string | null;
  readonly submitted_by: UserRef | null;
  readonly decided_at: string | null;
  readonly decided_by: UserRef | null;
  readonly decision_note: string | null;
  readonly approval_task_id: string | null;
  readonly closed_at: string | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly required_checks: readonly CheckType[];
  readonly stage_counts: Readonly<Partial<Record<Stage, number>>>;
  readonly hires: number;
  readonly can_edit: boolean;
  readonly can_approve: boolean;
  readonly url: string;
}

export interface TeamMember {
  readonly user_id: string;
  readonly name: string;
  readonly team_role: TeamRole;
}

export interface RequisitionDetail extends Requisition {
  readonly team: readonly TeamMember[];
}

export interface RequisitionQuery {
  readonly q?: string;
  readonly status?: readonly RequisitionStatus[];
  readonly department_id?: string;
  readonly owner?: 'me';
  readonly sort?: RequisitionSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface PipelineColumn {
  readonly stage: Stage;
  readonly items: readonly ApplicationSummary[];
}

export interface Pipeline {
  readonly requisition_id: string;
  readonly stages: readonly PipelineColumn[];
}

// --- candidates -----------------------------------------------------------------------

export interface CandidateCreate {
  readonly full_name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly location?: string | null;
  readonly profile_url?: string | null;
  readonly source: CandidateSource;
  readonly notes?: string | null;
  readonly privacy_notice_given: boolean;
  readonly talent_pool_consent: boolean;
}

export type CandidateUpdate = Partial<
  Omit<CandidateCreate, 'privacy_notice_given' | 'talent_pool_consent'>
>;

export interface PrivacyUpdate {
  readonly privacy_notice_given?: boolean;
  readonly talent_pool_consent?: boolean;
}

export interface Candidate {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly full_name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly location: string | null;
  readonly profile_url: string | null;
  readonly source: CandidateSource;
  readonly notes: string | null;
  readonly privacy_notice_version: string | null;
  readonly privacy_notice_given_at: string | null;
  readonly talent_pool_consent: boolean;
  readonly consent_given_at: string | null;
  readonly consent_withdrawn_at: string | null;
  readonly retention_until: string | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly application_count: number;
  readonly can_edit: boolean;
  readonly url: string;
}

export interface CandidateDetail extends Candidate {
  readonly applications: readonly ApplicationSummary[];
}

export interface CandidateQuery {
  readonly q?: string;
  readonly talent_pool?: boolean;
  readonly retention_before?: string;
  readonly sort?: CandidateSort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- applications ---------------------------------------------------------------------

export interface ApplicationSummary {
  readonly id: string;
  readonly code: string;
  readonly requisition_id: string;
  readonly requisition_code: string;
  readonly requisition_title: string;
  readonly candidate_id: string;
  readonly candidate_code: string;
  readonly candidate_name: string;
  readonly stage: Stage;
  readonly stage_changed_at: string | null;
  readonly offer_status: OfferStatus;
  readonly source: CandidateSource;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface ScreeningEntry {
  readonly criterion_id: string;
  readonly result: ScreeningResult;
  readonly note?: string | null;
}

export interface Application extends ApplicationSummary {
  readonly cover_note: string | null;
  readonly screening: readonly ScreeningEntry[];
  readonly rejection_reason: RejectionReason | null;
  readonly rejection_note: string | null;
  readonly offer_start_date: string | null;
  readonly offer_note: string | null;
  readonly offer_extended_at: string | null;
  readonly offer_responded_at: string | null;
  readonly hired_at: string | null;
  readonly onboarding_task_id: string | null;
  readonly closed_at: string | null;
  readonly created_by: UserRef | null;
  readonly privacy_notice_given: boolean;
  readonly can_edit: boolean;
}

export interface ApplicationDetail extends Application {
  readonly criteria: readonly Criterion[];
  readonly required_checks: readonly CheckType[];
  readonly interviews: readonly Interview[];
  readonly scorecards: readonly Scorecard[];
  readonly checks: readonly Check[];
  readonly team_roles: readonly TeamRole[];
}

export interface ApplicationQuery {
  readonly requisition_id?: string;
  readonly candidate_id?: string;
  readonly stage?: readonly Stage[];
  readonly q?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ApplicationCreate {
  readonly requisition_id: string;
  readonly candidate_id?: string;
  readonly candidate?: CandidateCreate;
  readonly source?: CandidateSource | null;
  readonly cover_note?: string | null;
}

export interface ApplicationUpdate {
  readonly cover_note?: string | null;
  readonly screening?: readonly ScreeningEntry[];
}

export interface MoveRequest {
  readonly stage: MoveStage;
  readonly rejection_reason?: RejectionReason | null;
  readonly note?: string | null;
}

export interface OfferRequest {
  readonly start_date?: string | null;
  readonly note?: string | null;
}

export interface OfferResponse {
  readonly accepted: boolean;
  readonly note?: string | null;
}

// --- interviews, scorecards, checks ---------------------------------------------------

export interface Interview {
  readonly id: string;
  readonly application_id: string;
  readonly kind: InterviewKind;
  readonly scheduled_at: string;
  readonly duration_minutes: number;
  readonly location: string | null;
  readonly interviewers: readonly UserRef[];
  readonly status: InterviewStatus;
  readonly notes: string | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface InterviewCreate {
  readonly kind: InterviewKind;
  readonly scheduled_at: string;
  readonly duration_minutes: number;
  readonly location?: string | null;
  readonly interviewer_user_ids: readonly string[];
  readonly notes?: string | null;
}

export interface InterviewUpdate {
  readonly kind?: InterviewKind;
  readonly scheduled_at?: string;
  readonly duration_minutes?: number;
  readonly location?: string | null;
  readonly status?: InterviewStatus;
  readonly notes?: string | null;
}

export interface Rating {
  readonly criterion_id: string;
  readonly rating: number;
  readonly note?: string | null;
}

export interface Scorecard {
  readonly id: string;
  readonly application_id: string;
  readonly interview_id: string | null;
  readonly author: UserRef | null;
  readonly ratings: readonly Rating[];
  readonly recommendation: Recommendation | null;
  readonly summary: string | null;
  readonly status: 'draft' | 'submitted';
  readonly submitted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly can_edit: boolean;
}

export interface ScorecardInput {
  readonly interview_id?: string | null;
  readonly ratings: readonly Rating[];
  readonly recommendation?: Recommendation | null;
  readonly summary?: string | null;
  readonly submit: boolean;
}

export interface Check {
  readonly id: string;
  readonly application_id: string;
  readonly check_type: CheckType;
  readonly required: boolean;
  readonly status: CheckStatus;
  readonly consent_obtained: boolean;
  readonly referee_name: string | null;
  readonly referee_contact: string | null;
  readonly notes: string | null;
  readonly due_at: string | null;
  readonly completed_at: string | null;
  readonly completed_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CheckCreate {
  readonly check_type: CheckType;
  readonly required: boolean;
  readonly consent_obtained: boolean;
  readonly referee_name?: string | null;
  readonly referee_contact?: string | null;
  readonly due_at?: string | null;
  readonly notes?: string | null;
}

export interface CheckUpdate {
  readonly status?: CheckStatus;
  readonly required?: boolean;
  readonly consent_obtained?: boolean;
  readonly referee_name?: string | null;
  readonly referee_contact?: string | null;
  readonly due_at?: string | null;
  readonly notes?: string | null;
}

// --- settings -------------------------------------------------------------------------

export interface RecruitmentSettingsInput {
  readonly retention_days: number;
  readonly talent_pool_days: number;
  readonly privacy_notice?: string | null;
  readonly privacy_notice_version?: string | null;
}

export interface RecruitmentSettings {
  readonly retention_days: number;
  readonly talent_pool_days: number;
  readonly privacy_notice: string | null;
  readonly privacy_notice_version: string | null;
  readonly updated_at: string | null;
  readonly check_policy: Readonly<Record<RoleRisk, readonly CheckType[]>>;
}

// --- AI assists -----------------------------------------------------------------------

export interface SuggestedQuestion {
  readonly criterion_id: string | null;
  readonly question: string;
  readonly follow_up: string | null;
}

export interface SuggestedCriterion {
  readonly label: string;
  readonly description: string | null;
}

// --- entity types ---------------------------------------------------------------------

export const ENTITY_REQUISITION = 'job_requisition';
export const ENTITY_CANDIDATE = 'candidate';
export const ENTITY_APPLICATION = 'job_application';
export const MODULE_KEY = 'recruitment';
