/**
 * M06 audit management DTOs, mirroring coreflow-core `app/modules/audits/schemas.py`.
 * All paths live under `v1/orgs/{org_id}/audits`. Datetimes are naive UTC ISO strings.
 */
import { EntityRefDto } from '../../../core/entities/entity.models';
import { Task } from '../../../core/tasks/task.models';

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
export type Framework = (typeof FRAMEWORKS)[number];

export const PROGRAMME_STATUSES = ['draft', 'approved', 'closed'] as const;
export type ProgrammeStatus = (typeof PROGRAMME_STATUSES)[number];
export const PROGRAMME_ACTIONS = ['approve', 'close', 'reopen'] as const;
export type ProgrammeAction = (typeof PROGRAMME_ACTIONS)[number];

export const PLAN_KINDS = ['internal', 'external'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];
export const EXTERNAL_PARTY_TYPES = [
  'certification_body',
  'customer',
  'supplier',
  'regulator',
  'other',
] as const;
export type ExternalPartyType = (typeof EXTERNAL_PARTY_TYPES)[number];
export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export const PLAN_STATUSES = [
  'planned',
  'in_progress',
  'reporting',
  'report_review',
  'closed',
  'cancelled',
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const PLAN_ACTIONS = [
  'start',
  'finish_fieldwork',
  'submit_report',
  'approve_report',
  'reject_report',
  'cancel',
  'reopen',
] as const;
export type PlanAction = (typeof PLAN_ACTIONS)[number];
export const PLAN_SORTS = ['planned_start', '-planned_start', '-created_at', 'code'] as const;
export type PlanSort = (typeof PLAN_SORTS)[number];

export const AUDITOR_ROLES = ['lead', 'auditor', 'observer', 'technical_expert'] as const;
export type AuditorRole = (typeof AUDITOR_ROLES)[number];
export const AUDITOR_ISSUES = [
  'competence_no_profile',
  'competence_inactive',
  'competence_expired',
  'competence_framework_missing',
  'competence_not_lead',
  'independence_own_department',
  'independence_department_lead',
] as const;

export const CHECKLIST_RESULTS = [
  'unanswered',
  'conforming',
  'nonconforming',
  'observation',
  'not_applicable',
] as const;
export type ChecklistResult = (typeof CHECKLIST_RESULTS)[number];
export const CHECKLIST_SOURCES = ['manual', 'generated', 'ai'] as const;

export const FINDING_TYPES = ['major_nc', 'minor_nc', 'observation', 'ofi'] as const;
export type FindingType = (typeof FINDING_TYPES)[number];
export const NC_TYPES: readonly FindingType[] = ['major_nc', 'minor_nc'];
export const FINDING_STATUSES = [
  'open',
  'in_progress',
  'pending_verification',
  'closed',
  'cancelled',
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export const FINDING_OPEN_STATUSES: readonly FindingStatus[] = [
  'open',
  'in_progress',
  'pending_verification',
];
export const FINDING_ACTIONS = [
  'start',
  'submit',
  'verify',
  'reject',
  'close',
  'cancel',
  'reopen',
] as const;
export type FindingAction = (typeof FINDING_ACTIONS)[number];
export const FINDING_SORTS = ['severity', 'due', '-created_at', 'code'] as const;
export type FindingSort = (typeof FINDING_SORTS)[number];

export const CERTIFICATION_STATUSES = [
  'planned',
  'in_progress',
  'certified',
  'suspended',
  'withdrawn',
  'expired',
] as const;
export type CertificationStatus = (typeof CERTIFICATION_STATUSES)[number];

/** Transitions that need a reason (the backend answers 422 `reason_required` without one). */
export const REASON_REQUIRED: ReadonlySet<string> = new Set([
  'programme:reopen',
  'plan:reject_report',
  'plan:cancel',
  'plan:reopen',
  'finding:reject',
  'finding:cancel',
  'finding:reopen',
]);

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface RecordRef {
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
}

export interface ListResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface PageQuery {
  readonly limit?: number;
  readonly offset?: number;
}

// --- programmes ------------------------------------------------------------------

export interface PlanSummary {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly kind: PlanKind;
  readonly status: PlanStatus;
  readonly risk_level: RiskLevel;
  readonly planned_start: string | null;
  readonly planned_end: string | null;
  readonly lead_auditor: UserRef | null;
  readonly url: string;
}

export interface Programme {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly year: number;
  readonly title: string;
  readonly description: string | null;
  readonly objectives: string | null;
  readonly risk_basis: string | null;
  readonly frameworks: readonly string[];
  readonly status: ProgrammeStatus;
  readonly owner: UserRef | null;
  readonly approved_by: UserRef | null;
  readonly approved_at: string | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
  readonly plan_counts: Readonly<Record<string, number>>;
}

export interface ProgrammeDetail extends Programme {
  readonly plans: readonly PlanSummary[];
  readonly available_actions: readonly ProgrammeAction[];
}

export interface ProgrammeQuery extends PageQuery {
  readonly q?: string;
  readonly status?: string;
  readonly year?: number;
}

export interface ProgrammeInput {
  readonly title: string;
  readonly year: number;
  readonly description?: string | null;
  readonly objectives?: string | null;
  readonly risk_basis?: string | null;
  readonly frameworks?: readonly string[];
  readonly owner_user_id?: string | null;
  readonly change_reason?: string | null;
}

// --- plans -----------------------------------------------------------------------

export interface PlanAuditor {
  readonly id: string;
  readonly user: UserRef | null;
  readonly external_name: string | null;
  readonly role: AuditorRole;
  readonly competence_ok: boolean;
  readonly independence_ok: boolean;
  readonly issues: readonly string[];
  readonly override_reason: string | null;
  readonly created_at: string;
}

export interface Plan {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly kind: PlanKind;
  readonly external_party_type: ExternalPartyType | null;
  readonly external_party_name: string | null;
  readonly programme: RecordRef | null;
  readonly certification_id: string | null;
  readonly scope: string | null;
  readonly criteria: string | null;
  readonly objectives: string | null;
  readonly frameworks: readonly string[];
  readonly clause_refs: readonly string[];
  readonly auditee_department_ids: readonly string[];
  readonly risk_level: RiskLevel;
  readonly status: PlanStatus;
  readonly status_reason: string | null;
  readonly planned_start: string | null;
  readonly planned_end: string | null;
  readonly actual_start: string | null;
  readonly actual_end: string | null;
  readonly owner: UserRef | null;
  readonly lead_auditor: UserRef | null;
  readonly report_summary: string | null;
  readonly report_conclusion: string | null;
  readonly report_submitted_at: string | null;
  readonly report_submitted_by: UserRef | null;
  readonly report_approved_at: string | null;
  readonly report_approved_by: UserRef | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
  readonly findings_total: number;
  readonly findings_open: number;
  readonly checklist_total: number;
  readonly checklist_answered: number;
}

export interface PlanDetail extends Plan {
  readonly auditors: readonly PlanAuditor[];
  readonly findings_by_type: Readonly<Record<string, number>>;
  readonly available_actions: readonly PlanAction[];
}

export interface PlanQuery extends PageQuery {
  readonly q?: string;
  readonly status?: string;
  readonly kind?: PlanKind;
  readonly programme_id?: string;
  readonly certification_id?: string;
  readonly auditor?: string;
  readonly start_from?: string;
  readonly start_to?: string;
  readonly sort?: PlanSort;
}

export interface PlanInput {
  readonly title: string;
  readonly kind: PlanKind;
  readonly programme_id?: string | null;
  readonly certification_id?: string | null;
  readonly external_party_type?: ExternalPartyType | null;
  readonly external_party_name?: string | null;
  readonly scope?: string | null;
  readonly criteria?: string | null;
  readonly objectives?: string | null;
  readonly frameworks: readonly string[];
  readonly clause_refs: readonly string[];
  readonly auditee_department_ids: readonly string[];
  readonly risk_level: RiskLevel;
  readonly planned_start?: string | null;
  readonly planned_end?: string | null;
  readonly owner_user_id?: string | null;
  readonly change_reason?: string | null;
}

export interface PlanReportInput {
  readonly report_summary?: string | null;
  readonly report_conclusion?: string | null;
}

export interface AuditorAssignInput {
  readonly user_id?: string;
  readonly external_name?: string;
  readonly role: AuditorRole;
  readonly override_reason?: string;
}

export interface AuditorCheck {
  readonly user_id: string;
  readonly competence_ok: boolean;
  readonly independence_ok: boolean;
  readonly issues: readonly string[];
}

// --- checklist -------------------------------------------------------------------

export interface ChecklistItem {
  readonly id: string;
  readonly position: number;
  readonly clause_ref: string | null;
  readonly question: string;
  readonly evidence_request: string | null;
  readonly source: string;
  readonly result: ChecklistResult;
  readonly notes: string | null;
  readonly answered_by: UserRef | null;
  readonly answered_at: string | null;
  readonly created_at: string;
}

export interface Checklist {
  readonly items: readonly ChecklistItem[];
  readonly total: number;
  readonly answered: number;
  readonly by_result: Readonly<Record<string, number>>;
}

export interface ChecklistItemInput {
  readonly question: string;
  readonly clause_ref?: string | null;
  readonly evidence_request?: string | null;
}

export interface ChecklistItemUpdate {
  readonly question?: string;
  readonly clause_ref?: string | null;
  readonly evidence_request?: string | null;
  readonly result?: ChecklistResult;
  readonly notes?: string | null;
  readonly position?: number;
}

/** One question of the `audits.draft_questions` assist result. */
export interface DraftQuestion {
  readonly clause_ref: string | null;
  readonly question: string;
  readonly evidence_request: string | null;
}

// --- findings --------------------------------------------------------------------

export interface Finding {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly plan: RecordRef;
  readonly finding_type: FindingType;
  readonly title: string;
  readonly description: string | null;
  readonly evidence: string | null;
  readonly clause_ref: string | null;
  readonly checklist_item_id: string | null;
  readonly status: FindingStatus;
  readonly status_reason: string | null;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly response_due_at: string | null;
  readonly overdue: boolean;
  readonly root_cause: string | null;
  readonly correction: string | null;
  readonly corrective_action: string | null;
  readonly responded_at: string | null;
  readonly verification_notes: string | null;
  readonly verified_by: UserRef | null;
  readonly verified_at: string | null;
  readonly closed_at: string | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface FindingDetail extends Finding {
  readonly deviations: readonly EntityRefDto[];
  readonly actions: readonly Task[];
  readonly available_actions: readonly FindingAction[];
}

export interface FindingQuery extends PageQuery {
  readonly q?: string;
  readonly plan_id?: string;
  readonly status?: string;
  readonly finding_type?: string;
  readonly owner?: string;
  readonly overdue?: boolean;
  readonly sort?: FindingSort;
}

export interface FindingInput {
  readonly title: string;
  readonly finding_type: FindingType;
  readonly description?: string | null;
  readonly evidence?: string | null;
  readonly clause_ref?: string | null;
  readonly checklist_item_id?: string | null;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly response_due_at?: string | null;
  readonly change_reason?: string | null;
}

export interface FindingResponseInput {
  readonly root_cause?: string | null;
  readonly correction?: string | null;
  readonly corrective_action?: string | null;
  readonly verification_notes?: string | null;
}

export interface FindingActionInput {
  readonly title: string;
  readonly description?: string | null;
  readonly assignee_user_id?: string | null;
  readonly due_at?: string | null;
  readonly priority?: 'low' | 'normal' | 'high' | 'urgent';
}

// --- auditor register ------------------------------------------------------------

export interface AuditorProfile {
  readonly id: string;
  readonly user: UserRef;
  readonly frameworks: readonly string[];
  readonly lead_auditor: boolean;
  readonly qualifications: string | null;
  readonly trained_at: string | null;
  readonly valid_until: string | null;
  readonly active: boolean;
  readonly expired: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AuditorProfileInput {
  readonly user_id?: string;
  readonly frameworks: readonly string[];
  readonly lead_auditor: boolean;
  readonly qualifications?: string | null;
  readonly trained_at?: string | null;
  readonly valid_until?: string | null;
  readonly active: boolean;
}

// --- certifications --------------------------------------------------------------

export interface Certification {
  readonly id: string;
  readonly org_id: string;
  readonly framework: string;
  readonly certification_body: string;
  readonly certificate_number: string | null;
  readonly status: CertificationStatus;
  readonly scope: string | null;
  readonly notes: string | null;
  readonly issued_at: string | null;
  readonly expires_at: string | null;
  readonly next_surveillance_at: string | null;
  readonly days_to_expiry: number | null;
  readonly owner: UserRef | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface CertificationDetail extends Certification {
  readonly audits: readonly PlanSummary[];
}

export interface CertificationQuery extends PageQuery {
  readonly status?: string;
  readonly framework?: string;
  readonly expiring_within_days?: number;
}

export interface CertificationInput {
  readonly framework: string;
  readonly certification_body: string;
  readonly certificate_number?: string | null;
  readonly status: CertificationStatus;
  readonly scope?: string | null;
  readonly notes?: string | null;
  readonly issued_at?: string | null;
  readonly expires_at?: string | null;
  readonly next_surveillance_at?: string | null;
  readonly owner_user_id?: string | null;
  readonly change_reason?: string | null;
}

// --- overview / report -----------------------------------------------------------

export interface AuditsOverview {
  readonly plans_by_status: Readonly<Record<string, number>>;
  readonly findings_open_by_type: Readonly<Record<string, number>>;
  readonly findings_overdue: number;
  readonly upcoming_audits: readonly PlanSummary[];
  readonly certifications_expiring: readonly Certification[];
}

export interface AuditReport {
  readonly plan: PlanDetail;
  readonly checklist: Checklist;
  readonly findings: readonly Finding[];
}
