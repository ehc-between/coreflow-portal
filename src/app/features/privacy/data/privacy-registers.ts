import {
  BREACH_RISKS,
  BREACH_STATUSES,
  BREACH_TYPES,
  CONSENT_METHODS,
  CONSENT_STATUSES,
  DEROGATIONS,
  DISPOSAL_METHODS,
  DPA_STATUSES,
  DPIA_STATUSES,
  DSR_CHANNELS,
  DSR_STATUSES,
  DSR_TYPES,
  LBA_STATUSES,
  LEGAL_BASES,
  LEVELS,
  PERM_READ,
  PERM_REQUESTS,
  PERM_WRITE,
  PROCESSOR_STATUSES,
  RETENTION_STATUSES,
  ROPA_ROLES,
  ROPA_STATUSES,
  SCC_MODULES,
  SCREENING_RESULTS,
  SPECIAL_CATEGORY_CONDITIONS,
  SUBJECTS_EXEMPTIONS,
  TIA_CONCLUSIONS,
  TIA_STATUSES,
  TRANSFER_MECHANISMS,
  TRANSFER_STATUSES,
} from './privacy.models';

/** The nine registers; also the guidance page and i18n group of each. */
export const REGISTER_KEYS = [
  'ropa',
  'dpia',
  'dsr',
  'breach',
  'processor',
  'transfer',
  'retention',
  'consent',
  'lba',
] as const;
export type RegisterKey = (typeof REGISTER_KEYS)[number];

/**
 * How a field is edited and shown:
 * - `text`, `textarea`, `number`: plain inputs;
 * - `select`: one value of `options` (labels `privacy.options.<optionSet>.<value>`), empty = null;
 * - `multi`: several values of `options` (checkboxes);
 * - `tags`: free-text list;
 * - `boolean`: checkbox; `tristate`: undecided / yes / no (nullable boolean);
 * - `date`: a calendar day; `datetime`: a moment (local time in the form, naive UTC on the wire);
 * - `ref`: a record of another register (`ref`); `owner`: an org member; `department`;
 * - `screening`: the DPIA screening checklist; `risks`: the DPIA risk table.
 */
export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multi'
  | 'tags'
  | 'boolean'
  | 'tristate'
  | 'date'
  | 'datetime'
  | 'ref'
  | 'owner'
  | 'department'
  | 'screening'
  | 'risks';

export type FormValues = Readonly<Record<string, unknown>>;

export interface FieldDef {
  readonly key: string;
  readonly kind: FieldKind;
  /** Form section (`privacy.form.sections.<section>`). */
  readonly section: string;
  readonly options?: readonly string[];
  readonly optionSet?: string;
  readonly ref?: RegisterKey;
  readonly required?: boolean;
  /** Only on create (the backend has no PATCH for it). */
  readonly createOnly?: boolean;
  /** Only on edit (PATCH-only fields such as decisions and outcomes). */
  readonly editOnly?: boolean;
  /** Label override (default `privacy.fields.<key>`). */
  readonly labelKey?: string;
  /** Full width in the form grid. */
  readonly wide?: boolean;
  readonly maxLength?: number;
  /** Show the field only when this holds for the current form values. */
  readonly showIf?: (values: FormValues) => boolean;
}

/** A read-only (computed) value shown on the detail page. */
export interface FactDef {
  readonly key: string;
  readonly kind: 'text' | 'select' | 'boolean' | 'date' | 'datetime' | 'owner';
  readonly optionSet?: string;
  readonly labelKey?: string;
}

/** A register-specific list filter (`GET /<segment>?<param>=`). */
export interface FilterDef {
  readonly param: string;
  readonly options: readonly string[];
  readonly optionSet: string;
}

export interface RegisterDef {
  readonly key: RegisterKey;
  /** URL segment, both in the API (`/privacy/<segment>`) and in the portal. */
  readonly segment: string;
  readonly entityType: string;
  readonly codePrefix: string;
  readonly readPermission: string;
  readonly writePermission: string;
  /** Extra permission on top of `privacy:manage` for delete. */
  readonly deletePermissions: readonly string[];
  readonly statuses: readonly string[];
  /** Statuses a user may set through PATCH from the detail page (empty: none). */
  readonly settableStatuses: readonly string[];
  /** Statuses that count as closed (hidden by the default "open" list filter). */
  readonly closedStatuses: readonly string[];
  /** Whether revisions are kept (not for records holding personal data). */
  readonly revisions: boolean;
  /** Whether the list supports `overdue=`. */
  readonly overdue: boolean;
  /** Whether `sort=due` means something useful (a deadline or review date). */
  readonly hasDue: boolean;
  /** Whether the record carries personal data (code-only in notifications). */
  readonly personal: boolean;
  /** Icon of the register card / nav pill. */
  readonly icon: string;
  readonly fields: readonly FieldDef[];
  readonly facts: readonly FactDef[];
  readonly filters: readonly FilterDef[];
  /** Clause references shown with the register (`gdpr:30`, `iso27001:A.5.34`). */
  readonly clauses: readonly string[];
}

const isTrue = (key: string) => (v: FormValues) => v[key] === true;
const isFalse = (key: string) => (v: FormValues) => v[key] === false;
const notFalse = (key: string) => (v: FormValues) => v[key] !== false;
const hasItems = (key: string) => (v: FormValues) =>
  Array.isArray(v[key]) && (v[key] as unknown[]).length > 0;
const equals = (key: string, value: string) => (v: FormValues) => v[key] === value;
const hasValue = (key: string) => (v: FormValues) => !!v[key];

const COMMON_HEAD: readonly FieldDef[] = [
  { key: 'title', kind: 'text', section: 'basics', required: true, wide: true, maxLength: 255 },
  { key: 'owner_user_id', kind: 'owner', section: 'basics' },
];
const description: FieldDef = {
  key: 'description',
  kind: 'textarea',
  section: 'basics',
  wide: true,
  maxLength: 10000,
};
const reviewDue: FieldDef = { key: 'review_due_at', kind: 'date', section: 'review' };
const ropaRef: FieldDef = { key: 'ropa_entry_id', kind: 'ref', ref: 'ropa', section: 'basics' };
const decided: readonly FactDef[] = [
  { key: 'decided_by', kind: 'owner' },
  { key: 'decided_at', kind: 'datetime' },
  { key: 'decision_comment', kind: 'text' },
];

export const REGISTERS: Readonly<Record<RegisterKey, RegisterDef>> = {
  ropa: {
    key: 'ropa',
    segment: 'ropa',
    entityType: 'ropa_entry',
    codePrefix: 'ROPA',
    readPermission: PERM_READ,
    writePermission: PERM_WRITE,
    deletePermissions: [],
    statuses: ROPA_STATUSES,
    settableStatuses: ROPA_STATUSES,
    closedStatuses: ['retired'],
    revisions: true,
    overdue: true,
    hasDue: true,
    personal: false,
    icon: 'documents',
    fields: [
      ...COMMON_HEAD,
      {
        key: 'role',
        kind: 'select',
        options: ROPA_ROLES,
        optionSet: 'ropaRole',
        section: 'basics',
      },
      { key: 'department_id', kind: 'department', section: 'basics' },
      {
        key: 'controller_name',
        kind: 'text',
        section: 'basics',
        maxLength: 255,
      },
      description,
      { key: 'purposes', kind: 'textarea', section: 'processing', wide: true, maxLength: 10000 },
      {
        key: 'legal_basis',
        kind: 'select',
        options: LEGAL_BASES,
        optionSet: 'legalBasis',
        section: 'processing',
      },
      { key: 'retention_period', kind: 'text', section: 'processing', maxLength: 255 },
      { key: 'data_subject_categories', kind: 'tags', section: 'data' },
      { key: 'data_categories', kind: 'tags', section: 'data' },
      { key: 'special_categories', kind: 'tags', section: 'data' },
      {
        key: 'special_category_condition',
        kind: 'select',
        options: SPECIAL_CATEGORY_CONDITIONS,
        optionSet: 'specialCondition',
        section: 'data',
        showIf: hasItems('special_categories'),
      },
      { key: 'recipients', kind: 'tags', section: 'data' },
      { key: 'systems', kind: 'tags', section: 'data' },
      {
        key: 'security_measures',
        kind: 'textarea',
        section: 'security',
        wide: true,
        maxLength: 10000,
      },
      { key: 'international_transfers', kind: 'boolean', section: 'security' },
      {
        key: 'transfer_countries',
        kind: 'tags',
        section: 'security',
        showIf: isTrue('international_transfers'),
      },
      reviewDue,
    ],
    facts: [],
    filters: [
      { param: 'role', options: ROPA_ROLES, optionSet: 'ropaRole' },
      { param: 'legal_basis', options: LEGAL_BASES, optionSet: 'legalBasis' },
    ],
    clauses: ['gdpr:30', 'gdpr:5', 'gdpr:6'],
  },
  dpia: {
    key: 'dpia',
    segment: 'dpias',
    entityType: 'dpia',
    codePrefix: 'DPIA',
    readPermission: PERM_READ,
    writePermission: PERM_WRITE,
    deletePermissions: [],
    statuses: DPIA_STATUSES,
    settableStatuses: ['screening', 'not_required', 'in_progress', 'awaiting_decision'],
    closedStatuses: ['not_required', 'approved', 'rejected'],
    revisions: true,
    overdue: true,
    hasDue: true,
    personal: false,
    icon: 'risk',
    fields: [
      ...COMMON_HEAD,
      ropaRef,
      description,
      { key: 'screening', kind: 'screening', section: 'screening', wide: true },
      {
        key: 'necessity_assessment',
        kind: 'textarea',
        section: 'assessment',
        wide: true,
        maxLength: 10000,
      },
      { key: 'risks', kind: 'risks', section: 'assessment', wide: true },
      { key: 'measures', kind: 'textarea', section: 'assessment', wide: true, maxLength: 10000 },
      {
        key: 'residual_risk',
        kind: 'select',
        options: LEVELS,
        optionSet: 'level',
        section: 'assessment',
      },
      { key: 'dpo_advice', kind: 'textarea', section: 'assessment', wide: true, maxLength: 10000 },
      reviewDue,
    ],
    facts: [
      { key: 'screening_result', kind: 'select', optionSet: 'screeningResult' },
      { key: 'prior_consultation_required', kind: 'boolean' },
      ...decided,
    ],
    filters: [
      { param: 'screening_result', options: SCREENING_RESULTS, optionSet: 'screeningResult' },
    ],
    clauses: ['gdpr:35', 'gdpr:36', 'gdpr:32'],
  },
  dsr: {
    key: 'dsr',
    segment: 'data-subject-requests',
    entityType: 'data_subject_request',
    codePrefix: 'DSR',
    readPermission: PERM_REQUESTS,
    writePermission: PERM_REQUESTS,
    deletePermissions: [PERM_REQUESTS],
    statuses: DSR_STATUSES,
    settableStatuses: DSR_STATUSES,
    closedStatuses: ['completed', 'rejected', 'withdrawn'],
    revisions: false,
    overdue: true,
    hasDue: true,
    personal: true,
    icon: 'inbox',
    fields: [
      {
        key: 'request_type',
        kind: 'select',
        options: DSR_TYPES,
        optionSet: 'dsrType',
        section: 'basics',
        required: true,
      },
      {
        key: 'channel',
        kind: 'select',
        options: DSR_CHANNELS,
        optionSet: 'dsrChannel',
        section: 'basics',
      },
      { key: 'received_at', kind: 'datetime', section: 'basics', createOnly: true },
      { key: 'owner_user_id', kind: 'owner', section: 'basics' },
      {
        key: 'title',
        kind: 'text',
        section: 'basics',
        wide: true,
        maxLength: 255,
        labelKey: 'privacy.fields.dsrTitle',
      },
      description,
      {
        key: 'requester_name',
        kind: 'text',
        section: 'requester',
        required: true,
        maxLength: 255,
      },
      { key: 'requester_contact', kind: 'text', section: 'requester', maxLength: 255 },
      { key: 'subject_reference', kind: 'text', section: 'requester', maxLength: 255 },
      { key: 'identity_verified_at', kind: 'datetime', section: 'handling', editOnly: true },
      { key: 'responded_at', kind: 'datetime', section: 'handling', editOnly: true },
      {
        key: 'outcome',
        kind: 'textarea',
        section: 'handling',
        wide: true,
        maxLength: 10000,
        editOnly: true,
      },
    ],
    facts: [
      { key: 'received_at', kind: 'datetime' },
      { key: 'due_at', kind: 'datetime' },
      { key: 'extended_due_at', kind: 'datetime' },
      { key: 'extension_reason', kind: 'text' },
      { key: 'closed_at', kind: 'datetime' },
    ],
    filters: [{ param: 'request_type', options: DSR_TYPES, optionSet: 'dsrType' }],
    clauses: ['gdpr:12', 'gdpr:15', 'gdpr:17'],
  },
  breach: {
    key: 'breach',
    segment: 'breaches',
    entityType: 'data_breach',
    codePrefix: 'BR',
    readPermission: PERM_READ,
    writePermission: PERM_WRITE,
    deletePermissions: [],
    statuses: BREACH_STATUSES,
    settableStatuses: ['open', 'assessing', 'closed'],
    closedStatuses: ['closed'],
    revisions: true,
    overdue: true,
    hasDue: true,
    personal: false,
    icon: 'alert',
    fields: [
      ...COMMON_HEAD,
      description,
      { key: 'aware_at', kind: 'datetime', section: 'timing', createOnly: true },
      { key: 'occurred_at', kind: 'datetime', section: 'timing' },
      { key: 'contained_at', kind: 'datetime', section: 'timing' },
      {
        key: 'breach_types',
        kind: 'multi',
        options: BREACH_TYPES,
        optionSet: 'breachType',
        section: 'impact',
        wide: true,
      },
      { key: 'data_categories', kind: 'tags', section: 'impact' },
      { key: 'special_categories', kind: 'boolean', section: 'impact' },
      { key: 'approx_subjects', kind: 'number', section: 'impact' },
      { key: 'approx_records', kind: 'number', section: 'impact' },
      { key: 'consequences', kind: 'textarea', section: 'impact', wide: true, maxLength: 10000 },
      { key: 'measures_taken', kind: 'textarea', section: 'impact', wide: true, maxLength: 10000 },
      {
        key: 'risk_level',
        kind: 'select',
        options: BREACH_RISKS,
        optionSet: 'breachRisk',
        section: 'impact',
      },
      {
        key: 'authority_notification_required',
        kind: 'tristate',
        section: 'authority',
        editOnly: true,
      },
      {
        key: 'authority_decision_reason',
        kind: 'textarea',
        section: 'authority',
        wide: true,
        maxLength: 10000,
        editOnly: true,
        showIf: isFalse('authority_notification_required'),
      },
      {
        key: 'authority_notified_at',
        kind: 'datetime',
        section: 'authority',
        editOnly: true,
        showIf: notFalse('authority_notification_required'),
      },
      {
        key: 'authority_reference',
        kind: 'text',
        section: 'authority',
        maxLength: 120,
        editOnly: true,
        showIf: notFalse('authority_notification_required'),
      },
      {
        key: 'authority_delay_reason',
        kind: 'textarea',
        section: 'authority',
        wide: true,
        maxLength: 10000,
        editOnly: true,
        showIf: hasValue('authority_notified_at'),
      },
      {
        key: 'subjects_notification_required',
        kind: 'tristate',
        section: 'subjects',
        editOnly: true,
      },
      {
        key: 'subjects_decision_reason',
        kind: 'textarea',
        section: 'subjects',
        wide: true,
        maxLength: 10000,
        editOnly: true,
        showIf: isFalse('subjects_notification_required'),
      },
      {
        key: 'subjects_exemption',
        kind: 'select',
        options: SUBJECTS_EXEMPTIONS,
        optionSet: 'subjectsExemption',
        section: 'subjects',
        editOnly: true,
        showIf: isFalse('subjects_notification_required'),
      },
      {
        key: 'subjects_notified_at',
        kind: 'datetime',
        section: 'subjects',
        editOnly: true,
        showIf: notFalse('subjects_notification_required'),
      },
    ],
    facts: [
      { key: 'aware_at', kind: 'datetime' },
      { key: 'notification_deadline', kind: 'datetime' },
      { key: 'closed_at', kind: 'datetime' },
    ],
    filters: [{ param: 'risk_level', options: BREACH_RISKS, optionSet: 'breachRisk' }],
    clauses: ['gdpr:33', 'gdpr:34', 'iso27001:A.5.34'],
  },
  processor: {
    key: 'processor',
    segment: 'processors',
    entityType: 'processor',
    codePrefix: 'PRC',
    readPermission: PERM_READ,
    writePermission: PERM_WRITE,
    deletePermissions: [],
    statuses: PROCESSOR_STATUSES,
    settableStatuses: PROCESSOR_STATUSES,
    closedStatuses: ['offboarded'],
    revisions: true,
    overdue: true,
    hasDue: true,
    personal: false,
    icon: 'parts',
    fields: [
      ...COMMON_HEAD,
      { key: 'contact', kind: 'text', section: 'basics', maxLength: 255 },
      { key: 'country', kind: 'text', section: 'basics', maxLength: 64 },
      description,
      { key: 'is_sub_processor', kind: 'boolean', section: 'basics' },
      {
        key: 'parent_processor_id',
        kind: 'ref',
        ref: 'processor',
        section: 'basics',
        showIf: isTrue('is_sub_processor'),
      },
      { key: 'data_categories', kind: 'tags', section: 'basics', wide: true },
      {
        key: 'dpa_status',
        kind: 'select',
        options: DPA_STATUSES,
        optionSet: 'dpaStatus',
        section: 'dpa',
      },
      { key: 'dpa_signed_at', kind: 'date', section: 'dpa' },
      { key: 'dpa_expires_at', kind: 'date', section: 'dpa' },
      {
        key: 'risk_rating',
        kind: 'select',
        options: LEVELS,
        optionSet: 'level',
        section: 'review',
      },
      { key: 'last_assessed_at', kind: 'date', section: 'review' },
      reviewDue,
    ],
    facts: [],
    filters: [
      { param: 'dpa_status', options: DPA_STATUSES, optionSet: 'dpaStatus' },
      { param: 'risk_rating', options: LEVELS, optionSet: 'level' },
    ],
    clauses: ['gdpr:28', 'iso27001:A.5.20'],
  },
  transfer: {
    key: 'transfer',
    segment: 'transfers',
    entityType: 'transfer_assessment',
    codePrefix: 'TIA',
    readPermission: PERM_READ,
    writePermission: PERM_WRITE,
    deletePermissions: [],
    statuses: TRANSFER_STATUSES,
    settableStatuses: TRANSFER_STATUSES,
    closedStatuses: ['retired'],
    revisions: true,
    overdue: true,
    hasDue: true,
    personal: false,
    icon: 'arrow',
    fields: [
      ...COMMON_HEAD,
      ropaRef,
      { key: 'processor_id', kind: 'ref', ref: 'processor', section: 'basics' },
      description,
      {
        key: 'destination_country',
        kind: 'text',
        section: 'mechanism',
        required: true,
        maxLength: 64,
      },
      {
        key: 'mechanism',
        kind: 'select',
        options: TRANSFER_MECHANISMS,
        optionSet: 'mechanism',
        section: 'mechanism',
        required: true,
      },
      {
        key: 'scc_module',
        kind: 'select',
        options: SCC_MODULES,
        optionSet: 'sccModule',
        section: 'mechanism',
        showIf: equals('mechanism', 'sccs'),
      },
      {
        key: 'derogation',
        kind: 'select',
        options: DEROGATIONS,
        optionSet: 'derogation',
        section: 'mechanism',
        showIf: equals('mechanism', 'derogation'),
      },
      {
        key: 'tia_status',
        kind: 'select',
        options: TIA_STATUSES,
        optionSet: 'tiaStatus',
        section: 'tia',
      },
      {
        key: 'tia_conclusion',
        kind: 'select',
        options: TIA_CONCLUSIONS,
        optionSet: 'tiaConclusion',
        section: 'tia',
      },
      { key: 'tia_summary', kind: 'textarea', section: 'tia', wide: true, maxLength: 10000 },
      {
        key: 'supplementary_measures',
        kind: 'textarea',
        section: 'tia',
        wide: true,
        maxLength: 10000,
      },
      reviewDue,
    ],
    facts: [],
    filters: [
      { param: 'mechanism', options: TRANSFER_MECHANISMS, optionSet: 'mechanism' },
      { param: 'tia_status', options: TIA_STATUSES, optionSet: 'tiaStatus' },
    ],
    clauses: ['gdpr:44', 'gdpr:46', 'gdpr:49'],
  },
  retention: {
    key: 'retention',
    segment: 'retention-schedules',
    entityType: 'retention_schedule',
    codePrefix: 'RET',
    readPermission: PERM_READ,
    writePermission: PERM_WRITE,
    deletePermissions: [],
    statuses: RETENTION_STATUSES,
    settableStatuses: RETENTION_STATUSES,
    closedStatuses: ['retired'],
    revisions: true,
    overdue: true,
    hasDue: true,
    personal: false,
    icon: 'clock',
    fields: [
      ...COMMON_HEAD,
      ropaRef,
      description,
      {
        key: 'data_category',
        kind: 'text',
        section: 'rule',
        required: true,
        maxLength: 255,
      },
      {
        key: 'retention_period',
        kind: 'text',
        section: 'rule',
        required: true,
        maxLength: 120,
      },
      { key: 'retention_months', kind: 'number', section: 'rule' },
      { key: 'trigger_event', kind: 'text', section: 'rule', maxLength: 255 },
      { key: 'legal_reference', kind: 'text', section: 'rule', maxLength: 255 },
      {
        key: 'disposal_method',
        kind: 'select',
        options: DISPOSAL_METHODS,
        optionSet: 'disposal',
        section: 'rule',
      },
      reviewDue,
    ],
    facts: [],
    filters: [{ param: 'disposal_method', options: DISPOSAL_METHODS, optionSet: 'disposal' }],
    clauses: ['gdpr:5', 'gdpr:17', 'iso27001:A.5.33'],
  },
  consent: {
    key: 'consent',
    segment: 'consents',
    entityType: 'consent_record',
    codePrefix: 'CON',
    readPermission: PERM_REQUESTS,
    writePermission: PERM_REQUESTS,
    deletePermissions: [PERM_REQUESTS],
    statuses: CONSENT_STATUSES,
    settableStatuses: [],
    closedStatuses: ['withdrawn'],
    revisions: false,
    overdue: false,
    hasDue: false,
    personal: true,
    icon: 'checkcircle',
    fields: [
      {
        key: 'title',
        kind: 'text',
        section: 'basics',
        required: true,
        wide: true,
        maxLength: 255,
        labelKey: 'privacy.fields.consentPurpose',
      },
      {
        key: 'subject_reference',
        kind: 'text',
        section: 'basics',
        required: true,
        maxLength: 255,
      },
      { key: 'owner_user_id', kind: 'owner', section: 'basics' },
      ropaRef,
      description,
      { key: 'given_at', kind: 'datetime', section: 'evidence', createOnly: true },
      {
        key: 'method',
        kind: 'select',
        options: CONSENT_METHODS,
        optionSet: 'consentMethod',
        section: 'evidence',
      },
      { key: 'notice_version', kind: 'text', section: 'evidence', maxLength: 64 },
      { key: 'evidence_reference', kind: 'text', section: 'evidence', maxLength: 255 },
    ],
    facts: [
      { key: 'given_at', kind: 'datetime' },
      { key: 'withdrawn_at', kind: 'datetime' },
    ],
    filters: [{ param: 'method', options: CONSENT_METHODS, optionSet: 'consentMethod' }],
    clauses: ['gdpr:7'],
  },
  lba: {
    key: 'lba',
    segment: 'legal-basis-assessments',
    entityType: 'legal_basis_assessment',
    codePrefix: 'LBA',
    readPermission: PERM_READ,
    writePermission: PERM_WRITE,
    deletePermissions: [],
    statuses: LBA_STATUSES,
    settableStatuses: ['draft', 'awaiting_decision'],
    closedStatuses: ['approved', 'rejected'],
    revisions: true,
    overdue: true,
    hasDue: true,
    personal: false,
    icon: 'qa',
    fields: [
      ...COMMON_HEAD,
      ropaRef,
      {
        key: 'legal_basis',
        kind: 'select',
        options: LEGAL_BASES,
        optionSet: 'legalBasis',
        section: 'basics',
        required: true,
      },
      description,
      { key: 'justification', kind: 'textarea', section: 'tests', wide: true, maxLength: 10000 },
      {
        key: 'purpose_test',
        kind: 'textarea',
        section: 'tests',
        wide: true,
        maxLength: 10000,
        showIf: equals('legal_basis', 'legitimate_interests'),
      },
      {
        key: 'necessity_test',
        kind: 'textarea',
        section: 'tests',
        wide: true,
        maxLength: 10000,
        showIf: equals('legal_basis', 'legitimate_interests'),
      },
      {
        key: 'balancing_test',
        kind: 'textarea',
        section: 'tests',
        wide: true,
        maxLength: 10000,
        showIf: equals('legal_basis', 'legitimate_interests'),
      },
      { key: 'safeguards', kind: 'textarea', section: 'tests', wide: true, maxLength: 10000 },
      reviewDue,
    ],
    facts: [{ key: 'is_lia', kind: 'boolean' }, ...decided],
    filters: [{ param: 'legal_basis', options: LEGAL_BASES, optionSet: 'legalBasis' }],
    clauses: ['gdpr:6', 'gdpr:9'],
  },
};

export const REGISTER_LIST: readonly RegisterDef[] = REGISTER_KEYS.map((k) => REGISTERS[k]);

export function registerByEntityType(entityType: string): RegisterDef | null {
  return REGISTER_LIST.find((r) => r.entityType === entityType) ?? null;
}

export function isRegisterKey(value: unknown): value is RegisterKey {
  return typeof value === 'string' && (REGISTER_KEYS as readonly string[]).includes(value);
}

/** Every field section used by the registers (`privacy.form.sections.<section>`). */
export const FIELD_SECTIONS: readonly string[] = [
  ...new Set(REGISTER_LIST.flatMap((r) => r.fields.map((f) => f.section))),
];

/** Every option set and its values (`privacy.options.<set>.<value>`). */
export function optionSets(): Readonly<Record<string, readonly string[]>> {
  const out: Record<string, Set<string>> = {};
  const add = (set: string | undefined, values: readonly string[] | undefined) => {
    if (!set || !values) {
      return;
    }
    out[set] ??= new Set();
    values.forEach((v) => out[set].add(v));
  };
  for (const r of REGISTER_LIST) {
    r.fields.forEach((f) => add(f.optionSet, f.options));
    r.filters.forEach((f) => add(f.optionSet, f.options));
  }
  add('screeningResult', SCREENING_RESULTS);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

/** The label key of a field. */
export function fieldLabelKey(field: { key: string; labelKey?: string }): string {
  return field.labelKey ?? `privacy.fields.${field.key}`;
}

/** Revision snapshot field -> i18n key (the revisions tab of the kit). */
export function revisionFieldLabels(register: RegisterDef): Readonly<Record<string, string>> {
  const labels: Record<string, string> = {
    code: 'privacy.fields.code',
    status: 'privacy.fields.status',
  };
  for (const f of register.fields) {
    labels[f.key] = fieldLabelKey(f);
  }
  return labels;
}
