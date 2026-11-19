/**
 * Customer feedback and satisfaction surveys (M22), mirroring coreflow-core's
 * `app/modules/feedback/schemas.py`. Dates are ISO days (`YYYY-MM-DD`);
 * timestamps are naive UTC ISO strings.
 */
import { EntityRefDto } from '../../../core/entities/entity.models';
import type { CustomerRef } from '../../../shared/customers';

export const PERM_READ = 'feedback:read';
export const PERM_WRITE = 'feedback:write';
export const PERM_MANAGE = 'feedback:manage';

export const FEEDBACK_ENTITY = 'customer_feedback';
export const SURVEY_ENTITY = 'survey';

export const FEEDBACK_KINDS = [
  'complaint',
  'compliment',
  'suggestion',
  'inquiry',
  'other',
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_CHANNELS = [
  'email',
  'phone',
  'web',
  'in_person',
  'survey',
  'social',
  'other',
] as const;
export type FeedbackChannel = (typeof FEEDBACK_CHANNELS)[number];

export const FEEDBACK_STATUSES = [
  'new',
  'acknowledged',
  'in_progress',
  'resolved',
  'closed',
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
/** Statuses that still need work. */
export const OPEN_FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  'new',
  'acknowledged',
  'in_progress',
];

export const FEEDBACK_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

export const FEEDBACK_SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
export type FeedbackSentiment = (typeof FEEDBACK_SENTIMENTS)[number];

/** Where a record came from (derived by the backend, not stored). */
export const FEEDBACK_SOURCES = ['manual', 'survey', 'public_form'] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

/** "Ubesvart > 14 dager": open, the customer not informed, received this many days ago. */
export const UNANSWERED_DAYS = 14;

export const FEEDBACK_ACTIONS = ['acknowledge', 'start', 'resolve', 'close', 'reopen'] as const;
export type FeedbackAction = (typeof FEEDBACK_ACTIONS)[number];

export const FEEDBACK_SORTS = [
  '-updated_at',
  '-created_at',
  '-received_on',
  'received_on',
  'response_due_on',
  '-response_due_on',
  'code',
  '-code',
  'title',
  '-title',
] as const;
export type FeedbackSort = (typeof FEEDBACK_SORTS)[number];

/** Records feedback can be about (written as `relates_to` links, listed on both pages). */
export const SUBJECT_TYPES = [
  'supplier',
  'contract',
  'process',
  'asset',
  'interested_party',
  'project',
  'ai_system',
] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];
export const MAX_SUBJECTS = 20;

/** How a reply reached the customer. */
export const REPLY_CHANNELS = ['email', 'phone', 'letter', 'in_person', 'web', 'other'] as const;
export type ReplyChannel = (typeof REPLY_CHANNELS)[number];

/** What a sound complaint record still lacks (`assessment_gaps`). */
export const ASSESSMENT_GAPS = ['assessment', 'root_cause', 'deviation', 'reply'] as const;
export type AssessmentGap = (typeof ASSESSMENT_GAPS)[number];

export const EXPORT_FORMATS = ['xlsx', 'csv', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const SURVEY_LANGUAGES = ['nb', 'en'] as const;
export type SurveyLanguage = (typeof SURVEY_LANGUAGES)[number];

export const SURVEY_STATUSES = ['draft', 'open', 'closed'] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export const SURVEY_ACTIONS = ['publish', 'close', 'reopen'] as const;
export type SurveyAction = (typeof SURVEY_ACTIONS)[number];

export const SURVEY_SORTS = [
  '-updated_at',
  '-created_at',
  'code',
  '-code',
  'title',
  '-title',
] as const;
export type SurveySort = (typeof SURVEY_SORTS)[number];

export const QUESTION_TYPES = [
  'rating',
  'nps',
  'single_choice',
  'multi_choice',
  'yes_no',
  'text',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface DepartmentRef {
  readonly id: string;
  readonly name: string;
}

/** A related record sent on create / update (`subjects`). */
export interface SubjectIn {
  readonly entity_type: SubjectType;
  readonly entity_id: string;
}

/** The four complaint assessment fields (asked for in the resolve dialog). */
export interface ComplaintAssessment {
  readonly complaint_justified?: boolean | null;
  readonly root_cause?: string | null;
  readonly corrective_action_required?: boolean | null;
  readonly customer_accepted?: boolean | null;
}

// --- customer feedback -----------------------------------------------------------------

export interface FeedbackListItem {
  readonly id: string;
  readonly code: string;
  readonly kind: FeedbackKind;
  readonly channel: FeedbackChannel;
  readonly status: FeedbackStatus;
  readonly severity: FeedbackSeverity | null;
  readonly sentiment: FeedbackSentiment | null;
  readonly title: string;
  readonly category: string | null;
  readonly tags: readonly string[];
  readonly customer_name: string | null;
  readonly customer_organisation: string | null;
  /** The customer (customer register); name / e-mail / phone are the contact person. */
  readonly customer_id?: string | null;
  readonly customer?: CustomerRef | null;
  readonly satisfaction_score: number | null;
  readonly received_on: string;
  readonly response_due_on: string | null;
  readonly overdue: boolean;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly department?: DepartmentRef | null;
  readonly survey_id: string | null;
  /** Kilde: manual, survey (answer or survey channel) or public_form. */
  readonly source?: FeedbackSource;
  readonly customer_informed?: boolean;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface FeedbackList {
  readonly items: readonly FeedbackListItem[];
  readonly total: number;
}

export interface Feedback extends FeedbackListItem {
  readonly description: string | null;
  readonly customer_email: string | null;
  readonly customer_phone: string | null;
  readonly product_or_service: string | null;
  readonly resolution: string | null;
  readonly customer_informed: boolean;
  readonly acknowledged_at: string | null;
  readonly resolved_at: string | null;
  readonly closed_at: string | null;
  readonly survey_response_id: string | null;
  readonly survey?: EntityRefDto | null;
  readonly created_by: UserRef | null;
  readonly complaint_justified: boolean | null;
  readonly root_cause: string | null;
  readonly corrective_action_required: boolean | null;
  readonly customer_accepted: boolean | null;
  readonly assessment_gaps: readonly AssessmentGap[];
  readonly linked_deviations: readonly EntityRefDto[];
  readonly subjects: readonly EntityRefDto[];
  readonly replies: readonly Reply[];
  readonly open_tasks: number;
  readonly allowed_actions: readonly FeedbackAction[];
  /** The one recommended next step (the page's primary button). */
  readonly next_action: FeedbackAction | null;
  readonly can_edit: boolean;
  readonly can_delete: boolean;
}

export interface FeedbackCreate extends ComplaintAssessment {
  readonly kind: FeedbackKind;
  readonly title: string;
  readonly description?: string | null;
  readonly channel?: FeedbackChannel;
  readonly severity?: FeedbackSeverity | null;
  readonly sentiment?: FeedbackSentiment | null;
  readonly category?: string | null;
  readonly tags?: readonly string[];
  readonly customer_name?: string | null;
  readonly customer_organisation?: string | null;
  readonly customer_id?: string | null;
  readonly customer_email?: string | null;
  readonly customer_phone?: string | null;
  readonly product_or_service?: string | null;
  readonly satisfaction_score?: number | null;
  readonly received_on?: string | null;
  readonly response_due_on?: string | null;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  /** Related records; on update the full set (links left out are removed). */
  readonly subjects?: readonly SubjectIn[];
}

export interface FeedbackUpdate extends Partial<FeedbackCreate> {
  readonly resolution?: string | null;
  readonly customer_informed?: boolean | null;
  readonly change_reason?: string | null;
}

export interface FeedbackActionBody extends ComplaintAssessment {
  readonly resolution?: string | null;
  readonly customer_informed?: boolean | null;
  readonly note?: string | null;
}

export interface FeedbackListQuery {
  readonly q?: string;
  readonly kind?: readonly FeedbackKind[];
  readonly status?: readonly FeedbackStatus[];
  readonly channel?: readonly FeedbackChannel[];
  readonly owner?: string;
  readonly survey_id?: string;
  readonly severity?: readonly FeedbackSeverity[];
  readonly department_id?: string;
  readonly customer_id?: string;
  readonly category?: string;
  readonly justified?: boolean;
  readonly overdue?: boolean;
  readonly open?: boolean;
  readonly received_from?: string;
  readonly received_to?: string;
  readonly sentiment?: readonly FeedbackSentiment[];
  readonly source?: readonly FeedbackSource[];
  /** Open, customer not informed, received at least this many days ago. */
  readonly unanswered_days?: number;
  /** Complaint assessed: `complaint_justified` is set (the stats' "Vurdert"). */
  readonly assessed?: boolean;
  /** A reply is logged or the customer marked informed (the stats' "Svar logget"). */
  readonly replied?: boolean;
  readonly sort?: FeedbackSort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- replies, settings, categories -----------------------------------------------------

/** A reply sent to the customer (the reply log). */
export interface Reply {
  readonly id: string;
  readonly sent_on: string;
  readonly channel: ReplyChannel;
  readonly body: string;
  readonly created_by: UserRef | null;
  readonly created_at: string;
}

export interface ReplyCreate {
  readonly sent_on?: string | null;
  readonly channel: ReplyChannel;
  readonly body: string;
}

export interface ReplyList {
  readonly items: readonly Reply[];
}

/** Default response time in days per kind; `null` = no default deadline. */
export type ResponseDays = Readonly<Record<FeedbackKind, number | null>>;

export interface FeedbackSettings {
  readonly response_days: ResponseDays;
  readonly working_days: boolean;
  readonly privacy_notice_url: string | null;
  readonly updated_at?: string | null;
  readonly is_default?: boolean;
}

export interface CategoryCount {
  readonly value: string;
  readonly count: number;
}

export interface CategoryList {
  readonly items: readonly CategoryCount[];
}

export interface ResponseDue {
  readonly kind: FeedbackKind;
  readonly received_on: string;
  readonly days: number | null;
  readonly working_days: boolean;
  readonly response_due_on: string | null;
}

export interface DeviationLinks {
  readonly items: readonly EntityRefDto[];
}

export interface MonthlyStat {
  readonly month: string;
  readonly total: number;
  readonly complaints: number;
  readonly compliments: number;
  readonly average_satisfaction: number | null;
}

/**
 * The register's KPI band: all-time counts, each equal to the total of the list it
 * opens (`open` → ?open=true, `complaints` → ?kind=complaint, `unanswered` →
 * ?unanswered_days=14, `complaint_deviations` → the cross-listing).
 */
export interface FeedbackKpiBand {
  readonly open: number;
  readonly complaints: number;
  readonly complaint_deviations: number;
  readonly unanswered: number;
  readonly unanswered_days: number;
  /** An average: no list behind it. */
  readonly average_satisfaction: number | null;
}

export interface FeedbackStats {
  readonly band?: FeedbackKpiBand | null;
  /** Counted for the stats period. */
  readonly by_source?: Readonly<Record<string, number>>;
  readonly from_date: string;
  readonly to_date: string;
  readonly total: number;
  readonly by_kind: Readonly<Record<string, number>>;
  readonly by_status: Readonly<Record<string, number>>;
  readonly by_channel: Readonly<Record<string, number>>;
  readonly by_sentiment: Readonly<Record<string, number>>;
  readonly open_complaints: number;
  readonly overdue: number;
  readonly average_satisfaction: number | null;
  readonly satisfaction_count: number;
  readonly average_days_to_resolve: number | null;
  readonly monthly: readonly MonthlyStat[];
  readonly survey_responses: number;
  readonly survey_average_score: number | null;
  readonly nps: number | null;
  readonly nps_responses?: number;
  readonly by_category?: Readonly<Record<string, number>>;
  readonly complaints?: number;
  readonly complaints_justified?: number;
  readonly complaints_assessed?: number;
  readonly complaints_replied?: number;
}

// --- surveys ----------------------------------------------------------------------------

export interface Question {
  readonly id: string;
  readonly type: QuestionType;
  readonly label: string;
  readonly help?: string | null;
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly scale?: number | null;
}

/** A question as sent to the API (`id` is assigned by the server when missing). */
export interface QuestionIn {
  readonly id?: string | null;
  readonly type: QuestionType;
  readonly label: string;
  readonly help?: string | null;
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly scale?: number | null;
}

export interface SurveyListItem {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: SurveyStatus;
  readonly anonymous: boolean;
  readonly question_count: number;
  readonly response_count: number;
  readonly average_score: number | null;
  readonly last_response_at: string | null;
  readonly opens_on: string | null;
  readonly closes_on: string | null;
  readonly owner: UserRef | null;
  readonly language?: SurveyLanguage | null;
  /** The one customer the survey is sent to (optional; customer register). */
  readonly customer_id?: string | null;
  readonly customer?: CustomerRef | null;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface SurveyList {
  readonly items: readonly SurveyListItem[];
  readonly total: number;
}

export interface Survey extends SurveyListItem {
  readonly description: string | null;
  readonly questions: readonly Question[];
  readonly thank_you_message: string | null;
  readonly low_score_threshold: number | null;
  readonly public_token: string;
  readonly public_path: string;
  readonly accepting_responses: boolean;
  readonly published_at: string | null;
  readonly closed_at: string | null;
  readonly created_by: UserRef | null;
  readonly allowed_actions: readonly SurveyAction[];
  readonly can_edit: boolean;
  readonly questions_locked: boolean;
  /** Feedback records created from low-score responses. */
  readonly follow_ups?: number;
  readonly open_tasks?: number;
}

export interface SurveyCreate {
  readonly title: string;
  readonly description?: string | null;
  readonly questions?: readonly QuestionIn[];
  readonly anonymous?: boolean;
  readonly thank_you_message?: string | null;
  readonly opens_on?: string | null;
  readonly closes_on?: string | null;
  readonly low_score_threshold?: number | null;
  readonly owner_user_id?: string | null;
  readonly language?: SurveyLanguage | null;
  readonly customer_id?: string | null;
}

export interface SurveyUpdate extends Partial<SurveyCreate> {
  readonly change_reason?: string | null;
}

export interface SurveyListQuery {
  readonly q?: string;
  readonly status?: readonly SurveyStatus[];
  readonly sort?: SurveySort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface QuestionResult {
  readonly id: string;
  readonly type: QuestionType;
  readonly label: string;
  readonly answered: number;
  readonly average: number | null;
  readonly distribution: Readonly<Record<string, number>>;
  readonly nps: number | null;
  readonly comments: readonly string[];
}

export interface SurveyResults {
  readonly survey_id: string;
  readonly response_count: number;
  readonly average_score: number | null;
  readonly nps: number | null;
  readonly promoters: number;
  readonly passives: number;
  readonly detractors: number;
  readonly first_response_at: string | null;
  readonly last_response_at: string | null;
  readonly questions: readonly QuestionResult[];
}

export type AnswerValue = number | boolean | string | readonly string[];

export interface SurveyResponse {
  readonly id: string;
  readonly submitted_at: string;
  readonly answers: Readonly<Record<string, unknown>>;
  readonly score: number | null;
  readonly nps: number | null;
  readonly respondent_name: string | null;
  readonly respondent_email: string | null;
  readonly feedback_id: string | null;
  readonly feedback_code?: string | null;
  /** At or under the survey's follow-up threshold. */
  readonly low_score?: boolean;
  /** The free-text answers joined, or null. */
  readonly comment?: string | null;
  /** The survey the answer belongs to (named in the cross-survey answers list). */
  readonly survey_id?: string | null;
  readonly survey_code?: string | null;
  readonly survey_title?: string | null;
}

export interface SurveyResponseList {
  readonly items: readonly SurveyResponse[];
  readonly total: number;
  readonly low_score_threshold?: number | null;
}

export interface SurveyResponseQuery {
  readonly q?: string;
  /** Only answers at or under the threshold. */
  readonly low?: boolean;
  readonly has_feedback?: boolean;
  /** With `value`: answers that gave this results distribution key to the question. */
  readonly question_id?: string;
  readonly value?: string;
  /** The response-level NPS group (the results' promoters / passives / detractors). */
  readonly nps_group?: NpsGroup;
  /** Inclusive days (the stats period). */
  readonly submitted_from?: string;
  readonly submitted_to?: string;
  /** Cross-survey list only: one survey. */
  readonly survey_id?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export const NPS_GROUPS = ['promoter', 'passive', 'detractor'] as const;
export type NpsGroup = (typeof NPS_GROUPS)[number];

/** `POST surveys/{id}/responses/{rid}/feedback`: turn one answer into a feedback record. */
export interface ResponseToFeedback {
  readonly kind?: FeedbackKind;
  readonly title?: string;
}

// --- bulk changes and the complaint cross-listing --------------------------------------

/** `POST items/bulk`: leave `owner_user_id` out to keep owners; null unassigns. */
export interface FeedbackBulk {
  readonly ids: readonly string[];
  readonly action?: FeedbackAction;
  readonly owner_user_id?: string | null;
  readonly note?: string;
}

export interface FeedbackBulkFailure {
  readonly id: string;
  readonly code: string | null;
  /** The code the single-record call would answer (`invalid_transition`, …). */
  readonly error: string;
}

export interface FeedbackBulkResult {
  readonly updated: readonly string[];
  readonly failed: readonly FeedbackBulkFailure[];
}

export interface LinkedFeedbackRef {
  readonly id: string;
  readonly code: string;
  readonly url: string;
}

/** A deviation of a customer-complaint type (KLG-*), cross-listed with the complaints. */
export interface ComplaintDeviation {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly type_name: string;
  readonly status: string;
  readonly status_category: string;
  readonly severity: string | null;
  readonly raised_at: string;
  readonly due_at: string | null;
  readonly overdue: boolean;
  readonly owner: UserRef | null;
  readonly url: string;
  readonly linked_feedback: readonly LinkedFeedbackRef[];
}

/** `available` is false when the caller cannot read deviations or the module is off. */
export interface ComplaintDeviationList {
  readonly available: boolean;
  readonly items: readonly ComplaintDeviation[];
  readonly total: number;
}

export interface ComplaintDeviationQuery {
  readonly q?: string;
  readonly open?: boolean;
  readonly unlinked_only?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

// --- public survey (no sign-in) -------------------------------------------------------

export interface PublicSurvey {
  readonly title: string;
  readonly description: string | null;
  readonly organisation_name: string;
  readonly anonymous: boolean;
  readonly closes_on: string | null;
  readonly questions: readonly Question[];
  /** The page language (the survey's own, else nb). */
  readonly language?: SurveyLanguage;
  /** Names / e-mails are collected (the survey is not anonymous). */
  readonly collects_contact?: boolean;
  /** The data controller (the organisation). */
  readonly controller_name?: string;
  readonly privacy_notice_url?: string | null;
}

export interface PublicResponseIn {
  readonly answers: Readonly<Record<string, AnswerValue>>;
  readonly respondent_name?: string | null;
  readonly respondent_email?: string | null;
}

export interface PublicResponseOut {
  readonly thank_you_message: string | null;
}

// --- AI assists ----------------------------------------------------------------------

export interface FeedbackTheme {
  readonly title: string;
  readonly description: string;
  readonly sentiment: FeedbackSentiment | null;
  readonly count: number;
  readonly example_codes: readonly string[];
}

/** `feedback.themes` assist output. */
export interface ThemesResult {
  readonly summary: string;
  readonly themes: readonly FeedbackTheme[];
  readonly trends: readonly string[];
  readonly recommendations: readonly string[];
}
