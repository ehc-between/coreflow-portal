import { viewSections } from './components/input-data';
import { agendaPayload, decisionPayload } from './components/meeting-workspace';
import { MeetingDetail, ReviewDetail } from './data/management-review.models';
import {
  attendeeName,
  breakdown,
  dayOf,
  dueFromDay,
  fromLocalInput,
  humanize,
  inputTitleKey,
  meetingTransitionKey,
  meetingTransitions,
  metricKey,
  minutesOrNull,
  sourceKey,
  toLocalInput,
  valueKey,
} from './management-review-display';
import { createMeetingPayload, emptyMeetingForm, updateMeetingPayload } from './meeting-editor';
import { appendLine, outputFieldFor, outputsDraft, outputsPatch } from './review-detail';
import { createReviewPayload, emptyReviewForm, updateReviewPayload } from './review-editor';

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
    expect(sourceKey('suppliers')).toBeNull();
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

  it('creates a follow-up task only for decisions without one', () => {
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
    };
    expect(decisionPayload(base)).toEqual({
      text: 'Buy a new scanner',
      category: 'resource',
      owner_user_id: 'u-1',
      due_at: '2026-12-01T00:00:00',
      create_action: true,
      action_title: null,
    });
    expect(decisionPayload({ ...base, has_task: true }).create_action).toBe(false);
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

  it('patches only changed outputs', () => {
    const r = { conclusions: 'ok', system_assessment: null } as unknown as ReviewDetail;
    const d = { ...outputsDraft(r), system_assessment: 'effective' as const, conclusions: 'ok ' };
    expect(outputsPatch(r, d)).toEqual({ system_assessment: 'effective' });
    expect(outputsPatch(r, { ...outputsDraft(r), conclusions: '' })).toEqual({ conclusions: null });
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
