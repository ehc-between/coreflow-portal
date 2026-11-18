import { HomeResponse, Journey, JourneyStep } from './home.models';

/** Spec fixtures for the home and journey pages (no vitest globals here). */

export function makeStep(over: Partial<JourneyStep> = {}): JourneyStep {
  return {
    key: 'define-scope',
    phase: 'scope',
    title: 'Define the scope',
    body: 'Say what the management system covers.',
    requirement_refs: ['iso27001:4.3'],
    module: 'context',
    module_enabled: true,
    lesson: null,
    action: { kind: 'create', url: '/context/scopes/new' },
    done_when: 'record_exists',
    status: 'todo',
    done_source: null,
    progress: { current: 0, target: 1, linked: 0 },
    needs_link: false,
    requirement_url: '/standards/iso27001-2022/clauses/4.3',
    done_at: null,
    done_by: null,
    task: null,
    url: '/context/scopes/new',
    ...over,
  };
}

export function makeJourney(over: Partial<Journey> = {}): Journey {
  return {
    id: 'j-1',
    framework: 'iso27001',
    title: 'Get ready for ISO 27001',
    summary: 'A step-by-step path.',
    status: 'active',
    started_at: '2026-10-26T09:00:00',
    started_by: 'u-1',
    completed_at: null,
    url: '/standards/journey/iso27001',
    done: 1,
    total: 3,
    skipped: 0,
    percent: 33,
    next_step: null,
    phases: [
      {
        key: 'scope',
        title: 'Understand and scope',
        summary: null,
        done: 1,
        total: 1,
        skipped: 0,
        percent: 100,
        steps: [makeStep({ status: 'done', done_source: 'auto' })],
      },
      {
        key: 'risk',
        title: 'Risk',
        summary: 'Find what can go wrong.',
        done: 0,
        total: 2,
        skipped: 0,
        percent: 0,
        steps: [
          makeStep({ key: 'assess-risks', phase: 'risk', needs_link: true }),
          makeStep({ key: 'treat-risks', phase: 'risk' }),
        ],
      },
    ],
    ...over,
  };
}

export function makeHome(over: Partial<HomeResponse> = {}): HomeResponse {
  return {
    workspace: { key: 'quality_lead', source: 'role', roles: ['admin'] },
    quick_actions: [
      { key: 'report_issue', url: '/deviations/new', module: 'deviations' },
      { key: 'find_document', url: '/documents', module: 'documents' },
    ],
    frameworks: [
      {
        framework: 'iso27001',
        standard_key: 'iso27001-2022',
        name: 'ISO/IEC 27001 Information security management systems',
        kind: 'standard',
        score: 42,
        percent: 42,
        covered: 153,
        partial: 4,
        applicable: 364,
        remaining: 211,
        remaining_url: '/standards/gaps/iso27001-2022',
        is_target: true,
        target_date: '2027-01-11',
        target_status: 'in_progress',
        trend_30d: 3,
        open_gaps: 40,
        top_gaps: [
          {
            ref: 'iso27001:6.2',
            number: '6.2',
            title: 'Information security objectives',
            missing: 2,
            total: 3,
            url: '/standards/iso27001-2022/clauses/6.2',
          },
        ],
        url: '/standards/iso27001-2022/clauses',
      },
    ],
    next_actions: [
      {
        key: 'work.review',
        kind: 'review',
        title_key: 'home:next.review.title',
        why_key: 'home:next.review.why',
        params: { count: 1, title: 'Supplier procedure', code: 'PRO-004' },
        url: '/documents/d-1',
        priority: 1,
        module: null,
      },
      {
        key: 'gap:iso27001:6.2',
        kind: 'gap',
        title_key: 'home:next.gap.title',
        why_key: 'home:next.gap.why',
        params: { framework: 'iso27001', number: '6.2', title: 'Objectives', missing: 2 },
        url: '/standards/iso27001-2022/clauses/6.2',
        priority: 6,
        module: 'standards',
      },
    ],
    my_work: {
      overdue: 1,
      due_this_week: 2,
      later: 3,
      awaiting_review: 1,
      total: 7,
      acknowledge: 2,
      training: 1,
      tasks: 4,
    },
    journeys: [
      {
        id: 'j-1',
        framework: 'iso27001',
        title: 'Get ready for ISO 27001',
        summary: 'A step-by-step path.',
        status: 'active',
        started_at: '2026-10-26T09:00:00',
        started_by: 'u-1',
        completed_at: null,
        url: '/standards/journey/iso27001',
        done: 9,
        total: 20,
        skipped: 0,
        percent: 45,
        next_step: {
          key: 'security-objectives',
          title: 'Set security objectives',
          url: '/standards/iso27001-2022/clauses/6.2',
          needs_link: true,
          module: 'objectives',
          module_enabled: true,
        },
      },
    ],
    setup: { complete: true, missing: [] },
    ...over,
  };
}
