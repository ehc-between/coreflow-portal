/**
 * DTOs and vocabularies of the GDPR and privacy module (M15), mirroring
 * `app/modules/privacy/schemas.py` in coreflow-core. Date-times are naive UTC
 * ISO strings (no offset), as the backend returns them.
 */

// --- permissions ------------------------------------------------------------------

export const PERM_READ = 'privacy:read';
export const PERM_WRITE = 'privacy:write';
export const PERM_MANAGE = 'privacy:manage';
export const PERM_APPROVE = 'privacy:approve';
/** Data subject requests and consent records hold personal data: every action needs this. */
export const PERM_REQUESTS = 'privacy:requests';

// --- vocabularies -----------------------------------------------------------------

export const ROPA_ROLES = ['controller', 'joint_controller', 'processor'] as const;
export const ROPA_STATUSES = ['draft', 'active', 'retired'] as const;
export const LEGAL_BASES = [
  'consent',
  'contract',
  'legal_obligation',
  'vital_interests',
  'public_task',
  'legitimate_interests',
] as const;
/** Art. 9(2)(a)-(j). */
export const SPECIAL_CATEGORY_CONDITIONS = [
  'explicit_consent',
  'employment',
  'vital_interests',
  'non_profit',
  'made_public',
  'legal_claims',
  'substantial_public_interest',
  'health_care',
  'public_health',
  'archiving_research',
] as const;
/** The nine EDPB (WP248) screening criteria. */
export const SCREENING_CRITERIA = [
  'evaluation_scoring',
  'automated_decisions',
  'systematic_monitoring',
  'sensitive_data',
  'large_scale',
  'matching_datasets',
  'vulnerable_subjects',
  'innovative_technology',
  'prevents_rights',
] as const;
export const SCREENING_RESULTS = ['required', 'recommended', 'not_required'] as const;
export const DPIA_STATUSES = [
  'screening',
  'not_required',
  'in_progress',
  'awaiting_decision',
  'approved',
  'rejected',
] as const;
export const LEVELS = ['low', 'medium', 'high'] as const;
export const DECISIONS = ['approved', 'rejected'] as const;

export const DSR_TYPES = [
  'access',
  'rectification',
  'erasure',
  'restriction',
  'portability',
  'objection',
  'automated_decision',
  'withdraw_consent',
] as const;
export const DSR_CHANNELS = ['email', 'web', 'letter', 'phone', 'in_person', 'other'] as const;
export const DSR_STATUSES = [
  'received',
  'verifying',
  'in_progress',
  'completed',
  'rejected',
  'withdrawn',
] as const;

export const BREACH_TYPES = ['confidentiality', 'integrity', 'availability'] as const;
export const BREACH_STATUSES = ['open', 'assessing', 'notified', 'closed'] as const;
export const BREACH_RISKS = ['unlikely', 'risk', 'high_risk'] as const;
/** Art. 34(3)(a)-(c). */
export const SUBJECTS_EXEMPTIONS = ['protected', 'mitigated', 'disproportionate'] as const;
export const CLOCK_STATUSES = ['running', 'overdue', 'met', 'late', 'not_required'] as const;

export const DPA_STATUSES = ['none', 'requested', 'signed', 'expired', 'not_required'] as const;
export const PROCESSOR_STATUSES = ['onboarding', 'active', 'offboarded'] as const;

export const TRANSFER_MECHANISMS = ['adequacy', 'sccs', 'bcrs', 'derogation', 'other'] as const;
export const SCC_MODULES = ['c2c', 'c2p', 'p2p', 'p2c'] as const;
/** Art. 49(1)(a)-(g). */
export const DEROGATIONS = [
  'explicit_consent',
  'contract_with_subject',
  'contract_in_interest',
  'public_interest',
  'legal_claims',
  'vital_interests',
  'public_register',
] as const;
export const TIA_STATUSES = ['not_required', 'in_progress', 'completed'] as const;
export const TIA_CONCLUSIONS = ['adequate', 'supplementary_measures', 'not_adequate'] as const;
export const TRANSFER_STATUSES = ['draft', 'active', 'suspended', 'retired'] as const;

export const DISPOSAL_METHODS = ['delete', 'anonymise', 'archive', 'review'] as const;
export const RETENTION_STATUSES = ['draft', 'active', 'retired'] as const;

export const CONSENT_METHODS = ['web_form', 'paper', 'email', 'verbal', 'other'] as const;
export const CONSENT_STATUSES = ['active', 'withdrawn'] as const;

export const LBA_STATUSES = ['draft', 'awaiting_decision', 'approved', 'rejected'] as const;

/** Sort keys every register list accepts (prefix `-` for descending). */
export const PRIVACY_SORTS = [
  '-created_at',
  'created_at',
  '-updated_at',
  'code',
  'title',
  'status',
  'due',
  '-due',
] as const;
export type PrivacySort = (typeof PRIVACY_SORTS)[number];

export type ScreeningCriterion = (typeof SCREENING_CRITERIA)[number];
export type ScreeningResult = (typeof SCREENING_RESULTS)[number];
export type Level = (typeof LEVELS)[number];
export type Decision = (typeof DECISIONS)[number];
export type ClockStatus = (typeof CLOCK_STATUSES)[number];

// --- records ----------------------------------------------------------------------

/** Fields every privacy record returns. */
export interface PrivacyRecord {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly owner_user_id: string | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  /** Portal path of the detail page, `/privacy/<segment>/<id>`. */
  readonly url: string;
}

export interface RopaEntry extends PrivacyRecord {
  readonly role: string;
  readonly controller_name: string | null;
  readonly purposes: string | null;
  readonly data_subject_categories: readonly string[];
  readonly data_categories: readonly string[];
  readonly special_categories: readonly string[];
  readonly recipients: readonly string[];
  readonly systems: readonly string[];
  readonly legal_basis: string | null;
  readonly special_category_condition: string | null;
  readonly retention_period: string | null;
  readonly security_measures: string | null;
  readonly international_transfers: boolean;
  readonly transfer_countries: readonly string[];
  readonly department_id: string | null;
  readonly review_due_at: string | null;
}

export interface DpiaRisk {
  readonly description: string;
  readonly likelihood: Level;
  readonly severity: Level;
  readonly mitigation?: string | null;
  readonly residual?: Level | null;
}

export interface Dpia extends PrivacyRecord {
  readonly ropa_entry_id: string | null;
  readonly screening: Readonly<Record<string, boolean>>;
  readonly screening_result: ScreeningResult;
  readonly necessity_assessment: string | null;
  readonly risks: readonly DpiaRisk[];
  readonly measures: string | null;
  readonly residual_risk: Level | null;
  readonly dpo_advice: string | null;
  readonly prior_consultation_required: boolean;
  readonly decision_comment: string | null;
  readonly decided_by: string | null;
  readonly decided_at: string | null;
  readonly review_due_at: string | null;
}

export interface DataSubjectRequest extends PrivacyRecord {
  readonly request_type: string;
  readonly requester_name: string;
  readonly requester_contact: string | null;
  readonly subject_reference: string | null;
  readonly channel: string;
  readonly received_at: string;
  readonly due_at: string;
  readonly extended: boolean;
  readonly extension_reason: string | null;
  readonly extended_due_at: string | null;
  readonly effective_due_at: string;
  readonly is_overdue: boolean;
  readonly days_remaining: number | null;
  readonly identity_verified_at: string | null;
  readonly outcome: string | null;
  readonly responded_at: string | null;
  readonly closed_at: string | null;
  readonly task_id: string | null;
}

export interface DataBreach extends PrivacyRecord {
  readonly aware_at: string;
  readonly occurred_at: string | null;
  readonly contained_at: string | null;
  readonly notification_deadline: string;
  readonly clock_status: ClockStatus;
  readonly hours_remaining: number | null;
  readonly breach_types: readonly string[];
  readonly data_categories: readonly string[];
  readonly special_categories: boolean;
  readonly approx_subjects: number | null;
  readonly approx_records: number | null;
  readonly consequences: string | null;
  readonly measures_taken: string | null;
  readonly risk_level: string | null;
  readonly authority_notification_required: boolean | null;
  readonly authority_decision_reason: string | null;
  readonly authority_notified_at: string | null;
  readonly authority_reference: string | null;
  readonly authority_delay_reason: string | null;
  readonly subjects_notification_required: boolean | null;
  readonly subjects_decision_reason: string | null;
  readonly subjects_exemption: string | null;
  readonly subjects_notified_at: string | null;
  readonly closed_at: string | null;
  readonly task_id: string | null;
}

export interface Processor extends PrivacyRecord {
  readonly contact: string | null;
  readonly country: string | null;
  readonly is_sub_processor: boolean;
  readonly parent_processor_id: string | null;
  readonly data_categories: readonly string[];
  readonly dpa_status: string;
  readonly dpa_signed_at: string | null;
  readonly dpa_expires_at: string | null;
  readonly risk_rating: Level | null;
  readonly last_assessed_at: string | null;
  readonly review_due_at: string | null;
}

export interface TransferAssessment extends PrivacyRecord {
  readonly ropa_entry_id: string | null;
  readonly processor_id: string | null;
  readonly destination_country: string;
  readonly mechanism: string;
  readonly scc_module: string | null;
  readonly derogation: string | null;
  readonly tia_status: string;
  readonly tia_conclusion: string | null;
  readonly tia_summary: string | null;
  readonly supplementary_measures: string | null;
  readonly review_due_at: string | null;
}

export interface RetentionSchedule extends PrivacyRecord {
  readonly ropa_entry_id: string | null;
  readonly data_category: string;
  readonly retention_period: string;
  readonly retention_months: number | null;
  readonly trigger_event: string | null;
  readonly legal_reference: string | null;
  readonly disposal_method: string;
  readonly review_due_at: string | null;
}

export interface ConsentRecord extends PrivacyRecord {
  readonly ropa_entry_id: string | null;
  readonly subject_reference: string;
  readonly given_at: string;
  readonly method: string;
  readonly notice_version: string | null;
  readonly evidence_reference: string | null;
  readonly withdrawn_at: string | null;
}

export interface LegalBasisAssessment extends PrivacyRecord {
  readonly ropa_entry_id: string | null;
  readonly legal_basis: string;
  readonly justification: string | null;
  readonly purpose_test: string | null;
  readonly necessity_test: string | null;
  readonly balancing_test: string | null;
  readonly safeguards: string | null;
  readonly is_lia: boolean;
  readonly decision_comment: string | null;
  readonly decided_by: string | null;
  readonly decided_at: string | null;
  readonly review_due_at: string | null;
}

export type AnyPrivacyRecord =
  | RopaEntry
  | Dpia
  | DataSubjectRequest
  | DataBreach
  | Processor
  | TransferAssessment
  | RetentionSchedule
  | ConsentRecord
  | LegalBasisAssessment;

export interface PrivacyList<T extends PrivacyRecord = PrivacyRecord> {
  readonly items: readonly T[];
  readonly total: number;
}

/** Query of `GET /<segment>`; `extra` carries the register-specific filters. */
export interface PrivacyListQuery {
  readonly q?: string;
  readonly status?: readonly string[];
  readonly owner?: string;
  readonly sort?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly overdue?: boolean;
  readonly extra?: Readonly<Record<string, string | undefined>>;
}

/** A create body or partial update body (`change_reason` allowed on PATCH). */
export type PrivacyBody = Readonly<Record<string, unknown>>;

export interface DecisionBody {
  readonly decision: Decision;
  readonly comment?: string | null;
}

export interface PrivacyOverview {
  readonly ropa_active: number;
  readonly ropa_total: number;
  readonly dpias_open: number;
  readonly dpias_required_undecided: number;
  /** `null` when the caller lacks `privacy:requests`. */
  readonly dsr_open: number | null;
  readonly dsr_overdue: number | null;
  readonly breaches_open: number;
  readonly breaches_clock_running: number;
  readonly breaches_overdue: number;
  readonly processors_without_dpa: number;
  readonly transfers_missing_tia: number;
  readonly reviews_overdue: number;
}

export interface ScreeningOutcome {
  readonly result: ScreeningResult;
  readonly met: readonly string[];
  readonly criteria: readonly string[];
}

/** `privacy.screen_dpia` assist result. */
export interface ScreeningSuggestion {
  readonly screening: Readonly<Record<string, boolean>>;
  readonly rationale: Readonly<Record<string, string>>;
  readonly summary: string | null;
  readonly result: ScreeningResult;
  readonly met: readonly string[];
}

/** `privacy.draft_ropa` assist result. */
export interface RopaDraft {
  readonly title?: string;
  readonly role?: string;
  readonly purposes?: string | null;
  readonly data_subject_categories?: readonly string[];
  readonly data_categories?: readonly string[];
  readonly special_categories?: readonly string[];
  readonly recipients?: readonly string[];
  readonly systems?: readonly string[];
  readonly legal_basis?: string | null;
  readonly retention_period?: string | null;
  readonly security_measures?: string | null;
  readonly international_transfers?: boolean;
  readonly transfer_countries?: readonly string[];
  readonly notes?: string | null;
}

/**
 * The same rule the backend applies: two or more criteria met means a DPIA is
 * required, one means recommended, none means not required.
 */
export function screeningResult(screening: Readonly<Record<string, boolean>>): ScreeningOutcome {
  const met = SCREENING_CRITERIA.filter((c) => screening[c]);
  const result: ScreeningResult =
    met.length >= 2 ? 'required' : met.length === 1 ? 'recommended' : 'not_required';
  return { result, met, criteria: [...SCREENING_CRITERIA] };
}
