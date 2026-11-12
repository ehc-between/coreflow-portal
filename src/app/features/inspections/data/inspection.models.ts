/**
 * Inspections and checklists (M05) DTOs, mirroring coreflow-core
 * `app/modules/inspections/schemas.py` and `questions.py`. Every route lives under
 * `v1/orgs/{org_id}/inspections`. Datetimes are naive UTC ISO strings.
 */

export const INSPECTIONS_MODULE = 'inspections';
export const TEMPLATE_ENTITY_TYPE = 'checklist_template';
export const INSPECTION_ENTITY_TYPE = 'inspection';
export const FINDING_ENTITY_TYPE = 'inspection_finding';

export const TEMPLATE_STATUSES = ['draft', 'active', 'archived'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const INSPECTION_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_RESULTS = ['passed', 'failed'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FINDING_STATUSES = ['open', 'closed'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const QUESTION_TYPES = ['yes_no', 'score', 'number', 'text', 'photo', 'signature'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Types that can be marked not applicable (when `allow_na`) and are scored. */
export const NA_TYPES: readonly QuestionType[] = ['yes_no', 'score', 'number'];

export const TEMPLATE_SORTS = ['title', '-updated_at', '-created_at', 'code'] as const;
export type TemplateSort = (typeof TEMPLATE_SORTS)[number];

export const INSPECTION_SORTS = [
  'due_at',
  '-due_at',
  '-created_at',
  '-completed_at',
  'code',
] as const;
export type InspectionSort = (typeof INSPECTION_SORTS)[number];

export const FINDING_SORTS = ['-created_at', 'due_at', 'severity', 'code'] as const;
export type FindingSort = (typeof FINDING_SORTS)[number];

/** Suggested template categories (free text on the server; these get translated labels). */
export const TEMPLATE_CATEGORIES = [
  'safety',
  'quality',
  'environment',
  'security',
  'other',
] as const;

export const LIBRARY_KEYS = [
  'safety_walk',
  'fire_safety',
  'environmental_site',
  'five_s',
  'infosec_walkthrough',
] as const;

export type Lang = 'en' | 'nb';

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

// --- questions ---------------------------------------------------------------------

export interface Question {
  readonly id: string;
  readonly section: string | null;
  readonly text: string;
  readonly help: string | null;
  readonly type: QuestionType;
  readonly required: boolean;
  readonly weight: number;
  readonly allow_na: boolean;
  readonly fail_answer: 'yes' | 'no';
  readonly scale_min: number;
  readonly scale_max: number;
  readonly pass_score: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly unit: string | null;
  readonly finding_on_fail: boolean;
  readonly finding_severity: Severity;
  readonly clause_refs: readonly string[];
}

/** A question as sent to the server (`id` is generated when omitted). */
export type QuestionInput = Omit<Question, 'id'> & { readonly id?: string | null };

// --- templates ---------------------------------------------------------------------

export interface Template {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly frameworks: readonly string[];
  readonly status: TemplateStatus;
  readonly version: number;
  readonly question_count: number;
  readonly pass_threshold: number | null;
  readonly auto_deviation: boolean;
  readonly deviation_type_id: string | null;
  readonly library_key: string | null;
  readonly published_at: string | null;
  readonly created_by: UserRef | null;
  readonly updated_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface TemplateDetail extends Template {
  readonly questions: readonly Question[];
  readonly inspection_count: number;
}

export interface TemplateListQuery {
  readonly q?: string;
  readonly status?: readonly TemplateStatus[];
  readonly category?: string;
  readonly framework?: string;
  readonly sort?: TemplateSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface TemplateFields {
  readonly title: string;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly frameworks?: readonly string[];
  readonly questions?: readonly QuestionInput[];
  readonly pass_threshold?: number | null;
  readonly auto_deviation?: boolean;
  readonly deviation_type_id?: string | null;
  readonly change_reason?: string | null;
}

export interface CreateTemplateRequest extends TemplateFields {
  readonly status?: 'draft' | 'active';
}

export type UpdateTemplateRequest = Partial<TemplateFields>;

export interface LibraryItem {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly frameworks: readonly string[];
  readonly question_count: number;
  readonly pass_threshold: number | null;
}

export interface LibraryDetail extends LibraryItem {
  readonly questions: readonly Question[];
}

// --- inspections -------------------------------------------------------------------

export interface TemplateRef {
  readonly id: string;
  readonly title: string | null;
  readonly version: number;
}

export interface Inspection {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly status: InspectionStatus;
  readonly result: InspectionResult | null;
  readonly template: TemplateRef | null;
  readonly schedule_id: string | null;
  readonly location: string | null;
  readonly inspector: UserRef | null;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly due_at: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly completed_by: UserRef | null;
  readonly score_earned: number | null;
  readonly score_possible: number | null;
  readonly score_pct: number | null;
  readonly pass_threshold: number | null;
  readonly is_overdue: boolean;
  readonly question_count: number;
  readonly required_count: number;
  readonly answered_count: number;
  readonly failed_count: number;
  readonly finding_count: number;
  readonly open_finding_count: number;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface Signature {
  readonly name: string;
  readonly image?: string | null;
  readonly signed_at?: string | null;
  readonly user_id?: string | null;
}

/** Answer values: yes_no "yes"|"no"; score integer; number; text; signature {name, image?}. */
export type AnswerValue = string | number | Signature | null;

export interface InspectionResponse {
  readonly question_id: string;
  readonly value: AnswerValue;
  readonly is_na: boolean;
  readonly note: string | null;
  readonly attachment_ids: readonly string[];
  readonly failed: boolean;
  readonly score_earned: number | null;
  readonly score_possible: number | null;
  readonly answered_by: UserRef | null;
  readonly answered_at: string;
}

export interface InspectionPermissions {
  readonly can_edit: boolean;
  readonly can_perform: boolean;
  readonly can_manage: boolean;
}

export interface InspectionDetail extends Inspection {
  readonly notes: string | null;
  readonly summary: string | null;
  readonly signature: Signature | null;
  readonly cancel_reason: string | null;
  readonly auto_deviation: boolean;
  readonly deviation_type_id: string | null;
  readonly questions: readonly Question[];
  readonly responses: readonly InspectionResponse[];
  readonly findings: readonly Finding[];
  readonly permissions: InspectionPermissions;
}

export interface InspectionListQuery {
  readonly q?: string;
  readonly status?: readonly InspectionStatus[];
  readonly template_id?: string;
  readonly schedule_id?: string;
  readonly inspector?: string;
  readonly result?: InspectionResult;
  readonly due_before?: string;
  readonly due_after?: string;
  readonly overdue?: boolean;
  readonly sort?: InspectionSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface InspectionFields {
  readonly title?: string | null;
  readonly location?: string | null;
  readonly notes?: string | null;
  readonly inspector_user_id?: string | null;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly due_at?: string | null;
}

export interface CreateInspectionRequest extends InspectionFields {
  readonly template_id: string;
}

export interface UpdateInspectionRequest extends InspectionFields {
  readonly change_reason?: string | null;
}

export interface AnswerInput {
  readonly question_id: string;
  readonly value?: AnswerValue;
  readonly is_na?: boolean;
  readonly note?: string | null;
  readonly attachment_ids?: readonly string[];
  readonly clear?: boolean;
}

export interface CompleteRequest {
  readonly responses?: readonly AnswerInput[];
  readonly summary?: string | null;
  readonly signature?: { readonly name: string; readonly image?: string | null } | null;
}

export interface InspectionStats {
  readonly by_status: Readonly<Partial<Record<InspectionStatus, number>>>;
  readonly overdue: number;
  readonly passed: number;
  readonly failed: number;
  readonly average_score_pct: number | null;
  readonly open_findings: number;
}

// --- findings ----------------------------------------------------------------------

export interface DeviationRef {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly url: string;
}

export interface Finding {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly inspection: {
    readonly id: string;
    readonly code: string;
    readonly title: string;
  } | null;
  readonly question_id: string | null;
  readonly question_text: string | null;
  readonly source: 'auto' | 'manual';
  readonly title: string;
  readonly description: string | null;
  readonly severity: Severity;
  readonly status: FindingStatus;
  readonly owner: UserRef | null;
  readonly due_at: string | null;
  readonly is_overdue: boolean;
  readonly deviation: DeviationRef | null;
  readonly closed_at: string | null;
  readonly closed_by: UserRef | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface FindingListQuery {
  readonly inspection_id?: string;
  readonly status?: readonly FindingStatus[];
  readonly severity?: readonly Severity[];
  readonly owner?: string;
  readonly has_deviation?: boolean;
  readonly q?: string;
  readonly sort?: FindingSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface FindingAssignee {
  readonly type: 'user' | 'role' | 'department';
  readonly value: string;
}

export interface ActionRequest {
  readonly title: string;
  readonly description?: string | null;
  readonly assignee?: FindingAssignee | null;
  readonly due_at?: string | null;
}

export interface CreateFindingRequest {
  readonly title: string;
  readonly description?: string | null;
  readonly severity?: Severity;
  readonly question_id?: string | null;
  readonly owner_user_id?: string | null;
  readonly due_at?: string | null;
  readonly action?: Partial<ActionRequest> | null;
  readonly raise_deviation?: boolean;
  readonly deviation_type_id?: string | null;
}

export interface UpdateFindingRequest {
  readonly title?: string;
  readonly description?: string | null;
  readonly severity?: Severity;
  readonly owner_user_id?: string | null;
  readonly due_at?: string | null;
}

export interface ActionCreated {
  readonly task_id: string;
  readonly url: string;
}

// --- schedules ---------------------------------------------------------------------

export interface Schedule {
  readonly id: string;
  readonly org_id: string;
  readonly template: {
    readonly id: string;
    readonly code: string;
    readonly title: string;
    readonly status: TemplateStatus;
  } | null;
  readonly title: string | null;
  readonly location: string | null;
  readonly inspector: UserRef | null;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly rrule: string;
  readonly dtstart: string;
  readonly lead_days: number;
  readonly next_due_at: string | null;
  readonly active: boolean;
  readonly open_inspection_id: string | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ScheduleListQuery {
  readonly template_id?: string;
  readonly active?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ScheduleFields {
  readonly rrule: string;
  readonly dtstart: string;
  readonly lead_days?: number;
  readonly title?: string | null;
  readonly location?: string | null;
  readonly inspector_user_id?: string | null;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly active?: boolean;
}

export interface CreateScheduleRequest extends ScheduleFields {
  readonly template_id: string;
}

export type UpdateScheduleRequest = Partial<ScheduleFields>;

// --- AI ----------------------------------------------------------------------------

export const ASSIST_GENERATE_CHECKLIST = 'inspections.generate_checklist';
export const ASSIST_SUMMARISE_RESULTS = 'inspections.summarise_results';
export const ASSIST_SUGGEST_ACTIONS = 'inspections.suggest_actions';

/** `inspections.generate_checklist` result data (nothing is saved). */
export interface GeneratedChecklist {
  readonly title?: string;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly pass_threshold?: number | null;
  readonly questions?: readonly Partial<Question>[];
}
