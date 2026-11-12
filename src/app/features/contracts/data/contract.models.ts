/**
 * DTOs of the contract register API (M12, coreflow-core `app/modules/contracts`).
 * Every endpoint lives under `v1/orgs/{org_id}/contracts`. Calendar dates are
 * ISO days (`YYYY-MM-DD`), timestamps naive UTC; amounts are decimal strings.
 */

import { AssigneeIn, RecurrenceSpec, TaskPriority } from '../../../core/tasks/task.models';

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
  'terminate',
  'expire',
] as const;
export type ContractAction = (typeof CONTRACT_ACTIONS)[number];

/** Actions whose body must carry a note (422 `note_required`). */
export const NOTE_REQUIRED_ACTIONS: readonly ContractAction[] = ['reject', 'terminate'];

/** Deadline kinds: the contract's own dates plus the key-date kinds. */
export const DEADLINE_KINDS = ['notice_deadline', 'end_date', 'review_date', ...KEY_DATE_KINDS];

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

export type DpaState = 'not_required' | 'covered' | 'missing';
export const DPA_STATES: readonly DpaState[] = ['not_required', 'covered', 'missing'];

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
  readonly value_amount: string | null;
  readonly currency: string | null;
  readonly value_period: ValuePeriod | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly notice_deadline: string | null;
  readonly next_deadline: NextDeadline | null;
  readonly auto_renew: boolean;
  readonly confidential: boolean;
  readonly processes_personal_data: boolean;
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
  readonly role: PartyRole;
  readonly is_internal: boolean;
  readonly org_number?: string | null;
  readonly contact_name?: string | null;
  readonly contact_email?: string | null;
}

export interface PartyUpdate extends Partial<PartyIn> {
  readonly position?: number;
}

export interface Party {
  readonly id: string;
  readonly name: string;
  readonly role: PartyRole;
  readonly is_internal: boolean;
  readonly org_number: string | null;
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
  readonly created_by: UserRef | null;
  readonly created_at: string;
}

export interface DpaCoverage {
  readonly required: boolean;
  readonly status: DpaState;
  readonly linked_dpa_ids: readonly string[];
}

export interface Contract extends ContractListItem {
  readonly description: string | null;
  readonly department_id: string | null;
  readonly signed_date: string | null;
  readonly review_date: string | null;
  readonly notice_period_days: number | null;
  readonly renewal_term_months: number | null;
  readonly renewal_notes: string | null;
  readonly governing_law: string | null;
  readonly termination_date: string | null;
  readonly submitted_at: string | null;
  readonly submitted_by: UserRef | null;
  readonly approved_at: string | null;
  readonly approved_by: UserRef | null;
  readonly created_by: UserRef | null;
  readonly parties: readonly Party[];
  readonly key_dates: readonly KeyDate[];
  /** Newest first. */
  readonly versions: readonly ContractVersion[];
  readonly open_obligations: number;
  readonly dpa: DpaCoverage;
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
}

export interface ContractUpdate extends ContractFields {
  readonly title?: string;
  readonly contract_type?: ContractType;
  readonly change_reason?: string | null;
}

export interface ContractActionBody {
  readonly note?: string | null;
  readonly effective_date?: string | null;
  readonly new_end_date?: string | null;
}

export interface ContractListQuery {
  readonly q?: string;
  readonly status?: readonly ContractStatus[];
  readonly type?: readonly ContractType[];
  /** A user id or `me`. */
  readonly owner?: string;
  readonly expiring_within_days?: number;
  readonly processes_personal_data?: boolean;
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
  readonly kind: string;
  readonly label: string | null;
  readonly due_date: string;
  readonly overdue: boolean;
  readonly key_date_id: string | null;
  readonly url: string;
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
