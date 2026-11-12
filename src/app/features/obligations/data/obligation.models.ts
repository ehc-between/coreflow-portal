/**
 * DTOs of the compliance obligations register API (M18, coreflow-core
 * `app/modules/obligations`). Every endpoint lives under
 * `v1/orgs/{org_id}/obligations`. Calendar dates are ISO days (`YYYY-MM-DD`),
 * timestamps naive UTC.
 */

import { AssigneeIn, TaskPriority } from '../../../core/tasks/task.models';

export const PERM_READ = 'obligations:read';
export const PERM_WRITE = 'obligations:write';
export const PERM_MANAGE = 'obligations:manage';
export const PERM_EVALUATE = 'obligations:evaluate';

export const ENTITY_TYPE = 'compliance_obligation';

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

export const EVALUATION_RESULTS = [
  'compliant',
  'partially_compliant',
  'non_compliant',
  'not_applicable',
] as const;
export type EvaluationResult = (typeof EVALUATION_RESULTS)[number];

/** Results that call for a follow-up action (and send the `non_compliant` event). */
export const NON_COMPLIANT_RESULTS: readonly EvaluationResult[] = [
  'partially_compliant',
  'non_compliant',
];

export const IMPACTS = ['none', 'low', 'medium', 'high'] as const;
export type Impact = (typeof IMPACTS)[number];

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
  readonly frameworks: readonly string[];
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly valid_from: string | null;
  readonly valid_until: string | null;
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

export interface Evaluation {
  readonly id: string;
  readonly obligation_id: string;
  readonly result: EvaluationResult;
  readonly evaluated_on: string;
  readonly evaluated_by: UserRef | null;
  readonly notes: string | null;
  readonly evidence_summary: string | null;
  readonly attachment_ids: readonly string[];
  readonly task_id: string | null;
  readonly created_at: string;
}

export interface Obligation extends ObligationListItem {
  readonly description: string | null;
  readonly applicability: string | null;
  readonly requirements: readonly string[];
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

/** The writable obligation fields (create and update). */
export interface ObligationFields {
  readonly title?: string;
  readonly obligation_type?: ObligationType;
  readonly status?: ObligationStatus;
  readonly description?: string | null;
  readonly applicability?: string | null;
  readonly requirements?: readonly string[] | null;
  readonly frameworks?: readonly FrameworkKey[] | null;
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
  readonly sort?: ObligationSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ObligationSummary {
  readonly total: number;
  readonly by_status: Readonly<Record<string, number>>;
  readonly by_compliance_status: Readonly<Record<string, number>>;
  readonly evaluations_overdue: number;
  readonly expiring_soon: number;
  readonly expiring_within_days: number;
  readonly open_changes: number;
}

/** A follow-up action (platform task of kind `obligation_action`). */
export interface FollowUpIn {
  readonly title: string;
  readonly description?: string | null;
  readonly assignee?: AssigneeIn | null;
  readonly due_at?: string | null;
  readonly priority?: TaskPriority;
}

export interface EvaluationCreate {
  readonly result: EvaluationResult;
  readonly evaluated_on?: string | null;
  readonly notes?: string | null;
  readonly evidence_summary?: string | null;
  readonly attachment_ids?: readonly string[];
  readonly follow_up?: FollowUpIn | null;
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
