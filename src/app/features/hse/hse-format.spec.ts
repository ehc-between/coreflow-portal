import { HttpErrorResponse } from '@angular/common/http';
import { hseErrorKey } from './data/hse-errors';
import { HseOverview } from './data/hse.models';
import {
  dayToWire,
  incompleteSteps,
  linesToList,
  listToLines,
  intervalText,
  localInputToWire,
  periodKind,
  ppeOnly,
  ppeStatusValue,
  residualNotLower,
  stepTotals,
  textOrNull,
  wireToLocalInput,
} from './hse-format';
import { overviewSections, splitUrl } from './hse-overview';
import { placePpeActions } from './ppe/ppe-detail';
import { positiveInt } from './ppe/ppe-editor';
import { parsePpeFilters } from './ppe/ppe-list';
import { actionsFromDrafts, actionDraft } from './consultations/consultation-detail';
import { findingsKey, safetyRoundBody } from './safety-rounds/safety-rounds';
import { participantRows, placeSjaActions, warningText } from './sja/sja-detail';
import { controlDraft, mergeSuggestions, stepDraft, stepsFromDrafts } from './sja/sja-editor';
import { addName } from './shared/people-picker';
import { Ppe, Sja } from './data/hse.models';

describe('hse format helpers', () => {
  it('splits and joins one-item-per-line lists', () => {
    expect(linesToList(' Ola \n\n Kari\r\n')).toEqual(['Ola', 'Kari']);
    expect(linesToList(null)).toEqual([]);
    expect(listToLines(['a', 'b'])).toBe('a\nb');
  });

  it('turns blank text into null', () => {
    expect(textOrNull('  ')).toBeNull();
    expect(textOrNull(' x ')).toBe('x');
  });

  it('round-trips datetime-local values through naive UTC', () => {
    const wire = localInputToWire('2026-11-12T08:30');
    expect(wire).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(wireToLocalInput(wire)).toBe('2026-11-12T08:30');
    expect(localInputToWire('')).toBeNull();
    expect(localInputToWire('nonsense')).toBeNull();
    expect(wireToLocalInput(null)).toBe('');
  });

  it('turns a date input into the start of that day', () => {
    expect(dayToWire('2026-12-01')).toBe('2026-12-01T00:00:00');
    expect(dayToWire('')).toBeNull();
  });

  it('maps PPE statuses to shared tone values', () => {
    expect(ppeStatusValue('in_stock')).toBe('effective');
    expect(ppeStatusValue('out_of_service')).toBe('blocked');
    expect(ppeStatusValue('retired')).toBe('retired');
  });

  it('flags a residual risk that is not lower than before', () => {
    expect(residualNotLower('high', 'high')).toBe(true);
    expect(residualNotLower('medium', 'high')).toBe(true);
    expect(residualNotLower('high', 'low')).toBe(false);
    expect(residualNotLower('', 'high')).toBe(false);
  });

  it('flags steps that rely only on PPE', () => {
    expect(ppeOnly(['ppe', 'ppe'])).toBe(true);
    expect(ppeOnly(['ppe', 'engineering'])).toBe(false);
    expect(ppeOnly(['ppe', ''])).toBe(false);
    expect(ppeOnly([])).toBe(false);
  });

  it('says inspection intervals in plain words', () => {
    expect(intervalText(365)?.key).toBe('hse.interval.yearly');
    expect(intervalText(30)?.key).toBe('hse.interval.monthly');
    expect(intervalText(45)).toEqual({ key: 'hse.interval.days', params: { days: 45 } });
    expect(intervalText(null)).toBeNull();
  });

  it('picks the period phrasing without a dangling dash', () => {
    expect(periodKind('2026-11-01T08:00:00', '2026-11-01T15:00:00')).toBe('range');
    expect(periodKind('2026-11-01T08:00:00', null)).toBe('from');
    expect(periodKind(null, '2026-11-01T15:00:00')).toBe('until');
    expect(periodKind(null, null)).toBe('none');
  });

  it('adds external names once, ignoring case and blanks', () => {
    expect(addName(['Per'], ' per ')).toEqual(['Per']);
    expect(addName(['Per'], '  ')).toEqual(['Per']);
    expect(addName(['Per'], 'Ali (innleid)')).toEqual(['Per', 'Ali (innleid)']);
  });

  it('splits portal urls into a path and query params', () => {
    expect(splitUrl('/hse/ppe?overdue=true')).toEqual({
      path: '/hse/ppe',
      query: { overdue: 'true' },
    });
    expect(splitUrl('/hse/sja/new')).toEqual({ path: '/hse/sja/new', query: null });
  });

  it('reads the overview and next-action links in the PPE filters', () => {
    expect(parsePpeFilters({ overdue: 'true' }).due).toBe('overdue');
    expect(parsePpeFilters({ due: '0' }).due).toBe('overdue');
    expect(parsePpeFilters({ category: 'head', status: 'in_stock' })).toMatchObject({
      category: 'head',
      status: 'in_stock',
    });
    expect(parsePpeFilters({ category: 'nope', sort: 'x' })).toMatchObject({
      category: '',
      sort: '-created_at',
    });
  });

  it('summarises safety-walk findings', () => {
    const walk = { finding_count: 3, open_finding_count: 1 } as never;
    expect(findingsKey(walk)).toEqual({
      key: 'hse.rounds.walks.findings',
      params: { count: 3, open: 1 },
    });
    expect(findingsKey({ finding_count: 0, open_finding_count: 0 } as never).key).toBe(
      'hse.rounds.walks.noFindings',
    );
  });

  it('counts hazards and controls and finds incomplete steps', () => {
    const steps = [
      { description: 'Lift', hazards: ['Falling load'], controls: ['Exclusion zone'] },
      { description: 'Fit', hazards: ['Cuts', 'Noise'], controls: [] },
    ];
    expect(stepTotals(steps)).toEqual({ hazards: 3, controls: 1 });
    expect(incompleteSteps(steps)).toEqual([1]);
  });

  it('parses positive whole numbers', () => {
    expect(positiveInt('365')).toBe(365);
    expect(positiveInt('0')).toBeNull();
    expect(positiveInt('2.5')).toBeNull();
    expect(positiveInt(' ')).toBeNull();
  });
});

describe('SJA editor helpers', () => {
  it('drops blank rows and controls, keeps control types and the member responsible', () => {
    const rows = [
      {
        ...stepDraft(),
        description: ' Rig the crane ',
        hazards: 'Tip-over\n',
        controls: [
          controlDraft('Outriggers', 'engineering'),
          controlDraft(' '),
          controlDraft('Level ground'),
        ],
        responsibleUserId: 'u1',
        responsible: 'ignored',
        risk_level: 'high' as const,
      },
      stepDraft(),
    ];
    expect(stepsFromDrafts(rows)).toEqual([
      {
        description: 'Rig the crane',
        hazards: ['Tip-over'],
        controls: ['Outriggers', 'Level ground'],
        control_types: ['engineering', null],
        responsible_user_id: 'u1',
        responsible: null,
        risk_level: 'high',
      },
    ]);
  });

  it('keeps an external responsible name when no member is picked', () => {
    const row = { ...stepDraft(), description: 'Weld', responsible: ' Per (contractor) ' };
    expect(stepsFromDrafts([row])[0]).toMatchObject({
      responsible_user_id: null,
      responsible: 'Per (contractor)',
    });
  });

  it('reads control types and the responsible member from a saved step', () => {
    const draft = stepDraft({
      description: 'Lift',
      hazards: ['Falling load'],
      controls: ['Exclusion zone', 'Helmet'],
      control_types: ['administrative', 'ppe'],
      responsible_user: { id: 'u2', name: 'Ola' },
      responsible: 'Ola',
    });
    expect(draft.controls.map((c) => [c.text, c.type])).toEqual([
      ['Exclusion zone', 'administrative'],
      ['Helmet', 'ppe'],
    ]);
    expect(draft.responsibleUserId).toBe('u2');
    expect(draft.responsible).toBe('');
  });

  it('merges assistant suggestions: replaces a blank row, adds new PPE only once', () => {
    const merged = mergeSuggestions([stepDraft()], ['head'], {
      steps: [
        {
          description: 'Work at height',
          hazards: ['Fall'],
          controls: ['Guard rail'],
          risk_level: null,
        },
      ],
      required_ppe: ['head', 'fall_protection', 'unknown' as never],
      notes: null,
    });
    expect(merged.steps).toHaveLength(1);
    expect(merged.steps[0].description).toBe('Work at height');
    expect(merged.steps[0].hazards).toBe('Fall');
    expect(merged.ppe).toEqual(['head', 'fall_protection']);
  });

  it('keeps existing steps when suggestions are added', () => {
    const existing = { ...stepDraft(), description: 'Prepare' };
    const merged = mergeSuggestions([existing], [], {
      steps: [{ description: 'Lift', hazards: [], controls: [], risk_level: 'low' }],
      required_ppe: [],
      notes: 'Check the weather',
    });
    expect(merged.steps.map((s) => s.description)).toEqual(['Prepare', 'Lift']);
    expect(merged.steps[1].risk_level).toBe('low');
  });
});

describe('safetyRoundBody', () => {
  const form = {
    title: ' Monthly round ',
    description: '',
    location: 'Workshop',
    assignee: 'role:hse_manager',
    schedule: 'once' as const,
    dueDay: '2026-12-01',
    rrule: 'FREQ=MONTHLY',
    startDay: '2026-12-01',
    leadDays: 7,
    checklist: 'Exits clear\n\nExtinguishers checked',
    priority: 'normal' as const,
    lang: 'nb' as const,
  };

  it('builds a one-off round with a due date', () => {
    const body = safetyRoundBody(form);
    expect(body.title).toBe('Monthly round');
    expect(body.due_at).toBe('2026-12-01T23:59:59');
    expect(body.rrule).toBeUndefined();
    expect(body.assignee).toEqual({ type: 'role', value: 'hse_manager' });
    expect(body.checklist).toEqual(['Exits clear', 'Extinguishers checked']);
    expect(body.description).toBeNull();
    expect(body.lang).toBe('nb');
  });

  it('builds a recurring round with a start and lead days', () => {
    const body = safetyRoundBody({ ...form, schedule: 'recurring', checklist: '' });
    expect(body.rrule).toBe('FREQ=MONTHLY');
    expect(body.dtstart).toBe('2026-12-01T00:00:00');
    expect(body.lead_days).toBe(7);
    expect(body.due_at).toBeUndefined();
    // An empty checklist falls back to the server's template.
    expect(body.checklist).toBeUndefined();
  });
});

describe('overviewSections', () => {
  const overview: HseOverview = {
    sja: { draft: 1, in_review: 2, approved: 3, completed: 4, cancelled: 0 },
    ppe: {
      in_stock: 5,
      issued: 6,
      out_of_service: 0,
      retired: 0,
      overdue: 1,
      due_within_30_days: 2,
    },
    consultations: { planned: 1, held: 3, cancelled: 0, held_last_365_days: 0 },
    safety_rounds: { open: 2, overdue: 1, inspections_open: 1 },
    incidents: { available: false, url: '/deviations' },
    risks: { available: false, url: '/risk/risks' },
    tasks: { open: 3, overdue: 1, url: '/tasks?module=hse' },
    attention: {
      ppe: [1, 2, 3, 4].map((n) => ({
        id: `p${n}`,
        code: `PPE-000${n}`,
        title: 'Harness',
        status: 'in_stock',
        due_at: null,
        reason: 'inspection_overdue' as const,
        url: `/hse/ppe/p${n}`,
      })),
    },
    getting_started: { show: false, steps: [] },
  };

  it('builds the four cards with drill-down links and at most three attention items', () => {
    const sections = overviewSections(overview);
    expect(sections.map((s) => s.key)).toEqual(['sja', 'ppe', 'consultations', 'safetyRounds']);
    const review = sections[0].stats.find((s) => s.query?.['status'] === 'in_review');
    expect(review?.value).toBe(2);
    expect(review?.attention).toBe(true);
    const overdue = sections[1].stats.find((s) => s.query?.['overdue'] === 'true');
    expect(overdue?.value).toBe(1);
    expect(sections[1].attention).toHaveLength(3);
    expect(sections[0].attention).toEqual([]);
    expect(sections[3].stats.map((s) => s.value)).toEqual([2, 1, 1]);
  });
});

describe('detail page helpers', () => {
  const sja = (over: Partial<Sja>): Sja =>
    ({
      participant_users: [{ id: 'u1', name: 'Kari' }],
      participants: ['Per (innleid)'],
      sign_offs: [
        { name: 'Kari', user_id: 'u1', signed_at: '2026-11-01T07:00:00', recorded_by: null },
      ],
      ...over,
    }) as Sja;

  it('places the next SJA step as primary and the rest under "Mer"', () => {
    expect(placeSjaActions(['submit', 'cancel'], true)).toEqual({
      primary: 'submit',
      secondary: ['edit'],
      overflow: ['cancel'],
    });
    expect(placeSjaActions(['complete', 'revise', 'cancel'], false)).toEqual({
      primary: 'complete',
      secondary: [],
      overflow: ['revise', 'cancel'],
    });
    expect(placeSjaActions([], true).primary).toBe('edit');
  });

  it('matches participants with their sign-offs, members by id and others by name', () => {
    const rows = participantRows(sja({}));
    expect(rows.map((r) => [r.name, r.member, !!r.signOff, r.signOffIndex])).toEqual([
      ['Kari', true, true, 0],
      ['Per (innleid)', false, false, -1],
    ]);
  });

  it('translates the backend warnings with their params', () => {
    const t = (key: string, params?: Record<string, unknown>) =>
      `${key}${params ? JSON.stringify(params) : ''}`;
    expect(warningText({ key: 'ppe_only_controls', steps: [0, 2] }, t)).toBe(
      'hse.sja.warnings.ppe_only_controls{"steps":"1, 3"}',
    );
    expect(warningText({ key: 'sign_offs_missing', count: 2 }, t)).toBe(
      'hse.sja.warnings.sign_offs_missing{"count":2}',
    );
    expect(warningText({ key: 'something_new' }, t)).toBe('');
  });

  it('offers an inspection instead of issuing PPE that is overdue', () => {
    const ppe = (over: Partial<Ppe>) =>
      ({ status: 'in_stock', issuable: true, overdue: false, ...over }) as Ppe;
    expect(placePpeActions(ppe({}), true).primary).toBe('issue');
    const overdue = placePpeActions(ppe({ issuable: false, overdue: true }), true);
    expect(overdue.primary).toBe('inspect');
    expect(overdue.overflow).toContain('issue');
    expect(placePpeActions(ppe({ status: 'issued' }), true).primary).toBe('return');
    expect(placePpeActions(ppe({}), false).primary).toBeNull();
  });

  it('turns consultation decisions with a title into follow-up actions', () => {
    const rows = [
      { ...actionDraft(), title: ' Buy new ladders ', assignee: 'u1', due: '2026-12-01' },
      actionDraft(),
    ];
    expect(actionsFromDrafts(rows)).toEqual([
      { title: 'Buy new ladders', assignee_user_id: 'u1', due_at: '2026-12-01T23:59:59' },
    ]);
  });
});

describe('hseErrorKey', () => {
  const error = (status: number, detail: unknown) =>
    new HttpErrorResponse({ status, error: { detail } });

  it('maps coded errors to scoped keys', () => {
    expect(hseErrorKey(error(409, { code: 'sja_locked' }))).toBe('hse.errors.sja_locked');
    expect(hseErrorKey(error(422, { code: 'sja_incomplete', missing: ['hazards'] }))).toBe(
      'hse.errors.sja_incomplete',
    );
  });

  it('falls back on the status', () => {
    expect(hseErrorKey(error(403, { code: 'forbidden_x' }))).toBe('hse.errors.forbidden');
    expect(hseErrorKey(error(422, [{ loc: ['body'] }]))).toBe('hse.errors.validation');
    expect(hseErrorKey(error(500, null))).toBe('errors.server');
    expect(hseErrorKey(new Error('x'))).toBe('errors.generic');
  });
});
