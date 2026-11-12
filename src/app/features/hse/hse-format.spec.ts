import { HttpErrorResponse } from '@angular/common/http';
import { hseErrorKey } from './data/hse-errors';
import { HseOverview } from './data/hse.models';
import {
  dayToWire,
  incompleteSteps,
  linesToList,
  listToLines,
  localInputToWire,
  riskTone,
  stepTotals,
  textOrNull,
  wireToLocalInput,
} from './hse-format';
import { overviewSections } from './hse-overview';
import { positiveInt } from './ppe/ppe-editor';
import { safetyRoundBody } from './safety-rounds/safety-rounds';
import { mergeSuggestions, stepDraft, stepsFromDrafts } from './sja/sja-editor';

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

  it('maps risk levels to badge tones', () => {
    expect(riskTone('low')).toBe('pass');
    expect(riskTone('medium')).toBe('warn');
    expect(riskTone('critical')).toBe('fail');
    expect(riskTone(null)).toBe('neutral');
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
  it('drops blank rows and parses hazards / controls per line', () => {
    const rows = [
      {
        ...stepDraft(),
        description: ' Rig the crane ',
        hazards: 'Tip-over\n',
        controls: 'Outriggers\nLevel ground',
        risk_level: 'high' as const,
      },
      stepDraft(),
    ];
    expect(stepsFromDrafts(rows)).toEqual([
      {
        description: 'Rig the crane',
        hazards: ['Tip-over'],
        controls: ['Outriggers', 'Level ground'],
        responsible: null,
        risk_level: 'high',
      },
    ]);
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
    safety_rounds: { open: 2, overdue: 1 },
  };

  it('builds the four landing cards with drill-down links', () => {
    const sections = overviewSections(overview);
    expect(sections.map((s) => s.key)).toEqual(['sja', 'ppe', 'consultations', 'safetyRounds']);
    const review = sections[0].stats.find((s) => s.query?.['status'] === 'in_review');
    expect(review?.value).toBe(2);
    expect(review?.tone).toBe('warn');
    const overdue = sections[1].stats.find((s) => s.query?.['due'] === '0');
    expect(overdue?.tone).toBe('fail');
    // No consultation held in the last year is a warning sign.
    expect(sections[2].stats[1].tone).toBe('warn');
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
