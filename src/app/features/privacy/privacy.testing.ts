import {
  DataBreach,
  DataSubjectRequest,
  Dpia,
  PrivacyRecord,
  RopaEntry,
} from './data/privacy.models';

/** Test-only fixtures for the privacy specs (not used by app code). */
function base(overrides: Partial<PrivacyRecord> = {}): PrivacyRecord {
  return {
    id: 'r-1',
    org_id: 'org-1',
    code: 'ROPA-0001',
    title: 'Payroll',
    description: null,
    status: 'draft',
    owner_user_id: 'u-1',
    created_by: 'u-1',
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-02T10:00:00',
    url: '/privacy/ropa/r-1',
    ...overrides,
  };
}

export function makeRopa(overrides: Partial<RopaEntry> = {}): RopaEntry {
  return {
    ...base(),
    role: 'controller',
    controller_name: null,
    purposes: 'Pay salaries',
    data_subject_categories: ['Employees'],
    data_categories: ['Bank account'],
    special_categories: [],
    recipients: ['Tax authority'],
    systems: [],
    legal_basis: 'legal_obligation',
    special_category_condition: null,
    retention_period: '5 years',
    security_measures: null,
    international_transfers: false,
    transfer_countries: [],
    department_id: null,
    review_due_at: '2027-01-15T00:00:00',
    ...overrides,
  };
}

export function makeDsr(overrides: Partial<DataSubjectRequest> = {}): DataSubjectRequest {
  return {
    ...base({ id: 'd-1', code: 'DSR-0001', title: 'DSR-0001', status: 'received' }),
    url: '/privacy/data-subject-requests/d-1',
    request_type: 'access',
    requester_name: 'Kari Nordmann',
    requester_contact: 'kari@example.com',
    subject_reference: 'C-123',
    channel: 'email',
    received_at: '2026-11-01T09:00:00',
    due_at: '2026-12-01T09:00:00',
    extended: false,
    extension_reason: null,
    extended_due_at: null,
    effective_due_at: '2026-12-01T09:00:00',
    is_overdue: false,
    days_remaining: 19,
    identity_verified_at: null,
    outcome: null,
    responded_at: null,
    closed_at: null,
    task_id: 't-1',
    ...overrides,
  };
}

export function makeBreach(overrides: Partial<DataBreach> = {}): DataBreach {
  return {
    ...base({ id: 'b-1', code: 'BR-0001', title: 'Lost laptop', status: 'open' }),
    url: '/privacy/breaches/b-1',
    aware_at: '2026-11-11T08:00:00',
    occurred_at: null,
    contained_at: null,
    notification_deadline: '2026-11-14T08:00:00',
    clock_status: 'running',
    hours_remaining: 30.5,
    breach_types: ['confidentiality'],
    data_categories: [],
    special_categories: false,
    approx_subjects: 120,
    approx_records: null,
    consequences: null,
    measures_taken: null,
    risk_level: 'risk',
    authority_notification_required: null,
    authority_decision_reason: null,
    authority_notified_at: null,
    authority_reference: null,
    authority_delay_reason: null,
    subjects_notification_required: null,
    subjects_decision_reason: null,
    subjects_exemption: null,
    subjects_notified_at: null,
    closed_at: null,
    task_id: 't-2',
    ...overrides,
  };
}

export function makeDpia(overrides: Partial<Dpia> = {}): Dpia {
  return {
    ...base({
      id: 'p-1',
      code: 'DPIA-0001',
      title: 'Location tracking',
      status: 'awaiting_decision',
    }),
    url: '/privacy/dpias/p-1',
    ropa_entry_id: null,
    screening: { systematic_monitoring: true, vulnerable_subjects: true },
    screening_result: 'required',
    necessity_assessment: 'Needed for safety',
    risks: [{ description: 'Over-monitoring', likelihood: 'medium', severity: 'high' }],
    measures: null,
    residual_risk: 'medium',
    dpo_advice: null,
    prior_consultation_required: false,
    decision_comment: null,
    decided_by: null,
    decided_at: null,
    review_due_at: null,
    ...overrides,
  };
}
