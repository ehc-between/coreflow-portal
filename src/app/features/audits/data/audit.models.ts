/**
 * M06 audit management DTOs, mirroring coreflow-core `app/modules/audits/schemas.py`.
 * All paths live under `v1/orgs/{org_id}/audits`. Datetimes are naive UTC ISO strings.
 *
 * Fields added by the A08 backend (processes, evidence, coverage, decision, …) are
 * typed optional so the pages also render against a server that has not been
 * updated yet; the templates fall back to empty values.
 */
import { EntityRefDto } from '../../../core/entities/entity.models';
import { Task } from '../../../core/tasks/task.models';
import type { CustomerRef } from '../../../shared/customers';

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
/** The standards a certification body can certify (422 `framework_not_certifiable` otherwise). */
export const CERTIFIABLE_FRAMEWORKS: readonly string[] = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso42001',
  'iso45001',
];

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
export const PLAN_OPEN_STATUSES: readonly PlanStatus[] = [
  'planned',
  'in_progress',
  'reporting',
  'report_review',
];
/**
 * Plan list status filter: every open status (`unresolved`), everything, `signed` (the
 * report is approved, U18) or one status.
 */
export const PLAN_STATUS_FILTERS = ['unresolved', 'all', 'signed', ...PLAN_STATUSES] as const;
export type PlanStatusFilter = (typeof PLAN_STATUS_FILTERS)[number];
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
export const REPORT_OUTCOMES = [
  'conforming',
  'conforming_with_findings',
  'not_conforming',
] as const;
export type ReportOutcome = (typeof REPORT_OUTCOMES)[number];

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
  'independence_auditee',
  'independence_process_owner',
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
/**
 * Finding list status filter. `unresolved` (every open status) is the default and
 * has its own value, so the single status "open" can still be chosen.
 */
export const FINDING_STATUS_FILTERS = ['unresolved', 'all', ...FINDING_STATUSES] as const;
export type FindingStatusFilter = (typeof FINDING_STATUS_FILTERS)[number];
export const EFFECTIVENESS_RESULTS = ['effective', 'not_effective'] as const;
export type Effectiveness = (typeof EFFECTIVENESS_RESULTS)[number];
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

/** Another module's record (process, document, supplier, …), shown as an entity chip. */
export type EntityRef = EntityRefDto;

export interface DepartmentRef {
  readonly id: string;
  readonly name: string;
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
  readonly actual_end?: string | null;
  readonly report_outcome?: ReportOutcome | null;
  readonly lead_auditor: UserRef | null;
  /** The lead's name, also for an external lead auditor. */
  readonly lead_auditor_name?: string | null;
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

export interface CertificationRef {
  readonly id: string;
  readonly framework: string;
  readonly certification_body: string;
  readonly certificate_number: string | null;
  readonly status: CertificationStatus;
  /** "ISO 9001 (DNV)". */
  readonly title: string;
  readonly url: string;
}

export interface Plan {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly kind: PlanKind;
  readonly external_party_type: ExternalPartyType | null;
  readonly external_party_name: string | null;
  /** The customer that audits us (customer register; external audits by a customer). */
  readonly customer_id?: string | null;
  readonly customer?: CustomerRef | null;
  readonly programme: RecordRef | null;
  readonly certification_id: string | null;
  readonly certification?: CertificationRef | null;
  readonly scope: string | null;
  readonly criteria: string | null;
  readonly objectives: string | null;
  readonly frameworks: readonly string[];
  /** Canonical clause refs (`iso9001:8.4`); they count as evidence for those requirements. */
  readonly clause_refs: readonly string[];
  readonly auditee_department_ids: readonly string[];
  readonly process_ids?: readonly string[];
  readonly criteria_document_ids?: readonly string[];
  readonly auditee_user_ids?: readonly string[];
  readonly distribution_user_ids?: readonly string[];
  readonly location?: string | null;
  readonly risk_level: RiskLevel;
  readonly status: PlanStatus;
  readonly status_reason: string | null;
  readonly planned_start: string | null;
  readonly planned_end: string | null;
  readonly actual_start: string | null;
  readonly actual_end: string | null;
  readonly owner: UserRef | null;
  readonly lead_auditor: UserRef | null;
  readonly lead_auditor_name?: string | null;
  readonly report_summary: string | null;
  readonly report_conclusion: string | null;
  readonly report_outcome?: ReportOutcome | null;
  readonly report_limitations?: string | null;
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
  /** Audited processes and criteria documents the caller can read. */
  readonly processes?: readonly EntityRef[];
  readonly criteria_documents?: readonly EntityRef[];
  /** People interviewed, and who receives the report. */
  readonly auditees?: readonly UserRef[];
  readonly distribution?: readonly UserRef[];
  readonly auditee_departments?: readonly DepartmentRef[];
}

export interface PlanQuery extends PageQuery {
  readonly q?: string;
  readonly status?: string;
  readonly kind?: PlanKind;
  readonly programme_id?: string;
  readonly certification_id?: string;
  readonly auditor?: string;
  readonly process_id?: string;
  readonly clause?: string;
  /** `true`: only audits whose report is approved ("Signert"). */
  readonly signed?: boolean;
  /** Audits by one customer (`?customer_id=`, the customer card's "Se alle"). */
  readonly customer_id?: string;
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
  readonly customer_id?: string | null;
  readonly scope?: string | null;
  readonly criteria?: string | null;
  readonly objectives?: string | null;
  readonly frameworks: readonly string[];
  readonly clause_refs: readonly string[];
  readonly auditee_department_ids: readonly string[];
  readonly process_ids: readonly string[];
  readonly criteria_document_ids: readonly string[];
  readonly auditee_user_ids: readonly string[];
  readonly distribution_user_ids: readonly string[];
  readonly location?: string | null;
  readonly risk_level: RiskLevel;
  readonly planned_start?: string | null;
  readonly planned_end?: string | null;
  readonly owner_user_id?: string | null;
  readonly change_reason?: string | null;
}

export interface PlanReportInput {
  readonly report_summary?: string | null;
  readonly report_conclusion?: string | null;
  readonly report_outcome?: ReportOutcome | null;
  readonly report_limitations?: string | null;
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

export interface EvidenceRef {
  readonly entity_type: string;
  readonly entity_id: string;
}

export interface ItemFinding {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly finding_type: FindingType;
  readonly status: FindingStatus;
  readonly url: string;
}

/** At most this many evidence records per checklist question (else `too_many_evidence_refs`). */
export const MAX_EVIDENCE_REFS = 20;

export interface ChecklistItem {
  readonly id: string;
  readonly position: number;
  readonly clause_ref: string | null;
  readonly question: string;
  readonly evidence_request: string | null;
  readonly source: string;
  readonly result: ChecklistResult;
  readonly notes: string | null;
  readonly evidence_refs?: readonly EvidenceRef[];
  /** Records linked as evidence (readable ones only). */
  readonly evidence?: readonly EntityRef[];
  /** Findings raised from this question. */
  readonly findings?: readonly ItemFinding[];
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
  /** Replaces the item's evidence records. */
  readonly evidence_refs?: readonly EvidenceRef[];
}

/** One question of the `audits.draft_questions` assist result. */
export interface DraftQuestion {
  readonly clause_ref: string | null;
  readonly question: string;
  readonly evidence_request: string | null;
}

// --- findings --------------------------------------------------------------------

export interface FindingPlanRef {
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly kind?: PlanKind | null;
  readonly status?: PlanStatus | null;
  readonly url?: string | null;
  readonly lead_auditor?: UserRef | null;
}

export interface Finding {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly plan: FindingPlanRef;
  readonly finding_type: FindingType;
  readonly title: string;
  readonly description: string | null;
  readonly evidence: string | null;
  /** Canonical clause ref; a suggested requirement link (a weak spot, not evidence). */
  readonly clause_ref: string | null;
  readonly checklist_item_id: string | null;
  readonly status: FindingStatus;
  readonly status_reason: string | null;
  readonly owner: UserRef | null;
  readonly department_id: string | null;
  readonly department_name?: string | null;
  readonly is_nonconformity?: boolean;
  readonly response_due_at: string | null;
  readonly overdue: boolean;
  readonly root_cause: string | null;
  readonly correction: string | null;
  readonly corrective_action: string | null;
  /** The decision on an observation or improvement suggestion. */
  readonly decision?: string | null;
  readonly responded_at: string | null;
  readonly verification_notes: string | null;
  readonly verified_by: UserRef | null;
  readonly verified_at: string | null;
  readonly closed_at: string | null;
  readonly effectiveness?: Effectiveness | null;
  readonly effectiveness_checked_at?: string | null;
  readonly effectiveness_checked_by?: UserRef | null;
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
  readonly clause?: string;
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
  readonly decision?: string | null;
  readonly verification_notes?: string | null;
  readonly effectiveness?: Effectiveness | null;
}

export interface FindingActionInput {
  readonly title: string;
  readonly description?: string | null;
  readonly assignee_user_id?: string | null;
  readonly due_at?: string | null;
  readonly priority?: 'low' | 'normal' | 'high' | 'urgent';
}

// --- auditor register ------------------------------------------------------------

export interface CourseRef {
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly url: string;
}

export interface AuditorTraining {
  readonly course: CourseRef;
  readonly completed_at: string | null;
  readonly expires_at: string | null;
  readonly certificate_no: string | null;
}

export interface AuditPlanRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: PlanStatus;
  readonly planned_start: string | null;
  readonly url: string;
}

export interface AuditsPerformed {
  readonly total: number;
  readonly closed: number;
  readonly recent: readonly AuditPlanRef[];
}

export interface AuditorProfile {
  readonly id: string;
  readonly user: UserRef;
  readonly frameworks: readonly string[];
  readonly lead_auditor: boolean;
  readonly qualifications: string | null;
  readonly trained_at: string | null;
  readonly valid_until: string | null;
  /** Valid until, following the linked training records when there are any. */
  readonly derived_valid_until?: string | null;
  readonly course_ids?: readonly string[];
  readonly training?: readonly AuditorTraining[];
  /** The person's People profile. */
  readonly employee?: { readonly id: string; readonly url: string } | null;
  readonly audits_performed?: AuditsPerformed;
  readonly active: boolean;
  readonly expired: boolean;
  readonly url?: string;
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
  readonly course_ids: readonly string[];
  readonly active: boolean;
}

// --- certifications --------------------------------------------------------------

export interface Certification {
  readonly id: string;
  readonly org_id: string;
  readonly framework: string;
  /** "ISO 9001 (DNV)". */
  readonly title?: string;
  readonly certification_body: string;
  readonly supplier_id?: string | null;
  readonly certificate_number: string | null;
  readonly status: CertificationStatus;
  readonly scope: string | null;
  readonly notes: string | null;
  readonly issued_at: string | null;
  readonly expires_at: string | null;
  readonly next_surveillance_at: string | null;
  readonly days_to_expiry: number | null;
  readonly days_to_surveillance?: number | null;
  readonly owner: UserRef | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface CertificationDetail extends Certification {
  readonly audits: readonly PlanSummary[];
  /** The certification body as a supplier (when linked). */
  readonly supplier?: EntityRef | null;
}

export interface CertificationQuery extends PageQuery {
  readonly status?: string;
  /** One framework or a comma list. */
  readonly framework?: string;
  readonly supplier_id?: string;
  readonly expiring_within_days?: number;
}

export interface CertificationInput {
  readonly framework: string;
  /** May be left out when `supplier_id` names the body (it defaults to the supplier name). */
  readonly certification_body?: string | null;
  readonly supplier_id?: string | null;
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

export interface OverviewSetup {
  readonly programmes: number;
  readonly auditors: number;
  readonly audits: number;
  readonly audits_closed: number;
  readonly certifications: number;
}

export interface MyFinding {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly finding_type: FindingType;
  readonly status: FindingStatus;
  readonly response_due_at: string | null;
  readonly overdue: boolean;
  readonly url: string;
}

export interface OverviewMine {
  readonly audits: readonly PlanSummary[];
  readonly findings: readonly MyFinding[];
}

export interface AuditsOverview {
  readonly plans_by_status: Readonly<Record<string, number>>;
  readonly findings_open_by_type: Readonly<Record<string, number>>;
  readonly findings_open_total?: number;
  readonly findings_overdue: number;
  readonly upcoming_audits: readonly PlanSummary[];
  readonly certifications_expiring: readonly Certification[];
  /** Counts for the "getting started" checklist. */
  readonly setup?: OverviewSetup;
  /** The caller's own audits and the findings they must answer. */
  readonly mine?: OverviewMine | null;
}

export interface ReportSignature {
  readonly role: 'lead_auditor' | 'approver';
  readonly name: string | null;
  readonly at: string | null;
}

export interface AuditReport {
  readonly org_name?: string;
  readonly plan: PlanDetail;
  readonly checklist: Checklist;
  readonly findings: readonly Finding[];
  readonly signatures?: readonly ReportSignature[];
  readonly generated_at?: string;
}

// --- coverage / clause history ----------------------------------------------------

export interface CoverageCell {
  readonly planned: number;
  readonly done: number;
  readonly findings: number;
  readonly nonconformities: number;
  readonly plans: readonly RecordRef[];
}

export interface CoverageRowBase {
  /** Keyed by year ("2026"). */
  readonly cells: Readonly<Record<string, CoverageCell>>;
  readonly audits: number;
  readonly open_findings: number;
  readonly last_audited_at: string | null;
  /** Not audited in the cycle. */
  readonly gap: boolean;
  /** Prefill for a new audit: `frameworks` + `clause_refs`, `process_ids` or `auditee_department_ids`. */
  readonly suggest: Readonly<Record<string, readonly string[]>>;
}

export interface CoverageClauseRow extends CoverageRowBase {
  readonly ref: string;
  readonly framework: string;
  readonly number: string;
  readonly title: string;
  readonly hs_ref: string | null;
}

export interface CoverageProcessRow extends CoverageRowBase {
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly url: string;
}

export interface CoverageDepartmentRow extends CoverageRowBase {
  readonly id: string;
  readonly name: string;
}

export interface CoverageCount {
  readonly total: number;
  readonly covered: number;
}

export interface Coverage {
  readonly programme: RecordRef & { readonly year?: number };
  readonly years: readonly number[];
  readonly frameworks: readonly string[];
  readonly clauses: readonly CoverageClauseRow[];
  readonly processes: readonly CoverageProcessRow[];
  readonly departments: readonly CoverageDepartmentRow[];
  readonly summary: {
    readonly audits: number;
    readonly clauses: CoverageCount;
    readonly processes: CoverageCount;
    readonly departments: CoverageCount;
  };
}

export type ClauseResult = 'conforming' | 'nonconforming' | 'observation';

export interface ClauseAudit {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly kind: PlanKind;
  readonly status: PlanStatus;
  readonly planned_start: string | null;
  readonly actual_end: string | null;
  readonly result: ClauseResult | null;
  readonly results: Readonly<Record<string, number>>;
  readonly url: string;
}

export interface ClauseFinding {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly finding_type: FindingType;
  readonly status: FindingStatus;
  readonly response_due_at: string | null;
  readonly url: string;
}

export interface ClauseHistory {
  readonly ref: string;
  readonly audits: readonly ClauseAudit[];
  readonly audits_total: number;
  readonly last_audited_at: string | null;
  readonly last_result: ClauseResult | null;
  readonly open_findings: readonly ClauseFinding[];
}
