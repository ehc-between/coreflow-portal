import { deriveAssessment } from './components/assessment-criteria';
import { viewSections } from './components/input-data';
import {
  agendaPayload,
  decisionPayload,
  defaultCreateAction,
} from './components/meeting-workspace';
import { checklist } from './components/signoff-checklist';
import { MeetingDetail, Planning, ReviewDetail } from './data/management-review.models';
import {
  attendeeName,
  breakdown,
  dayOf,
  defaultSection,
  dimensionKey,
  dueFromDay,
  formatClauseItem,
  fromLocalInput,
  humanize,
  inputClause,
  inputDone,
  inputTitleKey,
  isPercent,
  meetingTransitionKey,
  meetingTransitions,
  metricKey,
  minutesOrNull,
  nextDay,
  sectionDone,
  sourceKey,
  toLocalInput,
  toneValue,
  trend,
  valueKey,
} from './management-review-display';
import {
  createMeetingPayload,
  emptyMeetingForm,
  kindParam,
  relatedParam,
  updateMeetingPayload,
} from './meeting-editor';
import {
  appendLine,
  outputFieldFor,
  outputsDraft,
  outputsPatch,
  primaryAction,
} from './review-detail';
import {
  adoptedFrameworks,
  createReviewPayload,
  defaultPeriod,
  emptyReviewForm,
  updateReviewPayload,
} from './review-editor';
import { attendanceOf, requirementsLine } from './review-report';
import { settingsPatch } from './review-settings';
import { reviewRowDate } from './reviews-list';
import { StandardSummary } from '../../core/standards/standards.models';

describe('meeting transitions', () => {
  it('follows the contract', () => {
    expect(meetingTransitions({ status: 'planned', minutes_status: 'draft' })).toEqual([
      'in_progress',
      'completed',
      'cancelled',
    ]);
    expect(meetingTransitions({ status: 'in_progress', minutes_status: 'draft' })).toEqual([
      'completed',
      'cancelled',
    ]);
    expect(meetingTransitions({ status: 'completed', minutes_status: 'draft' })).toEqual([
      'in_progress',
    ]);
    expect(meetingTransitions({ status: 'completed', minutes_status: 'approved' })).toEqual([]);
    expect(meetingTransitions({ status: 'cancelled', minutes_status: 'draft' })).toEqual([
      'planned',
    ]);
  });

  it('labels each move', () => {
    expect(meetingTransitionKey('planned', 'in_progress')).toBe(
      'managementReview.meeting.transitions.start',
    );
    expect(meetingTransitionKey('completed', 'in_progress')).toBe(
      'managementReview.meeting.transitions.reopen',
    );
    expect(meetingTransitionKey('cancelled', 'planned')).toBe(
      'managementReview.meeting.transitions.replan',
    );
    expect(meetingTransitionKey('planned', 'completed')).toBe(
      'managementReview.meeting.transitions.completed',
    );
  });
});

describe('date helpers', () => {
  it('round-trips a datetime-local value through naive UTC', () => {
    const local = '2026-11-12T09:30';
    const utc = fromLocalInput(local)!;
    expect(utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(toLocalInput(utc)).toBe(local);
    expect(fromLocalInput('')).toBeNull();
    expect(toLocalInput(null)).toBe('');
  });

  it('handles date-only due dates without a timezone shift', () => {
    expect(dueFromDay('2026-12-01')).toBe('2026-12-01T00:00:00');
    expect(dueFromDay('')).toBeNull();
    expect(dayOf('2026-12-01T00:00:00')).toBe('2026-12-01');
    expect(dayOf(null)).toBe('');
  });

  it('parses minutes', () => {
    expect(minutesOrNull('90')).toBe(90);
    expect(minutesOrNull('')).toBeNull();
    expect(minutesOrNull('0')).toBeNull();
  });
});

describe('labels', () => {
  it('uses category names for required inputs and the title for custom ones', () => {
    expect(inputTitleKey({ category: 'audit_results', title: null })).toBe(
      'managementReview.inputCategories.audit_results.title',
    );
    expect(inputTitleKey({ category: 'custom', title: 'Board topic' })).toBeNull();
    expect(inputTitleKey({ category: 'from_new_module', title: 'X' })).toBeNull();
  });

  it('falls back to readable text for unknown sources, metrics and values', () => {
    expect(sourceKey('deviations.customer')).toBe(
      'managementReview.inputSources.deviations_customer',
    );
    expect(sourceKey('suppliers')).toBe('managementReview.inputSources.suppliers');
    expect(sourceKey('context.interested_parties')).toBe(
      'managementReview.inputSources.context_interested_parties',
    );
    expect(sourceKey('from_new_module')).toBeNull();
    expect(dimensionKey('by_level')).toBe('managementReview.inputData.by_level');
    expect(dimensionKey('by_colour')).toBeNull();
    expect(isPercent('on_time_rate')).toBe(true);
    expect(isPercent('average_score_pct')).toBe(true);
    expect(isPercent('open')).toBe(false);
    expect(metricKey('overdue')).toBe('managementReview.metrics.overdue');
    expect(metricKey('rating_avg')).toBeNull();
    expect(valueKey('critical')).toBe('managementReview.values.critical');
    expect(humanize('rating_avg')).toBe('Rating avg');
    expect(breakdown({ low: 1, high: 4, x: 'n/a' })).toEqual([
      ['high', 4],
      ['low', 1],
    ]);
  });

  it('names members and external attendees', () => {
    expect(attendeeName({ user: { id: 'u-1', name: 'Ada' }, name: null })).toBe('Ada');
    expect(attendeeName({ user: null, name: 'Guest' })).toBe('Guest');
  });
});

describe('input data', () => {
  it('normalises compiled sections', () => {
    const [deviations, readiness, previous] = viewSections({
      available: true,
      sections: [
        {
          source: 'deviations',
          metrics: { raised: 3, overdue: 1, custom_metric: 2, nothing: null },
          by_severity: { high: 2, low: 1 },
        },
        {
          source: 'readiness',
          metrics: { standards: 1 },
          items: [
            {
              framework: 'iso9001',
              standard_key: 'iso9001',
              score: 72.4,
              covered: 30,
              applicable: 41,
            },
          ],
        },
        {
          source: 'previous_review',
          metrics: { previous_reviews: 1 },
          previous: { id: 'r-0', code: 'MR-0001', status: 'signed', signed_at: null, url: '/x' },
        },
      ],
    });
    expect(deviations.sourceKey).toBe('managementReview.inputSources.deviations');
    expect(deviations.metrics.map((m) => m.key)).toEqual(['raised', 'overdue', 'custom_metric']);
    expect(deviations.metrics[2].labelKey).toBeNull();
    expect(deviations.groups[0].rows[0]).toEqual(
      expect.objectContaining({ key: 'high', value: 2, labelKey: 'managementReview.values.high' }),
    );
    expect(readiness.readiness[0]).toEqual(
      expect.objectContaining({ score: 72.4, covered: 30, applicable: 41 }),
    );
    expect(previous.previous?.code).toBe('MR-0001');
    expect(viewSections(null)).toEqual([]);
  });

  it('adds the trend, the source list and any other breakdown', () => {
    const [risk, prev] = viewSections({
      sections: [
        {
          source: 'risk',
          url: '/risk/risks',
          metrics: { open: 5, on_time_rate: 66.7 },
          previous_metrics: { open: 3 },
          by_level: { high: 1, low: 2 },
        },
        {
          source: 'previous_review',
          metrics: { actions: 1 },
          items: [
            {
              decision_id: 'd-1',
              category: 'action',
              text: 'Review the suppliers',
              due_at: null,
              status: 'in_progress',
              overdue: true,
              task_url: '/tasks/t-1',
            },
          ],
        },
      ],
    });
    expect(risk.url).toBe('/risk/risks');
    expect(risk.metrics[0].trend).toEqual({ direction: 'up', delta: 2 });
    expect(risk.metrics[1]).toEqual(expect.objectContaining({ percent: true, trend: null }));
    expect(risk.hasPrevious).toBe(true);
    expect(risk.groups.map((g) => g.key)).toEqual(['by_level']);
    expect(risk.groups[0].labelKey).toBe('managementReview.inputData.by_level');
    expect(prev.actions[0].text).toBe('Review the suppliers');
    expect(prev.hasPrevious).toBe(false);
  });
});

describe('trend', () => {
  it('compares with the previous review', () => {
    expect(trend(5, 3)).toEqual({ direction: 'up', delta: 2 });
    expect(trend(1, 4)).toEqual({ direction: 'down', delta: 3 });
    expect(trend(2, 2)).toEqual({ direction: 'same', delta: 0 });
    expect(trend(2, null)).toBeNull();
  });
});

describe('clauses and inputs', () => {
  it('splits and formats the clause of an input', () => {
    expect(inputClause({ clause: 'iso9001:9.3.2 c 1', clause_ref: null })).toEqual({
      ref: 'iso9001:9.3.2',
      item: 'c 1',
    });
    expect(inputClause({ clause: 'x', clause_ref: 'hs:9.3.2', clause_item: 'a' })).toEqual({
      ref: 'hs:9.3.2',
      item: 'a',
    });
    expect(inputClause({ clause: 'hs:7.5', clause_ref: null })).toEqual({
      ref: 'hs:7.5',
      item: null,
    });
    expect(inputClause({ clause: null })).toBeNull();
    expect(formatClauseItem('c 1')).toBe('c) 1)');
    expect(formatClauseItem(null)).toBe('');
  });

  it('counts an input as done when reviewed or not relevant', () => {
    expect(inputDone({ reviewed: true })).toBe(true);
    expect(inputDone({ reviewed: false, not_relevant: true })).toBe(true);
    expect(inputDone({ reviewed: true, done: false })).toBe(false);
  });

  it('maps statuses to the shared tone words', () => {
    expect(toneValue('awaiting_signoff')).toBe('pending_approval');
    expect(toneValue('signed')).toBe('approved');
    expect(toneValue('planned')).toBe('planned');
    expect(toneValue(null)).toBe('');
  });
});

describe('review sections and sign-off', () => {
  const review = (patch: Partial<ReviewDetail>) =>
    ({
      status: 'in_progress',
      missing_for_submit: [],
      allowed_actions: [],
      submit_check: null,
      ...patch,
    }) as unknown as ReviewDetail;

  it('opens on the first step with work left', () => {
    const check = (missing: string[]) =>
      review({
        missing_for_submit: missing as ReviewDetail['missing_for_submit'],
        submit_check: { missing } as unknown as ReviewDetail['submit_check'],
      });
    expect(defaultSection(check(['inputs_reviewed', 'conclusions']))).toBe('inputs');
    expect(defaultSection(check(['minutes_approved']))).toBe('meeting');
    expect(defaultSection(check(['assessment_criteria']))).toBe('outputs');
    expect(defaultSection(check([]))).toBe('signoff');
    expect(defaultSection(review({ status: 'signed' }))).toBe('signoff');
  });

  it('ticks a step when nothing in it is missing', () => {
    const r = review({
      missing_for_submit: ['top_management_present'],
      submit_check: {
        missing: ['top_management_present'],
      } as unknown as ReviewDetail['submit_check'],
    });
    expect(sectionDone(r, 'inputs')).toBe(true);
    expect(sectionDone(r, 'meeting')).toBe(false);
    expect(sectionDone(r, 'signoff')).toBe(false);
    expect(sectionDone(review({ status: 'signed' }), 'meeting')).toBe(true);
  });

  it('lists every sign-off point with its progress', () => {
    const items = checklist(
      review({
        missing_for_submit: ['inputs_reviewed', 'top_management_present'],
        submit_check: {
          missing: ['inputs_reviewed', 'top_management_present'],
          inputs_total: 19,
          inputs_done: 4,
          attendance: { top_management_total: 1, top_management_present: 0 },
        } as unknown as ReviewDetail['submit_check'],
      }),
    );
    expect(items.map((i) => i.key)).toEqual([
      'inputs_reviewed',
      'meeting_completed',
      'minutes_approved',
      'top_management_present',
      'assessment_criteria',
      'conclusions',
    ]);
    expect(items[0]).toEqual(
      expect.objectContaining({
        done: false,
        labelKey: 'managementReview.missing.inputs_reviewed.todo',
        params: { done: 4, total: 19 },
      }),
    );
    expect(items[1].labelKey).toBe('managementReview.missing.meeting_completed.done');
  });

  it('offers one primary workflow action', () => {
    expect(primaryAction(review({ allowed_actions: ['compile', 'submit', 'cancel'] }))).toBe(
      'submit',
    );
    expect(primaryAction(review({ allowed_actions: ['start', 'compile'] }))).toBe('start');
    expect(primaryAction(review({ allowed_actions: ['sign', 'return'] }))).toBe('sign');
    expect(primaryAction(review({ allowed_actions: ['delete'] }))).toBeNull();
  });

  it('derives the overall assessment as the weakest rating', () => {
    const required = ['suitability', 'adequacy', 'effectiveness'] as const;
    expect(
      deriveAssessment(required, {
        suitability: { rating: 'effective', note: null },
        adequacy: { rating: 'partially_effective', note: null },
        effectiveness: { rating: 'effective', note: null },
      }),
    ).toBe('partially_effective');
    expect(deriveAssessment(required, { suitability: { rating: 'effective', note: null } })).toBe(
      null,
    );
  });
});

describe('meeting workspace payloads', () => {
  it('drops untitled agenda rows and parses durations', () => {
    expect(
      agendaPayload([
        {
          title: ' Opening ',
          notes: '',
          presenter_user_id: 'u-1',
          presenter_name: null,
          duration: '10',
        },
        { title: '  ', notes: 'x', presenter_user_id: null, presenter_name: null, duration: '' },
      ]),
    ).toEqual([{ title: 'Opening', notes: null, presenter_user_id: 'u-1', duration_minutes: 10 }]);
  });

  it('creates a follow-up task only for decisions without one, and sends the related records', () => {
    const base = {
      id: null,
      text: ' Buy a new scanner ',
      category: 'resource' as const,
      owner_user_id: 'u-1',
      owner_name: null,
      due: '2026-12-01',
      create_action: true,
      action_title: '',
      has_task: false,
      related: [{ entity_type: 'risk', entity_id: 'r-1', title: 'Scanner breaks', code: 'RSK-1' }],
    };
    expect(decisionPayload(base)).toEqual({
      text: 'Buy a new scanner',
      category: 'resource',
      owner_user_id: 'u-1',
      due_at: '2026-12-01T00:00:00',
      create_action: true,
      action_title: null,
      related: [{ entity_type: 'risk', entity_id: 'r-1' }],
    });
    expect(decisionPayload({ ...base, has_task: true }).create_action).toBe(false);
    // Always explicit: the server would otherwise add a task to every action.
    expect(
      decisionPayload({ ...base, category: 'action', create_action: false }).create_action,
    ).toBe(false);
  });

  it('gives actions a follow-up task by default', () => {
    expect(defaultCreateAction('action')).toBe(true);
    expect(defaultCreateAction('decision')).toBe(false);
  });
});

describe('review form payloads', () => {
  it('omits frameworks when none are picked so the org profile decides', () => {
    const f = { ...emptyReviewForm('MR 2026', 'u-1'), attendee_ids: ['u-2'] };
    const body = createReviewPayload(f, ['Previous actions']);
    expect('frameworks' in body).toBe(false);
    expect(body).toEqual(
      expect.objectContaining({
        title: 'MR 2026',
        owner_user_id: 'u-1',
        chair_user_id: 'u-1',
        duration_minutes: 120,
        attendees: [{ user_id: 'u-2', role: 'participant' }],
        agenda: [{ title: 'Previous actions' }],
        compile_inputs: true,
      }),
    );
    expect(createReviewPayload({ ...f, standard_agenda: false }, ['x']).agenda).toEqual([]);
  });

  it('sends only changed fields on update, with the reason', () => {
    const before = {
      title: 'MR 2026',
      frameworks: ['iso9001'],
      period_start: null,
      period_end: null,
      owner: { id: 'u-1', name: 'Ada' },
    } as unknown as ReviewDetail;
    const f = {
      ...emptyReviewForm('MR 2026', 'u-1'),
      frameworks: ['iso9001' as const],
      period_end: '2026-12-31',
      change_reason: 'Year end',
    };
    expect(updateReviewPayload(before, f)).toEqual({
      period_end: '2026-12-31',
      change_reason: 'Year end',
    });
    expect(updateReviewPayload(before, { ...f, period_end: '' })).toEqual({});
  });

  it('patches only changed outputs and criteria', () => {
    const r = {
      conclusions: 'ok',
      assessment_criteria: {
        required: ['suitability'],
        items: { suitability: { rating: 'effective', note: null } },
        complete: true,
        derived: 'effective',
      },
    } as unknown as ReviewDetail;
    expect(outputsPatch(r, { ...outputsDraft(r), conclusions: 'ok ' })).toEqual({});
    expect(outputsPatch(r, { ...outputsDraft(r), conclusions: '' })).toEqual({ conclusions: null });
    const rated = {
      ...outputsDraft(r),
      criteria: {
        suitability: { rating: 'effective' as const, note: null },
        adequacy: { rating: 'not_effective' as const, note: ' Too few people ' },
      },
    };
    expect(outputsPatch(r, rated)).toEqual({
      assessment_criteria: { adequacy: { rating: 'not_effective', note: 'Too few people' } },
    });
    expect(outputsPatch(r, { ...outputsDraft(r), criteria: {} })).toEqual({
      assessment_criteria: { suitability: null },
    });
  });

  it('defaults the standards and the period of a new review', () => {
    const standards = [
      { enabled: true, framework: 'iso9001' },
      { enabled: false, framework: 'iso14001' },
      { enabled: true, framework: 'gdpr' },
      { enabled: true, framework: 'iso27001' },
    ] as unknown as StandardSummary[];
    expect(adoptedFrameworks(standards)).toEqual(['iso9001', 'iso27001']);
    const planning = {
      interval_months: 12,
      last_signed: { held_at: '2025-12-17T10:00:00', signed_at: '2025-12-24T10:00:00' },
    } as unknown as Planning;
    expect(defaultPeriod(planning, '2026-11-17')).toEqual({
      start: '2025-12-18',
      end: '2026-11-17',
    });
    expect(defaultPeriod(null, '2026-11-17')).toEqual({ start: '2025-11-17', end: '2026-11-17' });
    expect(nextDay('2025-12-31')).toBe('2026-01-01');
  });

  it('routes suggested outputs to the matching field', () => {
    expect(outputFieldFor('improvement')).toBe('improvement_opportunities');
    expect(outputFieldFor('change')).toBe('change_needs');
    expect(outputFieldFor('resource')).toBe('resource_needs');
    expect(outputFieldFor('decision')).toBe('conclusions');
    expect(appendLine('', 'A')).toBe('- A');
    expect(appendLine('Intro\n', 'B')).toBe('Intro\n- B');
  });
});

describe('meeting form payloads', () => {
  it('splits the agenda into lines', () => {
    const body = createMeetingPayload({
      ...emptyMeetingForm('u-1'),
      title: ' Safety committee ',
      kind: 'safety',
      agenda_text: 'Opening\n\n Incidents \n',
      attendee_ids: ['u-2'],
    });
    expect(body).toEqual(
      expect.objectContaining({
        title: 'Safety committee',
        kind: 'safety',
        chair_user_id: 'u-1',
        duration_minutes: 60,
        attendees: [{ user_id: 'u-2' }],
        agenda: [{ title: 'Opening' }, { title: 'Incidents' }],
      }),
    );
  });

  it('links what the meeting concerns, and reads it from the address', () => {
    const body = createMeetingPayload({
      ...emptyMeetingForm('u-1'),
      title: 'Audit closing',
      related: [{ entity_type: 'audit_plan', entity_id: 'a-1', title: 'Audit' }],
    });
    expect(body.related).toEqual([{ entity_type: 'audit_plan', entity_id: 'a-1' }]);
    expect('related' in createMeetingPayload({ ...emptyMeetingForm(null), title: 'X' })).toBe(
      false,
    );
    expect(relatedParam('deviation:6e2fd6ba-6856-476c-93d6-f11c9eac4b11')).toEqual({
      type: 'deviation',
      id: '6e2fd6ba-6856-476c-93d6-f11c9eac4b11',
    });
    expect(relatedParam('nonsense')).toBeNull();
    expect(kindParam('safety')).toBe('safety');
    expect(kindParam('management_review')).toBeNull();
  });

  it('never changes the kind of a review meeting', () => {
    const before = {
      title: 'MR',
      kind: 'management_review',
      purpose: null,
      location: null,
      scheduled_at: null,
      duration_minutes: 60,
      chair: null,
      secretary: null,
    } as unknown as MeetingDetail;
    const f = {
      ...emptyMeetingForm(null),
      title: 'MR',
      kind: 'general' as const,
      location: 'Room 1',
    };
    expect(updateMeetingPayload(before, f)).toEqual({ location: 'Room 1', change_reason: null });
  });
});

describe('lists, report and settings', () => {
  it('shows when a review was signed, else when its meeting is', () => {
    expect(reviewRowDate({ signed_at: '2025-12-24T10:00:00', scheduled_at: 'x' } as never)).toEqual(
      { date: '2025-12-24T10:00:00', kind: 'date' },
    );
    expect(
      reviewRowDate({ signed_at: null, scheduled_at: '2026-12-11T10:00:00' } as never),
    ).toEqual({ date: '2026-12-11T10:00:00', kind: 'next' });
  });

  it('names the requirements a signed review documents', () => {
    expect(
      requirementsLine(
        [
          {
            standard_key: 'iso9001-2026',
            framework: 'iso9001',
            numbers: ['9.3.1', '9.3.2'],
            count: 2,
          },
          { standard_key: 'iso14001-2015', framework: 'iso14001', numbers: ['9.3'], count: 1 },
        ],
        (k) => k,
      ),
    ).toBe('ISO 9001 · 9.3.1, 9.3.2; ISO 14001 · 9.3');
  });

  it('counts attendance when the report has no summary', () => {
    const a = attendanceOf(null, [
      { attendance: 'present', top_management: true },
      { attendance: 'absent', top_management: false },
    ] as never);
    expect(a).toEqual(expect.objectContaining({ total: 2, present: 1, top_management_present: 1 }));
  });

  it('validates the review interval and reminder', () => {
    const s = { review_interval_months: 12, reminder_days: 60, can_manage: true };
    expect(settingsPatch(s, '12', '60')).toEqual({});
    expect(settingsPatch(s, '6', '30')).toEqual({ review_interval_months: 6, reminder_days: 30 });
    expect(settingsPatch(s, '0', '30')).toBe('managementReview.settings.invalidInterval');
    expect(settingsPatch(s, '12', '200')).toBe('managementReview.settings.invalidReminder');
  });
});
