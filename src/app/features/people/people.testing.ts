import {
  ChecklistDetail,
  Competence,
  Employee,
  EmployeeCompetences,
  PositionDetail,
} from './data/people.models';

/** Test-only fixtures for the people specs (not used by app code). */
export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'e-1',
    org_id: 'org-1',
    code: 'EMP-0001',
    employee_number: null,
    full_name: 'Ada Lovelace',
    user: { id: 'u-1', name: 'Ada' },
    email: 'ada@example.com',
    phone: null,
    job_title: 'Engineer',
    position: { id: 'p-1', name: 'Service technician' },
    department: null,
    manager: null,
    employment_type: 'permanent',
    status: 'active',
    start_date: '2026-01-05',
    end_date: null,
    location: null,
    confidentiality_signed_on: null,
    security_terms_accepted_on: '2026-01-05',
    screening_status: 'completed',
    screening_completed_on: '2025-12-20',
    notes: null,
    gap_count: 1,
    open_checklists: 0,
    url: '/people/employees/e-1',
    can_edit: true,
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-01-02T10:00:00',
    ...overrides,
  };
}

export function makeHeld(overrides: Partial<EmployeeCompetences> = {}): EmployeeCompetences {
  return {
    employee_id: 'e-1',
    position_id: 'p-1',
    items: [
      {
        competence_id: 'c-1',
        competence_name: 'Electrical safety',
        category: 'certificate',
        required_level: 3,
        mandatory: true,
        level: 2,
        assessed_on: '2026-02-01',
        assessed_by: null,
        expires_on: null,
        evidence_note: null,
        status: 'gap',
      },
    ],
    gap_count: 1,
    ...overrides,
  };
}

export function makePosition(overrides: Partial<PositionDetail> = {}): PositionDetail {
  return {
    id: 'p-1',
    org_id: 'org-1',
    title: 'Service technician',
    code: 'TECH',
    description: null,
    responsibilities: 'Plans service jobs.',
    authorities: null,
    department: null,
    reports_to: null,
    risk_level: 'medium',
    status: 'active',
    owner: null,
    employee_count: 1,
    requirement_count: 1,
    url: '/people/positions/p-1',
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-01-02T10:00:00',
    requirements: [
      {
        competence_id: 'c-1',
        competence_name: 'Electrical safety',
        category: 'certificate',
        required_level: 3,
        mandatory: true,
        note: null,
      },
    ],
    ...overrides,
  };
}

export function makeCompetence(overrides: Partial<Competence> = {}): Competence {
  return {
    id: 'c-1',
    org_id: 'org-1',
    name: 'Electrical safety',
    category: 'certificate',
    description: null,
    validity_months: 12,
    status: 'active',
    position_count: 1,
    holder_count: 1,
    url: '/people/competences/c-1',
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-01-02T10:00:00',
    ...overrides,
  };
}

export function makeChecklist(overrides: Partial<ChecklistDetail> = {}): ChecklistDetail {
  return {
    id: 'cl-1',
    org_id: 'org-1',
    employee_id: 'e-1',
    employee_code: 'EMP-0001',
    employee_name: 'Ada Lovelace',
    kind: 'offboarding',
    title: 'Offboarding Ada',
    status: 'open',
    due_date: '2026-03-01',
    owner: { id: 'u-1', name: 'Ada' },
    task_id: 't-1',
    items_total: 2,
    items_done: 1,
    required_open: 1,
    completed_at: null,
    completed_by: null,
    url: '/people/checklists/cl-1',
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-01-02T10:00:00',
    items: [
      {
        id: 'i-1',
        position: 0,
        category: 'access',
        text: 'Revoke system access',
        required: true,
        done: false,
        done_by: null,
        done_at: null,
        note: null,
      },
      {
        id: 'i-2',
        position: 1,
        category: 'equipment',
        text: 'Return laptop',
        required: false,
        done: true,
        done_by: { id: 'u-1', name: 'Ada' },
        done_at: '2026-01-02T10:00:00',
        note: null,
      },
    ],
    ...overrides,
  };
}
