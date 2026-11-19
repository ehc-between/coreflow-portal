/**
 * DTOs of the contract register API (M12, coreflow-core `app/modules/contracts`).
 * Every endpoint lives under `v1/orgs/{org_id}/contracts`. Calendar dates are
 * ISO days (`YYYY-MM-DD`), timestamps naive UTC; amounts are decimal strings.
 */

import { AssigneeIn, RecurrenceSpec, TaskPriority } from '../../../core/tasks/task.models';
import type { CustomerRef } from '../../../shared/customers';

export const CONTRACT_TYPES = [
  'customer',
  'supplier',
  'nda',
  'dpa',
  'employment',
  'sla',
  'partner',
  'licence',
  'other',
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'active',
  'expired',
  'terminated',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Statuses after which the contract is closed (edits return 409 `contract_closed`). */
export const CLOSED_STATUSES: readonly ContractStatus[] = ['expired', 'terminated'];

export const PARTY_ROLES = [
  'customer',
  'supplier',
  'processor',
  'controller',
  'sub_processor',
  'employee',
  'employer',
  'partner',
  'other',
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const KEY_DATE_KINDS = [
  'renewal',
  'notice',
  'review',
  'payment',
  'milestone',
  'expiry',
  'other',
] as const;
export type KeyDateKind = (typeof KEY_DATE_KINDS)[number];

export const VALUE_PERIODS = ['one_off', 'monthly', 'quarterly', 'yearly', 'total'] as const;
export type ValuePeriod = (typeof VALUE_PERIODS)[number];

export const CONTRACT_SORTS = [
  '-updated_at',
  '-created_at',
  'code',
  '-code',
  'title',
  '-title',
  'end_date',
  '-end_date',
] as const;
export type ContractSort = (typeof CONTRACT_SORTS)[number];

export const CONTRACT_ACTIONS = [
  'submit',
  'approve',
  'reject',
  'activate',
  'renew',
  'review',
  'terminate',
  'expire',
] as const;
export type ContractAction = (typeof CONTRACT_ACTIONS)[number];

/** Actions whose body must carry a note (422 `note_required`). */
export const NOTE_REQUIRED_ACTIONS: readonly ContractAction[] = ['approve', 'reject', 'terminate'];

/**
 * Deadline kinds: the contract's own dates plus the key-date kinds. The review date
 * and review key dates are both `review` (older servers sent `review_date`).
 */
export const DEADLINE_KINDS: readonly string[] = ['notice_deadline', 'end_date', ...KEY_DATE_KINDS];

/**
 * The GDPR role of the counterparty: none · they process personal data for us (they
 * are our processor) · we process personal data for them (we are their processor) ·
 * joint controllers (Art. 26). Replaces the bare `processes_personal_data` flag.
 */
export const PERSONAL_DATA_ROLES = [
  'none',
  'they_process',
  'we_process',
  'joint_controllers',
] as const;
export type PersonalDataRole = (typeof PERSONAL_DATA_ROLES)[number];

/** Legal basis of transfers outside the EU/EEA (GDPR chapter V). */
export const TRANSFER_BASES = ['none', 'adequacy', 'scc', 'bcr', 'derogation', 'other'] as const;
export type TransferBasis = (typeof TRANSFER_BASES)[number];

/** What needs attention on a contract, most important first (list rows and detail). */
export const CONTRACT_WARNINGS = [
  'dpa_missing',
  'dpa_incomplete',
  'signed_copy_missing',
  'review_overdue',
  'review_date_missing',
  'notice_soon',
  'end_date_missing',
  'notice_period_missing',
] as const;
export type ContractWarning = (typeof CONTRACT_WARNINGS)[number];

/** The approver's answer to one review question (`no` means: send it back instead). */
export const REVIEW_ANSWERS = ['yes', 'no', 'na'] as const;
export type ReviewAnswer = (typeof REVIEW_ANSWERS)[number];

/** The review questions the server may ask (`review_items`); each has an i18n label. */
export const REVIEW_ITEM_KEYS: readonly string[] = [
  'requirements_defined',
  'differences_resolved',
  'able_to_deliver',
  'terms_acceptable',
  'supplier_approved',
  'security_clauses',
  'confidentiality_scope',
  'dpa_in_place',
  'dpa_clauses_checked',
  'sub_processors_known',
  'transfers_assessed',
];

/** GDPR Art. 28(3) clause keys the DPA check and the extraction report on. */
export const DPA_CLAUSE_KEYS = [
  'subject_matter_and_duration',
  'documented_instructions',
  'confidentiality',
  'security_measures',
  'sub_processors',
  'data_subject_rights',
  'compliance_assistance',
  'breach_notification',
  'deletion_or_return',
  'audits_and_information',
  'international_transfers',
] as const;

export type DpaClauseKey = (typeof DPA_CLAUSE_KEYS)[number];

/** DPA status: `covered` only for a signed agreement with every clause confirmed. */
export type DpaState = 'not_required' | 'covered' | 'incomplete' | 'missing';
export const DPA_STATES: readonly DpaState[] = ['not_required', 'covered', 'incomplete', 'missing'];

/** What a person (or the assistant) recorded for a clause. */
export type DpaClauseState = 'present' | 'missing' | 'waived';
export const DPA_CLAUSE_STATES: readonly DpaClauseState[] = ['present', 'missing', 'waived'];
/** Who recorded it: `ai` = an unconfirmed assistant finding, `user` = confirmed by a person. */
export type DpaClauseSource = 'ai' | 'user';
/** Why a DPA is not covered. */
export type DpaReason = 'unsigned' | 'clauses_missing' | 'clauses_unconfirmed' | 'no_dpa';
export const DPA_REASONS: readonly DpaReason[] = [
  'unsigned',
  'clauses_missing',
  'clauses_unconfirmed',
  'no_dpa',
];

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface NextDeadline {
  readonly kind: string;
  readonly label: string | null;
  readonly due_date: string;
  readonly overdue: boolean;
}

export interface ContractListItem {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly contract_type: ContractType;
  readonly status: ContractStatus;
  readonly owner: UserRef | null;
  readonly counterparties: readonly string[];
  /** Supplier-register records among the parties. */
  readonly supplier_ids?: readonly string[];
  /** The customer (customer register): the first external party linked to a customer. */
  readonly customer_id?: string | null;
  readonly customer?: CustomerRef | null;
  readonly value_amount: string | null;
  readonly currency: string | null;
  readonly value_period: ValuePeriod | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly review_date: string | null;
  readonly notice_deadline: string | null;
  /** Days left to give notice, while the notice deadline is ahead. */
  readonly notice_due_in_days?: number | null;
  readonly next_deadline: NextDeadline | null;
  readonly auto_renew: boolean;
  readonly confidential: boolean;
  readonly processes_personal_data: boolean;
  readonly personal_data_role?: PersonalDataRole;
  readonly transfer_basis?: TransferBasis | null;
  readonly ict_critical?: boolean;
  readonly involves_ai_system?: boolean;
  /** Same rule as `Contract.dpa.status`. */
  readonly dpa_status?: DpaState;
  /** What needs attention, most important first. */
  readonly warnings?: readonly ContractWarning[];
  readonly current_version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ContractList {
  readonly items: readonly ContractListItem[];
  readonly total: number;
}

export interface PartyIn {
  readonly name: string;
  /** Omitted: the server picks the role from the contract type. */
  readonly role?: PartyRole | null;
  readonly is_internal: boolean;
  readonly org_number?: string | null;
  /** Link to a supplier-register record (null unlinks on PATCH). */
  readonly supplier_id?: string | null;
  /** Link to a customer-register record (a party is a supplier or a customer, not both). */
  readonly customer_id?: string | null;
  readonly contact_name?: string | null;
  readonly contact_email?: string | null;
}

export interface PartyUpdate extends Partial<PartyIn> {
  readonly position?: number;
}

/** The supplier a party is linked to; only `id` without `suppliers:read`. */
export interface SupplierRef {
  readonly id: string;
  readonly code?: string | null;
  readonly name?: string | null;
  readonly criticality?: string | null;
  readonly status?: string | null;
  readonly url?: string | null;
}

export interface Party {
  readonly id: string;
  readonly name: string;
  readonly role: PartyRole;
  readonly is_internal: boolean;
  readonly org_number: string | null;
  readonly supplier_id?: string | null;
  readonly supplier?: SupplierRef | null;
  readonly customer_id?: string | null;
  readonly customer?: CustomerRef | null;
  readonly contact_name: string | null;
  readonly contact_email: string | null;
  readonly position: number;
}

export interface KeyDateIn {
  readonly kind: KeyDateKind;
  readonly label: string;
  readonly due_date: string;
  readonly notes?: string | null;
}

export interface KeyDateUpdate extends Partial<KeyDateIn> {
  readonly done?: boolean;
}

export interface KeyDate {
  readonly id: string;
  readonly kind: KeyDateKind;
  readonly label: string;
  readonly due_date: string;
  readonly notes: string | null;
  readonly done_at: string | null;
  readonly done_by: string | null;
  readonly overdue: boolean;
}

export interface VersionIn {
  readonly change_summary: string;
  readonly effective_date?: string | null;
  readonly signed?: boolean;
  readonly attachment_id?: string | null;
}

export interface VersionUpdate {
  readonly signed?: boolean;
  readonly attachment_id?: string | null;
}

export interface ContractVersion {
  readonly id: string;
  readonly version_no: number;
  readonly change_summary: string | null;
  readonly effective_date: string | null;
  readonly signed: boolean;
  readonly attachment_id: string | null;
  /** Marked signed, but no signed copy is attached. */
  readonly copy_missing?: boolean;
  readonly created_by: UserRef | null;
  readonly created_at: string;
}

/** One row of the contract's GDPR Art. 28(3) checklist (`unknown` until assessed). */
export interface DpaChecklistItem {
  readonly key: string;
  readonly label: string;
  readonly state: DpaClauseState | 'unknown';
  readonly note: string | null;
  readonly source: DpaClauseSource | null;
  readonly updated_at: string | null;
}

/** `PUT contracts/{id}/dpa-clauses` entry (also `ContractCreate.dpa_clauses`). */
export interface DpaClauseIn {
  readonly key: DpaClauseKey;
  readonly state: DpaClauseState;
  readonly note?: string | null;
  readonly source?: DpaClauseSource;
}

export interface ContractBrief {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ContractStatus;
}

export interface DpaCoverage {
  readonly required: boolean;
  readonly status: DpaState;
  /** The GDPR role the status is based on. */
  readonly role?: PersonalDataRole;
  readonly linked_dpa_ids: readonly string[];
  /** Signed agreements with a complete checklist that cover this contract. */
  readonly covering_ids?: readonly string[];
  /** On a DPA: the contracts it covers ("Covers: CT-0001"). */
  readonly covers?: readonly ContractBrief[];
  /** The agreement the reasons and clause lists describe (this contract or a linked DPA). */
  readonly evaluated_id?: string | null;
  readonly signed?: boolean;
  readonly missing_clauses?: readonly string[];
  readonly unconfirmed_clauses?: readonly string[];
  readonly reasons?: readonly DpaReason[];
  /** This contract's own checklist, every clause in order. */
  readonly checklist?: readonly DpaChecklistItem[];
}

export interface ReviewAnswerOut {
  readonly key: string;
  readonly answer: ReviewAnswer;
}

/** The requirements review recorded with the approval (ISO 9001 8.2.3, ISO 27001 A.5.20). */
export interface ApprovalReview {
  readonly items: readonly ReviewAnswerOut[];
  readonly note: string | null;
  readonly reviewed_by: UserRef | null;
  readonly reviewed_at: string | null;
}

export interface Contract extends ContractListItem {
  readonly description: string | null;
  readonly department_id: string | null;
  readonly signed_date: string | null;
  readonly transfer_countries?: string | null;
  readonly notice_period_days: number | null;
  readonly renewal_term_months: number | null;
  readonly renewal_notes: string | null;
  readonly governing_law: string | null;
  readonly termination_date: string | null;
  readonly submitted_at: string | null;
  readonly submitted_by: UserRef | null;
  readonly approved_at: string | null;
  readonly approved_by: UserRef | null;
  readonly approval_review?: ApprovalReview | null;
  /** The questions the approver answers for this contract. */
  readonly review_items?: readonly string[];
  /** `self_approval`: the caller submitted or owns it and an independent approver is required. */
  readonly approval_blocked_reason?: 'self_approval' | null;
  readonly last_reviewed_at?: string | null;
  readonly last_reviewed_by?: UserRef | null;
  readonly created_by: UserRef | null;
  readonly parties: readonly Party[];
  readonly key_dates: readonly KeyDate[];
  /** Newest first. */
  readonly versions: readonly ContractVersion[];
  readonly open_obligations: number;
  readonly dpa: DpaCoverage;
  /** Canonical clause refs this kind of contract documents (type + flags). */
  readonly requirement_refs?: readonly string[];
  readonly allowed_actions: readonly ContractAction[];
  readonly can_edit: boolean;
  readonly can_delete: boolean;
  readonly can_approve: boolean;
  readonly url: string;
}

/** The editable fields shared by create and update. */
export interface ContractFields {
  readonly description?: string | null;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly processes_personal_data?: boolean | null;
  /** Wins over `processes_personal_data`. */
  readonly personal_data_role?: PersonalDataRole | null;
  readonly transfer_basis?: TransferBasis | null;
  readonly transfer_countries?: string | null;
  readonly ict_critical?: boolean | null;
  readonly involves_ai_system?: boolean | null;
  readonly value_amount?: string | null;
  readonly currency?: string | null;
  readonly value_period?: ValuePeriod | null;
  readonly start_date?: string | null;
  readonly end_date?: string | null;
  readonly signed_date?: string | null;
  readonly review_date?: string | null;
  readonly notice_period_days?: number | null;
  readonly auto_renew?: boolean | null;
  readonly renewal_term_months?: number | null;
  readonly renewal_notes?: string | null;
  readonly governing_law?: string | null;
  readonly confidential?: boolean | null;
}

export interface ContractCreate extends ContractFields {
  readonly title: string;
  readonly contract_type: ContractType;
  readonly parties?: readonly PartyIn[];
  /** Checklist findings to store with the new contract (e.g. missing clauses from the extraction). */
  readonly dpa_clauses?: readonly DpaClauseIn[];
  /** Link the counterparty to this supplier (create-from-supplier flow). */
  readonly supplier_id?: string | null;
  /** The customer: the counterparty party becomes (or is added as) this customer. */
  readonly customer_id?: string | null;
}

export interface ContractUpdate extends ContractFields {
  readonly title?: string;
  readonly contract_type?: ContractType;
  /** Set (or, with null, clear) the customer of the counterparty party. */
  readonly customer_id?: string | null;
  readonly change_reason?: string | null;
}

export interface ReviewAnswerIn {
  readonly key: string;
  readonly answer: ReviewAnswer;
}

export interface ContractActionBody {
  readonly note?: string | null;
  readonly effective_date?: string | null;
  readonly new_end_date?: string | null;
  /** `approve`: an answer to every `review_items` key. */
  readonly checklist?: readonly ReviewAnswerIn[];
  /** `review`: the next review date (default today + the org's review interval). */
  readonly next_review_date?: string | null;
}

export interface ContractListQuery {
  readonly q?: string;
  readonly status?: readonly ContractStatus[];
  readonly type?: readonly ContractType[];
  /** A user id or `me`. */
  readonly owner?: string;
  readonly expiring_within_days?: number;
  readonly processes_personal_data?: boolean;
  readonly personal_data_role?: readonly PersonalDataRole[];
  readonly supplier_id?: string;
  readonly customer_id?: string;
  /** Any of these warnings. */
  readonly warning?: readonly ContractWarning[];
  readonly dpa_missing?: boolean;
  readonly sort?: ContractSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface Deadline {
  readonly contract_id: string;
  readonly code: string;
  readonly title: string;
  readonly contract_type: ContractType;
  readonly status: ContractStatus;
  readonly owner?: UserRef | null;
  readonly counterparties?: readonly string[];
  readonly kind: string;
  readonly label: string | null;
  readonly due_date: string;
  readonly days_left?: number;
  readonly overdue: boolean;
  readonly key_date_id: string | null;
  readonly url: string;
}

/** A DPA contract that could cover this contract (best counterparty match first). */
export interface DpaCandidate {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ContractStatus;
  readonly dpa_status: DpaState;
  readonly counterparties: readonly string[];
  readonly match: 'supplier' | 'org_number' | 'name' | null;
  readonly linked: boolean;
  readonly url: string;
}

/** Org-wide contract settings (`GET` / `PUT contracts/settings`). */
export interface ContractSettings {
  /** Segregation of duties: the submitter and the owner cannot approve. */
  readonly require_independent_approver: boolean;
  /** Months between periodic reviews (1-60). */
  readonly default_review_months: number;
}

export interface ObligationCreate {
  readonly title: string;
  readonly description?: string | null;
  readonly assignee?: AssigneeIn | null;
  readonly due_at?: string | null;
  readonly priority?: TaskPriority;
  readonly recurrence?: RecurrenceSpec | null;
}

// --- AI assist outputs --------------------------------------------------------------

export interface ExtractedParty {
  readonly name: string;
  readonly role?: string | null;
  readonly org_number?: string | null;
}

export interface ExtractedObligation {
  readonly title: string;
  readonly party?: string | null;
  readonly due_date?: string | null;
  readonly recurring?: string | null;
}

export interface ExtractedRisk {
  readonly title: string;
  readonly severity?: string | null;
  readonly explanation?: string | null;
}

/** `contracts.extract` result. */
export interface ContractExtraction {
  readonly title?: string | null;
  readonly contract_type?: string | null;
  readonly parties?: readonly ExtractedParty[];
  readonly start_date?: string | null;
  readonly end_date?: string | null;
  readonly signed_date?: string | null;
  readonly notice_period_days?: number | null;
  readonly auto_renew?: boolean | null;
  readonly renewal_term_months?: number | null;
  readonly renewal_terms?: string | null;
  readonly value_amount?: number | null;
  readonly currency?: string | null;
  readonly governing_law?: string | null;
  readonly processes_personal_data?: boolean | null;
  readonly obligations?: readonly ExtractedObligation[];
  readonly risks?: readonly ExtractedRisk[];
  readonly missing_dpa_clauses?: readonly string[];
}

export interface DpaClauseCheck {
  readonly key: string;
  readonly present: boolean;
  readonly evidence?: string | null;
}

/** `contracts.dpa_check` result. */
export interface DpaCheckResult {
  readonly applies?: boolean;
  readonly clauses?: readonly DpaClauseCheck[];
  readonly missing?: readonly string[];
  readonly summary?: string | null;
}

export const ENTITY_TYPE = 'contract';
export const MODULE_KEY = 'contracts';
export const PERM_READ = 'contracts:read';
export const PERM_WRITE = 'contracts:write';
export const PERM_MANAGE = 'contracts:manage';
export const PERM_APPROVE = 'contracts:approve';
