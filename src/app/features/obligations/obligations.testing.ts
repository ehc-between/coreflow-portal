import { Change, Evaluation, Obligation, ObligationListItem } from './data/obligation.models';

/** Test-only fixtures for the obligation specs (not used by app code). */
export function makeObligationItem(
  overrides: Partial<ObligationListItem> = {},
): ObligationListItem {
  return {
    id: 'o-1',
    org_id: 'org-1',
    code: 'OB-0001',
    title: 'Pollution Control Act permit',
    obligation_type: 'permit',
    status: 'active',
    compliance_status: 'compliant',
    jurisdiction: 'NO',
    issuer: 'Environment Agency',
    reference: '2019.0412.T',
    frameworks: ['iso14001'],
    owner: { id: 'u-1', name: 'Ada' },
    department_id: null,
    valid_from: '2024-01-01',
    valid_until: '2028-12-31',
    evaluation_rrule: 'FREQ=MONTHLY;INTERVAL=3',
    last_evaluated_at: '2026-09-01T10:00:00',
    next_evaluation: { task_id: 't-1', due_at: '2026-12-01T23:59:59', overdue: false },
    url: '/obligations/o-1',
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-09-01T10:00:00',
    ...overrides,
  };
}

export function makeEvaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    id: 'e-1',
    obligation_id: 'o-1',
    result: 'compliant',
    evaluated_on: '2026-09-01',
    evaluated_by: { id: 'u-1', name: 'Ada' },
    notes: 'Noise within limits.',
    evidence_summary: 'Q3 measurement report',
    attachment_ids: [],
    task_id: null,
    created_at: '2026-09-01T10:00:00',
    ...overrides,
  };
}

export function makeObligation(overrides: Partial<Obligation> = {}): Obligation {
  return {
    ...makeObligationItem(),
    description: 'Limits for noise and dust from the plant.',
    applicability: 'The Drammen plant.',
    requirements: ['Measure noise every quarter', 'Report emissions by 1 March'],
    source_url: 'https://example.org/permit',
    evaluation_start: '2026-03-01',
    evaluation_lead_days: 14,
    evaluation_recurrence_id: 'r-1',
    latest_evaluation: makeEvaluation(),
    evaluation_count: 1,
    open_changes: 0,
    created_by: { id: 'u-1', name: 'Ada' },
    can_edit: true,
    can_evaluate: true,
    can_delete: true,
    ...overrides,
  };
}

export function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: 'ch-1',
    obligation_id: 'o-1',
    noted_on: '2026-10-01',
    effective_on: '2027-07-01',
    title: 'New emission limits',
    details: null,
    source_url: null,
    impact: 'high',
    status: 'open',
    assessment: null,
    assessed_at: null,
    assessed_by: null,
    created_by: { id: 'u-1', name: 'Ada' },
    created_at: '2026-10-01T10:00:00',
    updated_at: '2026-10-01T10:00:00',
    ...overrides,
  };
}
