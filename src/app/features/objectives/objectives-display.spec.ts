import { HttpErrorResponse } from '@angular/common/http';
import { niceTicks, stepPath } from './components/kpi-chart';
import { kpiPayload, kpiToForm, EMPTY_KPI_FORM } from './kpi-editor';
import { monitoringRef, toneOfShare } from './kpi-detail';
import { kpiStatusesForFilter, healthForChoice, kpiTiles } from './kpis-list';
import { nextSteps } from './objective-detail';
import {
  EMPTY_OBJECTIVE_FORM,
  changedFields,
  objectivePayload,
  suggestedKpiRequest,
} from './objective-editor';
import { objectiveTiles, statusesForFilter } from './objectives-list';
import {
  OBJECTIVE_STATUS_TONE,
  addMonthsIso,
  changeIsBetter,
  completedPeriods,
  countKey,
  healthKey,
  healthSpec,
  isCalendarPeriod,
  isClosedObjective,
  isMissingRecord,
  isoWeek,
  needsAttention,
  objectiveSystems,
  optionId,
  parseNumber,
  periodContaining,
  periodLabelParts,
  previewStatus,
  progressSource,
  shownProgress,
  textOrNull,
  thresholdError,
  todayIso,
} from './objectives-display';
import {
  KpiDetail,
  Objective,
  ObjectiveDetail,
  ObjectivesOverview,
  SeriesPoint,
} from './data/objectives.models';
import { toneFor } from '../../shared/ui/tones';

const OVERVIEW: ObjectivesOverview = {
  objectives: {
    total: 6,
    by_status: { draft: 1, active: 3, achieved: 1, not_achieved: 0, cancelled: 1 },
    overdue: 1,
  },
  kpis: { total: 5, on_track: 2, at_risk: 1, off_track: 1, no_data: 1, measurement_overdue: 2 },
};

function objective(overrides: Partial<ObjectiveDetail> = {}): ObjectiveDetail {
  return {
    id: 'o-1',
    org_id: 'org-1',
    code: 'OBJ-001',
    title: 'Fewer complaints',
    description: null,
    management_system: 'iso9001',
    management_systems: ['iso9001'],
    status: 'active',
    owner: null,
    department_id: null,
    target: null,
    plan: null,
    resources: null,
    evaluation_method: null,
    start_date: null,
    due_date: '2099-12-31',
    overdue: false,
    progress: null,
    origins: [
      {
        entity_type: 'policy',
        entity_id: 'p-1',
        title: 'Quality policy',
        code: 'POL-1',
        url: null,
        status: null,
        module: 'context',
        label_key: null,
      },
    ],
    last_communicated_on: '2026-01-10',
    closed_at: null,
    closing_note: null,
    kpis: { total: 1, on_track: 1, at_risk: 0, off_track: 0, no_data: 0 },
    url: '/objectives/o-1',
    created_by: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    kpi_items: [{ id: 'k-1' } as KpiDetail],
    can_edit: true,
    can_delete: true,
    ...overrides,
  };
}

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

  it('previews the status a value would get', () => {
    expect(previewStatus(null, 'lower', 5, 8)).toBeNull();
    expect(previewStatus(4, 'lower', 5, 8)).toBe('on_track');
    expect(previewStatus(6, 'lower', 5, 8)).toBe('at_risk');
    expect(previewStatus(9, 'lower', 5, 8)).toBe('off_track');
    expect(previewStatus(96, 'higher', 95, 90)).toBe('on_track');
    expect(previewStatus(80, 'higher', 95, null)).toBe('off_track');
    expect(previewStatus(3, 'higher', null, null)).toBe('no_target');
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

  it('finds calendar periods and the completed ones before today', () => {
    expect(periodContaining('monthly', '2026-10-15')).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(periodContaining('quarterly', '2026-11-17')).toEqual({
      start: '2026-10-01',
      end: '2026-12-31',
    });
    expect(periodContaining('half_yearly', '2026-03-01')).toEqual({
      start: '2026-01-01',
      end: '2026-06-30',
    });
    expect(periodContaining('weekly', '2026-11-18')).toEqual({
      start: '2026-11-16',
      end: '2026-11-22',
    });
    const months = completedPeriods('monthly', '2026-11-17', 3);
    expect(months.map((p) => p.end)).toEqual(['2026-10-31', '2026-09-30', '2026-08-31']);
    expect(completedPeriods('monthly', '2026-10-31', 1)[0].end).toBe('2026-10-31');
    expect(isCalendarPeriod('monthly', { start: '2026-10-01', end: '2026-10-31' })).toBe(true);
    expect(isCalendarPeriod('monthly', { start: '2026-10-05', end: '2026-10-31' })).toBe(false);
    expect(isoWeek('2026-01-01')).toEqual({ week: 1, year: 2026 });
    expect(periodLabelParts('quarterly', { start: '2026-07-01', end: '2026-09-30' })).toEqual({
      key: 'objectives.period.quarter',
      params: { quarter: 3, year: 2026 },
    });
  });

  it('maps health and statuses onto the shared tone map', () => {
    expect(healthKey(null)).toBe('objectives.health.no_data');
    expect(healthKey('off_track')).toBe('objectives.health.off_track');
    const tone = (s: Parameters<typeof healthSpec>[0]) =>
      toneFor(healthSpec(s).meaning, healthSpec(s).value);
    expect(tone('on_track')).toBe('pass');
    expect(tone('at_risk')).toBe('warn');
    expect(tone('off_track')).toBe('fail');
    expect(tone(null)).toBe('neutral');
    const status = (s: keyof typeof OBJECTIVE_STATUS_TONE) =>
      toneFor(OBJECTIVE_STATUS_TONE[s].meaning, OBJECTIVE_STATUS_TONE[s].value);
    expect(status('achieved')).toBe('pass');
    expect(status('draft')).toBe('neutral');
    expect(isClosedObjective('achieved')).toBe(true);
    expect(isClosedObjective('active')).toBe(false);
  });

  it('reads the change by direction', () => {
    expect(changeIsBetter(-1, 'lower')).toBe(true);
    expect(changeIsBetter(-1, 'higher')).toBe(false);
    expect(changeIsBetter(0, 'higher')).toBeNull();
    expect(changeIsBetter(null, 'lower')).toBeNull();
  });

  it('tones the share of periods on track', () => {
    expect(toneOfShare(null)).toBe('neutral');
    expect(toneOfShare(0.17)).toBe('fail');
    expect(toneOfShare(0.6)).toBe('warn');
    expect(toneOfShare(0.9)).toBe('pass');
  });

  it('names the monitoring clause a KPI documents', () => {
    expect(monitoringRef('iso9001')).toBe('iso9001:9.1.1');
    expect(monitoringRef('iso27001')).toBe('iso27001:9.1');
    expect(monitoringRef('gdpr')).toBeNull();
  });

  it('shows progress from the KPIs unless overridden, also for older servers', () => {
    const base = objective();
    expect(
      shownProgress({ ...base, progress: 0, effective_progress: 100, progress_source: 'kpis' }),
    ).toBe(100);
    expect(progressSource({ ...base, progress_source: 'kpis' })).toBe('kpis');
    expect(shownProgress({ ...base, progress: 40 } as Objective)).toBe(40);
    expect(progressSource({ ...base, progress: 40 } as Objective)).toBe('manual');
    expect(progressSource(base)).toBe('none');
  });

  it('lists every system of an objective', () => {
    expect(
      objectiveSystems({
        management_system: 'iso45001',
        management_systems: ['iso45001', 'iso9001'],
      }),
    ).toEqual(['iso45001', 'iso9001']);
    expect(objectiveSystems({ management_system: 'iso9001' })).toEqual(['iso9001']);
    expect(objectiveSystems({ management_system: null })).toEqual([]);
  });

  it('counts at risk and off track separately from the attention total', () => {
    expect(needsAttention({ at_risk: 1, off_track: 2 })).toBe(3);
    expect(needsAttention({ at_risk: 1, off_track: 2, needs_attention: 4 })).toBe(4);
    expect(countKey('a.b', 1)).toBe('a.bOne');
    expect(countKey('a.b', 2)).toBe('a.b');
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
    expect(healthForChoice('attention')).toEqual(['at_risk', 'off_track']);
    expect(healthForChoice('')).toBeUndefined();
  });

  it('builds tab-specific tiles that mark the active filter', () => {
    const objectives = objectiveTiles(OVERVIEW, 'active', false);
    expect(objectives.map((t) => t.key)).toEqual([
      'active',
      'draft',
      'overdue',
      'achieved',
      'not_achieved',
      'kpis',
    ]);
    expect(objectives.find((t) => t.key === 'active')?.active).toBe(true);
    expect(objectives.find((t) => t.key === 'kpis')?.value).toBe(2);
    const kpis = kpiTiles(OVERVIEW, 'at_risk', false);
    expect(kpis.map((t) => t.key)).toEqual([
      'all',
      'on_track',
      'at_risk',
      'off_track',
      'no_data',
      'overdue',
    ]);
    expect(kpis.find((t) => t.key === 'at_risk')).toMatchObject({ value: 1, active: true });
    expect(objectiveTiles(null, 'open', false)).toEqual([]);
  });

  it('builds nice chart ticks covering the range', () => {
    const ticks = niceTicks(3, 97);
    expect(ticks[0]).toBeLessThanOrEqual(3);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(97);
    expect(niceTicks(5, 5).length).toBeGreaterThan(1);
  });

  it('draws threshold step lines through the values in force per period', () => {
    const point = (target: number | null): SeriesPoint => ({
      period_end: '2026-01-31',
      value: 1,
      status: 'on_track',
      target_value: target,
      warning_value: null,
    });
    const pts = [
      { x: 10, point: point(5) },
      { x: 30, point: point(4) },
    ];
    const d = stepPath(
      pts,
      (p) => p.target_value,
      4,
      (v) => v * 10,
      0,
      50,
    );
    expect(d).toBe('M0,50 H20 V40 H30 V40 H50');
    expect(
      stepPath(
        pts,
        (p) => p.warning_value,
        null,
        (v) => v,
        0,
        50,
      ),
    ).toBeNull();
  });
});

describe('objective next steps', () => {
  it('suggests what to do next, most important first', () => {
    expect(nextSteps(objective())).toEqual([]);
    expect(nextSteps(objective({ status: 'draft', kpi_items: [] })).map((s) => s.key)).toEqual([
      'activate',
      'addKpi',
    ]);
    expect(nextSteps(objective({ due_date: '2020-01-01' }), '2026-11-17')[0].key).toBe('close');
    expect(
      nextSteps(objective({ management_system: null, management_systems: [] })).map((s) => s.key),
    ).toEqual(['systems']);
    expect(nextSteps(objective({ last_communicated_on: null })).map((s) => s.key)).toEqual([
      'communicate',
    ]);
    expect(nextSteps(objective({ status: 'achieved', kpi_items: [] }))).toEqual([]);
    const attention = nextSteps(
      objective({ kpis: { total: 2, on_track: 0, at_risk: 1, off_track: 1, no_data: 0 } }),
    );
    expect(attention[0]).toEqual({ key: 'attention', params: { count: 2 } });
  });
});

describe('objective and KPI form payloads', () => {
  it('turns empty text into null and sends every system with the primary one', () => {
    const payload = objectivePayload({
      ...EMPTY_OBJECTIVE_FORM,
      title: '  Fewer complaints ',
      progress: '40',
      progress_note: ' KPI misses the training part ',
      management_systems: ['iso45001', 'iso9001'],
      period_year: '2026',
      origins: [
        {
          entity_type: 'risk',
          entity_id: 'r-1',
          title: 'Late deliveries',
          code: 'RSK-1',
          url: null,
          status: null,
          module: 'risk',
          label_key: null,
        },
      ],
    });
    expect(payload.title).toBe('Fewer complaints');
    expect(payload.description).toBeNull();
    expect(payload.progress).toBe(40);
    expect(payload.progress_note).toBe('KPI misses the training part');
    expect(payload.management_system).toBe('iso45001');
    expect(payload.management_systems).toEqual(['iso45001', 'iso9001']);
    expect(payload.period_year).toBe(2026);
    expect(payload.origins).toEqual([{ entity_type: 'risk', entity_id: 'r-1' }]);
    expect(payload.due_date).toBeNull();
    expect(
      objectivePayload({ ...EMPTY_OBJECTIVE_FORM, progress_note: 'x' }).progress_note,
    ).toBeNull();
  });

  it('only sends changed fields, comparing lists by value', () => {
    const before = objectivePayload({
      ...EMPTY_OBJECTIVE_FORM,
      title: 'A',
      management_systems: ['iso9001'],
    });
    const same = objectivePayload({
      ...EMPTY_OBJECTIVE_FORM,
      title: 'A',
      management_systems: ['iso9001'],
    });
    expect(changedFields(before, same)).toEqual({});
    const after = objectivePayload({
      ...EMPTY_OBJECTIVE_FORM,
      title: 'A',
      target: 'Ten',
      management_systems: ['iso9001', 'iso14001'],
    });
    expect(changedFields(before, after)).toEqual({
      target: 'Ten',
      management_systems: ['iso9001', 'iso14001'],
    });
  });

  it('turns a suggested KPI into a create request for the new objective', () => {
    expect(
      suggestedKpiRequest(
        { name: 'Complaint rate', unit: 'per 1000', target_value: 5, direction: 'lower' },
        'o-9',
        'u-1',
      ),
    ).toMatchObject({
      name: 'Complaint rate',
      objective_id: 'o-9',
      owner_user_id: 'u-1',
      direction: 'lower',
      frequency: 'monthly',
      target_value: 5,
      measurement_reminders: true,
    });
  });

  it('round-trips a KPI through the form', () => {
    const kpi = {
      name: 'Complaint rate',
      description: null,
      objective: { id: 'o-1', code: 'OBJ-001', title: 'Fewer complaints' },
      management_system: null,
      owner: { id: 'u-1', name: 'Ada' },
      evaluated_by: { id: 'u-2', name: 'Bo' },
      review_forum: 'Monthly management meeting',
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
      evaluated_by_user_id: 'u-2',
      review_forum: 'Monthly management meeting',
      direction: 'lower',
      baseline_value: 8,
      target_value: 5,
      warning_value: 6.5,
    });
    expect(kpiPayload({ ...EMPTY_KPI_FORM, target_value: 'x' }).target_value).toBeNaN();
  });
});

describe('isMissingRecord', () => {
  it('treats 404 and 403 as not found and everything else as retryable', () => {
    expect(isMissingRecord(new HttpErrorResponse({ status: 404 }))).toBe(true);
    expect(isMissingRecord(new HttpErrorResponse({ status: 403 }))).toBe(true);
    expect(isMissingRecord(new HttpErrorResponse({ status: 500 }))).toBe(false);
    expect(isMissingRecord(new HttpErrorResponse({ status: 0 }))).toBe(false);
    expect(isMissingRecord(new Error('boom'))).toBe(false);
  });
});
