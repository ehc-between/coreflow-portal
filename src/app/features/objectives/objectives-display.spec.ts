import { niceTicks } from './components/kpi-chart';
import { kpiPayload, kpiToForm, EMPTY_KPI_FORM } from './kpi-editor';
import { EMPTY_OBJECTIVE_FORM, changedFields, objectivePayload } from './objective-editor';
import { kpiStatusesForFilter } from './kpis-list';
import { statusesForFilter } from './objectives-list';
import {
  addMonthsIso,
  healthKey,
  healthTone,
  isClosedObjective,
  optionId,
  parseNumber,
  textOrNull,
  thresholdError,
  todayIso,
} from './objectives-display';
import { KpiDetail } from './data/objectives.models';

describe('objectives display helpers', () => {
  it('checks thresholds the way the backend does', () => {
    expect(thresholdError('higher', null, null)).toBeNull();
    expect(thresholdError('higher', null, 3)).toBe('warning_without_target');
    expect(thresholdError('higher', 95, 90)).toBeNull();
    expect(thresholdError('higher', 95, 95)).toBeNull();
    expect(thresholdError('higher', 95, 97)).toBe('invalid_thresholds');
    expect(thresholdError('lower', 5, 7)).toBeNull();
    expect(thresholdError('lower', 5, 3)).toBe('invalid_thresholds');
  });

  it('parses numbers with either decimal separator', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('  ')).toBeNull();
    expect(parseNumber('4,2')).toBe(4.2);
    expect(parseNumber('1 000')).toBe(1000);
    expect(parseNumber('-3.5')).toBe(-3.5);
    expect(parseNumber('abc')).toBeNaN();
  });

  it('formats and shifts local dates', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-11-12', 6)).toBe('2027-05-12');
  });

  it('maps health and statuses', () => {
    expect(healthKey(null)).toBe('objectives.health.no_data');
    expect(healthKey('off_track')).toBe('objectives.health.off_track');
    expect(healthTone('on_track')).toBe('pass');
    expect(healthTone('at_risk')).toBe('warn');
    expect(isClosedObjective('achieved')).toBe(true);
    expect(isClosedObjective('active')).toBe(false);
  });

  it('decodes option values and trims text', () => {
    expect(optionId('user:u-1', 'user')).toBe('u-1');
    expect(optionId('department:d-1', 'user')).toBeNull();
    expect(textOrNull('  ')).toBeNull();
    expect(textOrNull(' x ')).toBe('x');
  });

  it('maps list filters to API statuses', () => {
    expect(statusesForFilter('open')).toEqual(['draft', 'active']);
    expect(statusesForFilter('all')).toEqual([]);
    expect(statusesForFilter('achieved')).toEqual(['achieved']);
    expect(kpiStatusesForFilter('in_use')).toEqual(['active', 'paused']);
    expect(kpiStatusesForFilter('retired')).toEqual(['retired']);
  });

  it('builds nice chart ticks covering the range', () => {
    const ticks = niceTicks(3, 97);
    expect(ticks[0]).toBeLessThanOrEqual(3);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(97);
    expect(niceTicks(5, 5).length).toBeGreaterThan(1);
  });
});

describe('objective and KPI form payloads', () => {
  it('turns empty text into null and progress into a number', () => {
    const payload = objectivePayload({
      ...EMPTY_OBJECTIVE_FORM,
      title: '  Fewer complaints ',
      progress: '40',
      management_system: 'iso9001',
    });
    expect(payload.title).toBe('Fewer complaints');
    expect(payload.description).toBeNull();
    expect(payload.progress).toBe(40);
    expect(payload.management_system).toBe('iso9001');
    expect(payload.due_date).toBeNull();
  });

  it('only sends changed fields', () => {
    const before = objectivePayload({ ...EMPTY_OBJECTIVE_FORM, title: 'A' });
    const after = objectivePayload({ ...EMPTY_OBJECTIVE_FORM, title: 'A', target: 'Ten' });
    expect(changedFields(before, after)).toEqual({ target: 'Ten' });
  });

  it('round-trips a KPI through the form', () => {
    const kpi = {
      name: 'Complaint rate',
      description: null,
      objective: { id: 'o-1', code: 'OBJ-001', title: 'Fewer complaints' },
      management_system: null,
      owner: { id: 'u-1', name: 'Ada' },
      department_id: null,
      unit: 'per 1000',
      direction: 'lower',
      baseline_value: 8,
      target_value: 5,
      warning_value: 6.5,
      frequency: 'monthly',
      data_source: null,
      status: 'active',
      start_date: null,
      measurement_reminders: true,
    } as unknown as KpiDetail;
    const payload = kpiPayload(kpiToForm(kpi));
    expect(payload).toMatchObject({
      name: 'Complaint rate',
      objective_id: 'o-1',
      owner_user_id: 'u-1',
      direction: 'lower',
      baseline_value: 8,
      target_value: 5,
      warning_value: 6.5,
    });
    expect(kpiPayload({ ...EMPTY_KPI_FORM, target_value: 'x' }).target_value).toBeNaN();
  });
});
