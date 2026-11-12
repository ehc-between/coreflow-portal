/**
 * Customer feedback and satisfaction surveys (M22), mirroring coreflow-core's
 * `app/modules/feedback/schemas.py`. Dates are ISO days (`YYYY-MM-DD`);
 * timestamps are naive UTC ISO strings.
 */
import { EntityRefDto } from '../../../core/entities/entity.models';

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
  readonly satisfaction_score: number | null;
  readonly received_on: string;
  readonly response_due_on: string | null;
  readonly overdue: boolean;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly survey_id: string | null;
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
  readonly created_by: UserRef | null;
  readonly linked_deviations: readonly EntityRefDto[];
  readonly open_tasks: number;
  readonly allowed_actions: readonly FeedbackAction[];
  readonly can_edit: boolean;
  readonly can_delete: boolean;
}

export interface FeedbackCreate {
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
  readonly customer_email?: string | null;
  readonly customer_phone?: string | null;
  readonly product_or_service?: string | null;
  readonly satisfaction_score?: number | null;
  readonly received_on?: string | null;
  readonly response_due_on?: string | null;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
}

export interface FeedbackUpdate extends Partial<FeedbackCreate> {
  readonly resolution?: string | null;
  readonly customer_informed?: boolean | null;
  readonly change_reason?: string | null;
}

export interface FeedbackActionBody {
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
  readonly overdue?: boolean;
  readonly open?: boolean;
  readonly received_from?: string;
  readonly received_to?: string;
  readonly sort?: FeedbackSort;
  readonly limit?: number;
  readonly offset?: number;
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

export interface FeedbackStats {
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
}

export interface SurveyResponseList {
  readonly items: readonly SurveyResponse[];
  readonly total: number;
}

// --- public survey (no sign-in) -------------------------------------------------------

export interface PublicSurvey {
  readonly title: string;
  readonly description: string | null;
  readonly organisation_name: string;
  readonly anonymous: boolean;
  readonly closes_on: string | null;
  readonly questions: readonly Question[];
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
