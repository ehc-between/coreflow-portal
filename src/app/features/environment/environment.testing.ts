import {
  Aspect,
  Drill,
  EmergencyPlan,
  Emissions,
  EnvironmentOverview,
  Measurement,
  Metric,
  ScoringMethod,
} from './data/environment.models';

/** Test-only fixtures for the environment specs (not used by app code). */
export function makeMethod(overrides: Partial<ScoringMethod> = {}): ScoringMethod {
  return {
    method: 'sum',
    criteria: [
      {
        key: 'severity',
        label: { en: 'Severity', nb: 'Alvorlighet' },
        description: {
          en: 'How much harm the impact can do',
          nb: 'Hvor stor skade påvirkningen kan gjøre',
        },
        weight: 1,
        levels: { '5': { en: 'Severe and lasting harm', nb: 'Alvorlig og varig skade' } },
      },
      { key: 'probability', label: { en: 'Probability', nb: 'Sannsynlighet' }, weight: 1 },
      { key: 'extent', label: { en: 'Extent', nb: 'Omfang' }, weight: 1 },
      { key: 'stakeholder_concern', label: { en: 'Concern', nb: 'Bekymring' }, weight: 1 },
    ],
    scale_min: 1,
    scale_max: 5,
    threshold: 12,
    legal_requirement_significant: true,
    emergency_significant: false,
    max_score: 20,
    is_default: true,
    ...overrides,
  };
}

export function makeAspect(overrides: Partial<Aspect> = {}): Aspect {
  return {
    id: 'a-1',
    org_id: 'org-1',
    code: 'ASP-001',
    activity: 'Vehicle washing',
    aspect: 'Wash water discharge',
    impact: 'Pollution of the stream',
    impact_type: 'water',
    condition: 'normal',
    lifecycle_stages: ['use'],
    control_level: 'direct',
    site: 'Depot',
    scores: { severity: 4, probability: 3, extent: 2, stakeholder_concern: 4 },
    score: 13,
    evaluated: true,
    computed_significant: true,
    significant: true,
    significance_reasons: ['score'],
    significance_override: null,
    override_reason: null,
    legal_requirement: false,
    operational_controls: 'Oil separator',
    status: 'active',
    owner_user_id: 'u-1',
    owner_name: 'Ada',
    department_id: null,
    review_due_at: '2027-01-01T00:00:00',
    last_reviewed_at: null,
    review_overdue: false,
    url: '/environment/aspects/a-1',
    created_by: 'u-1',
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-01-02T10:00:00',
    ...overrides,
  };
}

export function makePlan(overrides: Partial<EmergencyPlan> = {}): EmergencyPlan {
  return {
    id: 'p-1',
    org_id: 'org-1',
    code: 'ERP-001',
    title: 'Diesel spill at the depot',
    scenario: 'Leak during refilling',
    potential_impact: 'Soil and water pollution',
    response_procedure: '1. Stop the pump.',
    resources: 'Spill kit',
    contacts: [{ name: 'Site manager', role: 'Manager', phone: '123', email: null }],
    site: 'Depot',
    status: 'active',
    owner_user_id: 'u-1',
    owner_name: 'Ada',
    department_id: null,
    drill_rrule: 'FREQ=YEARLY',
    drill_recurrence_id: 'r-1',
    next_drill_due_at: '2026-06-01T00:00:00',
    last_drill_at: null,
    last_drill_outcome: null,
    drill_count: 0,
    drill_overdue: false,
    review_due_at: null,
    last_reviewed_at: null,
    review_overdue: false,
    url: '/environment/emergency-plans/p-1',
    created_by: 'u-1',
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-01-02T10:00:00',
    ...overrides,
  };
}

export function makeDrill(overrides: Partial<Drill> = {}): Drill {
  return {
    id: 'd-1',
    plan_id: 'p-1',
    held_at: '2026-03-01T09:00:00',
    kind: 'drill',
    outcome: 'partially_effective',
    participants: 12,
    findings: 'Spill kit was missing',
    lessons_learned: 'Check kit monthly',
    plan_revision_needed: true,
    recorded_by: 'u-1',
    recorded_by_name: 'Ada',
    completed_task_id: null,
    created_at: '2026-03-01T10:00:00',
    ...overrides,
  };
}

export function makeMetric(overrides: Partial<Metric> = {}): Metric {
  return {
    id: 'm-1',
    org_id: 'org-1',
    code: 'MET-001',
    name: 'Diesel for vans',
    category: 'energy',
    unit: 'l',
    ghg_scope: 'scope1',
    emission_factor: 2.68,
    description: null,
    site: null,
    status: 'active',
    owner_user_id: 'u-1',
    owner_name: 'Ada',
    department_id: null,
    collection_rrule: 'FREQ=MONTHLY',
    collection_recurrence_id: 'r-2',
    measurement_count: 1,
    latest_value: 500,
    latest_period_end: '2026-02-28',
    url: '/environment/metrics/m-1',
    created_by: 'u-1',
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-01-02T10:00:00',
    ...overrides,
  };
}

export function makeMeasurement(overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: 'x-1',
    metric_id: 'm-1',
    period_start: '2026-02-01',
    period_end: '2026-02-28',
    value: 500,
    unit: 'l',
    emission_factor: 2.68,
    co2e_kg: 1340,
    site: null,
    note: null,
    recorded_by: 'u-1',
    recorded_by_name: 'Ada',
    can_edit: true,
    created_at: '2026-03-01T10:00:00',
    updated_at: '2026-03-01T10:00:00',
    ...overrides,
  };
}

export function makeOverview(overrides: Partial<EnvironmentOverview> = {}): EnvironmentOverview {
  return {
    aspects_total: 5,
    aspects_significant: 2,
    aspects_draft: 1,
    aspects_review_overdue: 0,
    plans_total: 2,
    plans_active: 2,
    plans_drill_overdue: 1,
    plans_review_overdue: 0,
    metrics_active: 3,
    measurements_last_12_months: 30,
    emissions_ytd_kg: 12500,
    ...overrides,
  };
}

export function makeEmissions(overrides: Partial<Emissions> = {}): Emissions {
  return {
    year: 2026,
    scopes: { scope1: 3000, scope2: 1000, scope3: 0 },
    scope_status: { scope1: 'measured', scope2: 'measured', scope3: 'not_measured' },
    total_kg: 4000,
    total_t: 4,
    by_metric: [
      {
        metric_id: 'm-1',
        code: 'MET-001',
        name: 'Diesel for vans',
        ghg_scope: 'scope1',
        unit: 'l',
        value: 1119.4,
        co2e_kg: 3000,
        emission_factor: 2.68,
        factor_source: 'Norwegian Environment Agency',
        factor_year: 2025,
        previous_co2e_kg: 3300,
        change_pct: -9.1,
        url: '/environment/metrics/m-1',
      },
    ],
    previous_year: { year: 2025, scopes: { scope1: 3300 }, total_kg: 3300 },
    change_pct: 21.2,
    scope_change_pct: { scope1: -9.1, scope2: null, scope3: null },
    missing_factor: [
      {
        metric_id: 'm-2',
        code: 'MET-003',
        name: 'Water',
        unit: 'm3',
        category: 'water',
        ghg_scope: null,
        reason: 'no_factor',
        url: '/environment/metrics/m-2',
      },
    ],
    ...overrides,
  };
}
