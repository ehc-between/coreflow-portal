/**
 * DTOs of the compliance obligations register API (M18 + A20, coreflow-core
 * `app/modules/obligations`). Every endpoint lives under
 * `v1/orgs/{org_id}/obligations`. Calendar dates are ISO days (`YYYY-MM-DD`),
 * timestamps naive UTC.
 */

import { EntityRefDto } from '../../../core/entities/entity.models';
import { AssigneeIn, TaskPriority } from '../../../core/tasks/task.models';

export const PERM_READ = 'obligations:read';
export const PERM_WRITE = 'obligations:write';
export const PERM_MANAGE = 'obligations:manage';
export const PERM_EVALUATE = 'obligations:evaluate';

export const ENTITY_TYPE = 'compliance_obligation';
/** One duty of an obligation (A20): linkable, evaluated on its own. */
export const DUTY_ENTITY_TYPE = 'obligation_duty';

export const OBLIGATION_TYPES = [
  'law',
  'regulation',
  'permit',
  'licence',
  'contract',
  'standard',
  'industry_code',
  'voluntary',
  'internal',
  'other',
] as const;
export type ObligationType = (typeof OBLIGATION_TYPES)[number];

export const OBLIGATION_STATUSES = ['draft', 'active', 'retired'] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

export const COMPLIANCE_STATUSES = [
  'not_evaluated',
  'compliant',
  'partially_compliant',
  'non_compliant',
  'not_applicable',
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

/** Partially + non-compliant: "not fully compliant" (the list tile and filter). */
export const NOT_FULLY_COMPLIANT: readonly ComplianceStatus[] = [
  'partially_compliant',
  'non_compliant',
];

export const EVALUATION_RESULTS = [
  'compliant',
  'partially_compliant',
  'non_compliant',
  'not_applicable',
] as const;
export type EvaluationResult = (typeof EVALUATION_RESULTS)[number];

/** Results that need findings and a follow-up (and send the `non_compliant` event). */
export const NON_COMPLIANT_RESULTS: readonly EvaluationResult[] = [
  'partially_compliant',
  'non_compliant',
];

export const IMPACTS = ['none', 'low', 'medium', 'high'] as const;
export type Impact = (typeof IMPACTS)[number];
/** Change notes of this impact (with a date) get a "prepare for the change" task. */
export const PREPARE_IMPACTS: readonly Impact[] = ['medium', 'high'];

export const CHANGE_STATUSES = ['open', 'assessed'] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export const FRAMEWORKS = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso42001',
  'iso45001',
  'gdpr',
  'eu_ai_act',
  'nis2',
] as const;
export type FrameworkKey = (typeof FRAMEWORKS)[number];

/** Where an obligation applies (stored as the code in `jurisdiction`; free text allowed). */
export const JURISDICTIONS = ['NO', 'EU', 'EEA', 'INT'] as const;

export const OBLIGATION_SORTS = [
  '-updated_at',
  '-created_at',
  'code',
  '-code',
  'title',
  '-title',
  'valid_until',
  '-valid_until',
  'last_evaluated_at',
  '-last_evaluated_at',
] as const;
export type ObligationSort = (typeof OBLIGATION_SORTS)[number];

/** Types that run out and must be renewed (a renewal task is planned before the end). */
export const RENEWABLE_TYPES: readonly ObligationType[] = ['permit', 'licence', 'contract'];
/** Default days before `valid_until` when the renewal task is due (backend default). */
export const DEFAULT_RENEWAL_LEAD_DAYS = 90;
export const MAX_RENEWAL_LEAD_DAYS = 730;
export const MAX_CLAUSE_REFS = 30;
export const MAX_EVIDENCE_REFS = 20;
export const MAX_EVIDENCE_URLS = 10;
/** Days until a follow-up action is due when no date is chosen (backend default). */
export const DEFAULT_FOLLOW_UP_DAYS = 30;

export const MAX_REQUIREMENTS = 50;
export const MAX_REQUIREMENT_CHARS = 1000;
export const MAX_EVIDENCE_ATTACHMENTS = 20;
export const DEFAULT_LEAD_DAYS = 14;

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface NextEvaluation {
  readonly task_id: string | null;
  readonly due_at: string | null;
  readonly overdue: boolean;
}

export interface ObligationListItem {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly obligation_type: ObligationType;
  readonly status: ObligationStatus;
  readonly compliance_status: ComplianceStatus;
  readonly jurisdiction: string | null;
  readonly issuer: string | null;
  readonly reference: string | null;
  /** Explicit tags plus the frameworks of `clause_refs`. */
  readonly frameworks: readonly string[];
  /** Canonical clause / article refs the obligation cites (`gdpr:30`, `iso14001:6.1.3`). */
  readonly clause_refs: readonly string[];
  readonly duty_count: number;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly valid_from: string | null;
  readonly valid_until: string | null;
  /** Renewable types: when to apply for renewal (`valid_until` − lead days). */
  readonly renewal_due_on: string | null;
  readonly renewal_due: boolean;
  /** Open and without a periodic evaluation plan (ISO 14001/45001 9.1.2). */
  readonly needs_schedule: boolean;
  readonly evaluation_rrule: string | null;
  readonly last_evaluated_at: string | null;
  readonly next_evaluation: NextEvaluation | null;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ObligationList {
  readonly items: readonly ObligationListItem[];
  readonly total: number;
}

/** One duty of an obligation, evaluated and followed up on its own. */
export interface Duty {
  readonly id: string;
  /** `OB-0002-3`. */
  readonly code: string;
  readonly position: number;
  readonly title: string;
  readonly owner: UserRef | null;
  readonly clause_refs: readonly string[];
  readonly compliance_status: ComplianceStatus;
  readonly last_evaluated_on: string | null;
  readonly last_note: string | null;
  readonly open_actions: number;
  readonly url: string;
}

export interface DutyResult {
  readonly duty_id: string;
  readonly result: EvaluationResult;
  readonly note?: string | null;
}

export interface Evaluation {
  readonly id: string;
  readonly obligation_id: string;
  readonly result: EvaluationResult;
  readonly evaluated_on: string;
  readonly evaluated_by: UserRef | null;
  readonly notes: string | null;
  readonly evidence_summary: string | null;
  readonly attachment_ids: readonly string[];
  /** Records used as evidence (only the ones the caller can read). */
  readonly evidence: readonly EntityRefDto[];
  readonly evidence_urls: readonly string[];
  readonly duty_results: readonly DutyResult[];
  readonly justification: string | null;
  readonly deviation_id: string | null;
  readonly deviation: EntityRefDto | null;
  readonly task_id: string | null;
  readonly created_at: string;
}

export interface Obligation extends ObligationListItem {
  readonly description: string | null;
  readonly applicability: string | null;
  /** Mirror of the duty texts (revisions, search). */
  readonly requirements: readonly string[];
  readonly duties: readonly Duty[];
  /** Null = the default (90 days). */
  readonly renewal_lead_days: number | null;
  readonly source_url: string | null;
  readonly evaluation_start: string | null;
  readonly evaluation_lead_days: number;
  readonly evaluation_recurrence_id: string | null;
  readonly latest_evaluation: Evaluation | null;
  readonly evaluation_count: number;
  readonly open_changes: number;
  readonly created_by: UserRef | null;
  readonly can_edit: boolean;
  readonly can_evaluate: boolean;
  readonly can_delete: boolean;
}

/** A duty in a create / update body: the full ordered list replaces the old one. */
export interface DutyIn {
  readonly id?: string | null;
  readonly title: string;
  readonly owner_user_id?: string | null;
  readonly clause_refs?: readonly string[] | null;
}

/** The writable obligation fields (create and update). */
export interface ObligationFields {
  readonly title?: string;
  readonly obligation_type?: ObligationType;
  readonly status?: ObligationStatus;
  readonly description?: string | null;
  readonly applicability?: string | null;
  readonly duties?: readonly DutyIn[] | null;
  readonly frameworks?: readonly FrameworkKey[] | null;
  readonly clause_refs?: readonly string[] | null;
  readonly renewal_lead_days?: number | null;
  readonly jurisdiction?: string | null;
  readonly issuer?: string | null;
  readonly reference?: string | null;
  readonly source_url?: string | null;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly valid_from?: string | null;
  readonly valid_until?: string | null;
  readonly evaluation_rrule?: string | null;
  readonly evaluation_start?: string | null;
  readonly evaluation_lead_days?: number | null;
}

export interface ObligationCreate extends ObligationFields {
  readonly title: string;
}

export interface ObligationUpdate extends ObligationFields {
  readonly change_reason?: string | null;
}

export interface ObligationListQuery {
  readonly q?: string;
  readonly status?: readonly ObligationStatus[];
  readonly type?: readonly ObligationType[];
  readonly compliance?: readonly ComplianceStatus[];
  readonly framework?: string;
  readonly owner?: string;
  readonly evaluation_overdue?: boolean;
  readonly expiring_within_days?: number;
  readonly without_schedule?: boolean;
  readonly renewal_due?: boolean;
  readonly clause_ref?: string;
  readonly sort?: ObligationSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ObligationSummary {
  readonly total: number;
  readonly by_status: Readonly<Record<string, number>>;
  readonly by_compliance_status: Readonly<Record<string, number>>;
  /** Partially + non-compliant open obligations. */
  readonly not_fully_compliant: number;
  readonly not_evaluated: number;
  readonly without_schedule: number;
  readonly renewal_due: number;
  readonly evaluations_overdue: number;
  readonly expiring_soon: number;
  readonly expiring_within_days: number;
  readonly open_changes: number;
}

/** `GET /clause-defaults`: what the clause picker proposes when a framework is ticked. */
export interface ClauseDefaults {
  readonly items: Readonly<Record<string, readonly string[]>>;
}

/** A follow-up action (platform task of kind `obligation_action`). */
export interface FollowUpIn {
  readonly title: string;
  readonly description?: string | null;
  readonly assignee?: AssigneeIn | null;
  readonly due_at?: string | null;
  readonly priority?: TaskPriority;
}

export interface EvidenceRefIn {
  readonly entity_type: string;
  readonly entity_id: string;
}

export interface EvaluationCreate {
  /** Optional when `duty_results` are given (then derived from them). */
  readonly result?: EvaluationResult | null;
  readonly evaluated_on?: string | null;
  readonly notes?: string | null;
  readonly evidence_summary?: string | null;
  readonly attachment_ids?: readonly string[];
  readonly evidence_refs?: readonly EvidenceRefIn[];
  readonly evidence_urls?: readonly string[];
  readonly duty_results?: readonly DutyResult[];
  readonly follow_up?: FollowUpIn | null;
  readonly deviation_id?: string | null;
  /** The deviation is created next, through the `obligation.to_deviation` flow. */
  readonly create_deviation?: boolean;
  readonly justification?: string | null;
}

export interface EvaluationCreated {
  readonly evaluation: Evaluation;
  readonly follow_up_task_id: string | null;
  readonly obligation: Obligation;
}

export interface Change {
  readonly id: string;
  readonly obligation_id: string;
  readonly noted_on: string;
  readonly effective_on: string | null;
  readonly title: string;
  readonly details: string | null;
  readonly source_url: string | null;
  readonly impact: Impact;
  readonly status: ChangeStatus;
  readonly assessment: string | null;
  readonly assessed_at: string | null;
  readonly assessed_by: UserRef | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ChangeCreate {
  readonly title: string;
  readonly details?: string | null;
  readonly source_url?: string | null;
  readonly noted_on?: string | null;
  readonly effective_on?: string | null;
  readonly impact?: Impact;
}

export interface ChangeUpdate {
  readonly title?: string;
  readonly details?: string | null;
  readonly source_url?: string | null;
  readonly noted_on?: string | null;
  readonly effective_on?: string | null;
  readonly impact?: Impact;
  readonly status?: ChangeStatus;
  readonly assessment?: string | null;
}

/** Result of the `obligations.propose_requirements` assist (nothing is written). */
export interface ProposedRequirement {
  readonly text: string;
  readonly rationale?: string | null;
}

export interface RequirementProposal {
  readonly summary?: string | null;
  readonly obligation_type?: ObligationType | null;
  readonly applicability?: string | null;
  readonly frameworks?: readonly string[];
  readonly requirements?: readonly ProposedRequirement[];
  readonly evidence?: readonly string[];
  readonly evaluation_rrule?: string | null;
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['xlsx', 'pdf', 'csv'];
