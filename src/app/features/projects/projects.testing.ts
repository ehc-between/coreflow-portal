import { Milestone, PlanItem, Project, ProjectDetail } from './data/project.models';

/** Test-only fixtures for the project specs (not used by app code). */
export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p-1',
    org_id: 'org-1',
    code: 'PRJ-001',
    title: 'New order system',
    description: null,
    objective: 'All orders in the new system by March.',
    scope: 'Order handling and invoicing.',
    kind: 'design_development',
    status: 'active',
    priority: 'high',
    health: 'amber',
    owner: { id: 'u-1', name: 'Ada' },
    department_id: null,
    start_date: '2026-01-05',
    due_date: '2026-03-01',
    security_relevant: true,
    security_requirements: 'Data stored in the EU.',
    closed_at: null,
    closed_by: null,
    closeout_summary: null,
    is_overdue: false,
    member_count: 3,
    created_by: 'u-1',
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-01-02T10:00:00',
    url: '/projects/p-1',
    ...overrides,
  };
}

export function makeProjectDetail(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    ...makeProject(),
    members: [
      {
        user_id: 'u-1',
        name: 'Ada',
        role: 'manager',
        is_owner: true,
        added_at: '2026-01-01T10:00:00',
      },
      {
        user_id: 'u-2',
        name: 'Ben',
        role: 'member',
        is_owner: false,
        added_at: '2026-01-01T10:00:00',
      },
    ],
    progress: {
      milestones_total: 2,
      milestones_done: 1,
      milestones_overdue: 0,
      tasks_total: 4,
      tasks_open: 2,
      tasks_done: 2,
      tasks_overdue: 1,
      design_reviews_total: 1,
      design_reviews_pending: 1,
      percent: 50,
    },
    can_edit: true,
    can_contribute: true,
    can_manage: false,
    can_delete: false,
    ...overrides,
  };
}

export function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm-1',
    project_id: 'p-1',
    phase_id: null,
    kind: 'milestone',
    title: 'Pilot ready',
    description: null,
    status: 'planned',
    position: 0,
    start_date: null,
    due_date: '2026-02-01',
    owner: null,
    completed_at: null,
    is_overdue: false,
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-01-01T10:00:00',
    url: '/projects/p-1?milestone=m-1',
    ...overrides,
  };
}

export function makePlanItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    kind: 'task',
    id: 't-1',
    title: 'Write test plan',
    status: 'open',
    start: null,
    end: '2026-01-20',
    parent_id: null,
    owner: null,
    is_overdue: false,
    url: '/tasks/t-1',
    ...overrides,
  };
}
