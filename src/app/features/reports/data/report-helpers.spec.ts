import { HttpErrorResponse } from '@angular/common/http';
import { assigneeFields } from '../definitions/schedule-dialog';
import { draftFromQuery } from '../definitions/definition-form';
import {
  builtinLayout,
  moveItem,
  normaliseLayout,
  startingLayout,
} from '../dashboards/dashboard-designer';
import {
  dateFilterKey,
  dateFilterValue,
  dateInputValue,
  registerStatusLabel,
  supportedFilters,
} from '../components/register-filters';
import { widgetSpan } from '../components/report-widgets';
import { packCoverage } from '../audit-packs/audit-pack-detail';
import { packStandardKeys } from '../audit-packs/audit-packs-list';
import { prefillFromFlow, validPeriod } from '../audit-packs/generate-pack-dialog';
import { shortHash } from '../definitions/definition-detail';
import { averageSeries } from '../overview/compliance-overview';
import {
  calendarState,
  calendarTone,
  cellText,
  clauseText,
  columnCell,
  formatBytes,
  frameworkLabelKey,
  gridWindow,
  groupAlike,
  groupByDay,
  groupRegisters,
  localized,
  metricFieldLabel,
  monthGrid,
  packReadiness,
  parseMonth,
  percentOf,
  readHeatMap,
  readPercent,
  scoreTone,
  sparklinePoints,
  stateTone,
  trendDirection,
  widgetLink,
} from './report-display';
import { blobErrorKey, fileStem, reportErrorKey } from './report-errors';
import { AuditPack, CalendarItem, Register, WidgetCatalogItem } from './reports.models';

function item(partial: Partial<CalendarItem>): CalendarItem {
  return {
    module: 'tasks',
    entity_type: 'task',
    entity_id: 'id',
    title: 'T',
    code: null,
    due_at: '2026-11-12T00:00:00',
    kind: 'due',
    url: null,
    status: null,
    overdue: false,
    label_key: null,
    ...partial,
  };
}

const REGISTER: Register = {
  key: 'tasks',
  module: 'tasks',
  label: { en: 'Tasks', nb: 'Oppgaver' },
  columns: [
    { key: 'title', label: { en: 'Title' } },
    { key: 'status', label: { en: 'Status' } },
  ],
  params: ['q', 'status', 'from', 'to'],
  statuses: ['open', 'done'],
  requires_standard: false,
  frameworks: [],
  formats: ['csv', 'xlsx', 'pdf'],
};

describe('report display helpers', () => {
  it('builds a Monday-first month grid that covers the whole month', () => {
    // November 2026 starts on a Sunday and has 30 days.
    const grid = monthGrid(2026, 10, new Date(2026, 10, 12));
    expect(grid.length).toBe(6);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[0][0].key).toBe('2026-10-26');
    expect(grid[0][6].key).toBe('2026-11-01');
    expect(grid[0][6].inMonth).toBe(true);
    expect(
      grid
        .flat()
        .filter((d) => d.isToday)
        .map((d) => d.key),
    ).toEqual(['2026-11-12']);
    expect(gridWindow(grid)).toEqual({ from: '2026-10-26T00:00:00', to: '2026-12-07T00:00:00' });
  });

  it('parses months and rejects junk', () => {
    expect(parseMonth('2026-02')).toEqual({ year: 2026, month: 1 });
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth('nope')).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
  });

  it('groups calendar items by day, overdue first', () => {
    const groups = groupByDay([
      item({ title: 'B', due_at: '2026-11-12T10:00:00' }),
      item({ title: 'A', due_at: '2026-11-12T00:00:00' }),
      item({ title: 'Z', due_at: '2026-11-12T00:00:00', overdue: true }),
      item({ title: 'C', due_at: '2026-11-13T00:00:00' }),
    ]);
    expect([...groups.keys()]).toEqual(['2026-11-12', '2026-11-13']);
    expect(groups.get('2026-11-12')!.map((i) => i.title)).toEqual(['Z', 'A', 'B']);
  });

  it('derives the state of a calendar item and its tone (overdue is warn, never red)', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    expect(calendarState(item({ overdue: true, kind: 'review' }), now)).toBe('overdue');
    expect(calendarTone(item({ overdue: true, kind: 'review' }), now)).toBe('warn');
    expect(calendarState(item({ kind: 'review' }), now)).toBe('review');
    expect(calendarTone(item({ kind: 'review' }), now)).toBe('info');
    expect(calendarState(item({ kind: 'action' }), now)).toBe('action');
    expect(calendarTone(item({}), now)).toBe('neutral');
    // Within 14 days counts as "due soon".
    expect(calendarState(item({ due_at: '2026-10-10T00:00:00' }), now)).toBe('due_soon');
    // The backend's state wins.
    expect(calendarState(item({ state: 'due_soon' }), now)).toBe('due_soon');
    expect(stateTone('due_soon')).toBe('accent');
  });

  it('groups alike items of a day (seven assignments of one course)', () => {
    const groups = groupAlike([
      item({ entity_type: 'training_assignment', code: 'TRN-001', title: 'Awareness' }),
      item({ entity_type: 'training_assignment', code: 'TRN-001', title: 'Awareness' }),
      item({ entity_type: 'asset', code: 'AST-5', title: 'Laptop' }),
    ]);
    expect(groups.map((g) => g.items.length)).toEqual([2, 1]);
    expect(groups[0].first.code).toBe('TRN-001');
  });

  it('shows register cells as the export does: display text, else value words', () => {
    const column = {
      key: 'status',
      label: { en: 'Status' },
      enum: true,
      values: { in_progress: { en: 'In progress', nb: 'Pågår' } },
    };
    expect(columnCell(column, 'in_progress', 'Under arbeid', 'nb')).toBe('Under arbeid');
    expect(columnCell(column, 'in_progress', undefined, 'nb')).toBe('Pågår');
    expect(columnCell(column, ['in_progress'], undefined, 'en')).toBe('In progress');
    expect(columnCell(column, null, undefined, 'en')).toBe('—');
    expect(columnCell(column, 'x', '', 'en')).toBe('—');
  });

  it('reads pack coverage as a number, also from packs made before A25', () => {
    expect(packReadiness(42)).toBe(42);
    expect(packReadiness({ score: 7.4, applicable: 10 })).toBe(7);
    expect(packReadiness(null)).toBeNull();
    expect(percentOf(9, 364)).toBe(2);
    expect(percentOf(0, 0)).toBe(0);
  });

  it('labels standards, clauses and metric fields without raw keys', () => {
    expect(frameworkLabelKey('iso27001-2022')).toBe('reports.frameworks.iso27001');
    expect(frameworkLabelKey('eu-ai-act-2024')).toBe('reports.frameworks.eu_ai_act');
    expect(
      clauseText(
        { ref: 'hs:7.5', framework: 'hs', number: '7.5', label: { nb: 'Felles ISO-krav · 7.5' } },
        'nb',
      ),
    ).toBe('Felles ISO-krav · 7.5');
    const translate = (key: string) => (key === 'reports.fields.open' ? 'Åpne' : key);
    expect(metricFieldLabel(translate, 'open', null, 'nb')).toBe('Åpne');
    expect(
      metricFieldLabel(translate, 'ict_gaps', { ict_gaps: { nb: 'IT med mangler' } }, 'nb'),
    ).toBe('IT med mangler');
    expect(metricFieldLabel(translate, 'odd_field', null, 'nb')).toBe('Odd field');
  });

  it('reads trends: good or bad news, and a sparkline inside its box', () => {
    expect(trendDirection({ delta: -2, better: 'down' })).toBe('better');
    expect(trendDirection({ delta: 3, better: 'down' })).toBe('worse');
    expect(trendDirection({ delta: 5, better: 'up' })).toBe('better');
    expect(trendDirection({ delta: 0, better: 'up' })).toBe('same');
    expect(trendDirection({ delta: null, better: 'up' })).toBe('same');
    const points = sparklinePoints(
      [
        { period: '2026-09-01', value: 1 },
        { period: '2026-10-01', value: 3 },
      ],
      100,
      20,
    );
    expect(points).toBe('2,18 98,2');
    expect(sparklinePoints([], 100, 20)).toBe('');
  });

  it('groups registers by area', () => {
    const groups = groupRegisters(
      [
        { ...REGISTER, key: 'risks', module: 'risk' },
        { ...REGISTER, key: 'tasks', module: 'tasks' },
        { ...REGISTER, key: 'treatments', module: 'risk' },
      ],
      (m) => (m === 'risk' ? 'Risiko' : 'Oppgaver'),
    );
    expect(groups.map((g) => g.name)).toEqual(['Oppgaver', 'Risiko']);
    expect(groups[1].registers.map((r) => r.key)).toEqual(['risks', 'treatments']);
  });

  it('formats register cells', () => {
    expect(cellText(null)).toBe('—');
    expect(cellText(true)).toBe('✓');
    expect(cellText(['a', 'b'])).toBe('a, b');
    expect(cellText(1234, 'en')).toBe('1,234');
    expect(cellText('2026-11-12T23:30:00', 'en')).toBe('Nov 12, 2026');
    expect(cellText('plain text')).toBe('plain text');
  });

  it('picks the label in the UI language with fallbacks', () => {
    expect(localized({ en: 'Tasks', nb: 'Oppgaver' }, 'nb')).toBe('Oppgaver');
    expect(localized({ en: 'Tasks' }, 'nb')).toBe('Tasks');
    expect(localized(null, 'nb', 'fallback')).toBe('fallback');
  });

  it('reads heat maps in the supported shapes only', () => {
    const map = readHeatMap({
      cells: [
        { likelihood: 1, consequence: 1, count: 2 },
        { likelihood: 5, consequence: 5, count: 1, color: '#f00' },
      ],
    });
    expect(map?.rows).toBe(5);
    expect(map?.cols).toBe(5);
    expect(map?.cells[1].color).toBe('#f00');
    expect(readHeatMap({ cells: [] })).toBeNull();
    expect(readHeatMap({ something: 1 })).toBeNull();
    expect(readHeatMap(null)).toBeNull();
  });

  it('reads training percentages', () => {
    expect(readPercent({ rate: 0.875 })).toBe(88);
    expect(readPercent({ percent: 64 })).toBe(64);
    expect(readPercent({ total: 3 })).toBeNull();
  });

  it('maps scores, sizes, links and bytes (coverage is never red)', () => {
    expect(scoreTone(100)).toBe('pass');
    expect(scoreTone(60)).toBe('accent');
    expect(scoreTone(1)).toBe('accent');
    expect(scoreTone(0)).toBe('neutral');
    expect(scoreTone(null)).toBe('neutral');
    expect(widgetLink('risk.heat_map', { url: '/risk/risks' })).toEqual({ path: '/risk/risks' });
    expect(widgetLink('x.y', { url: '/reports/calendar?overdue=1' })).toEqual({
      path: '/reports/calendar',
      queryParams: { overdue: '1' },
    });
    expect(widgetLink('x.y', { url: 'https://evil.example' })).toBeNull();
    expect(widgetSpan('lg')).toContain('xl:col-span-4');
    expect(widgetSpan('weird')).toContain('xl:col-span-2');
    expect(widgetLink('reports.overdue_items')).toEqual({
      path: '/reports/calendar',
      queryParams: { overdue: '1' },
    });
    expect(widgetLink('risk.heat_map')).toBeNull();
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(fileStem('Åpne avvik Q3!')).toBe('apne-avvik-q3');
    expect(fileStem('***')).toBe('report');
  });
});

describe('register filter helpers', () => {
  it('converts date inputs to API datetimes and back', () => {
    expect(dateFilterValue('2026-11-01', 'from')).toBe('2026-11-01T00:00:00');
    expect(dateFilterValue('2026-11-30', 'to')).toBe('2026-11-30T23:59:59');
    expect(dateFilterValue('', 'from')).toBeNull();
    expect(dateInputValue('2026-11-30T23:59:59')).toBe('2026-11-30');
    expect(dateInputValue(null)).toBe('');
  });

  it('keeps only the filters and statuses a register accepts', () => {
    expect(
      supportedFilters(REGISTER, {
        q: 'x',
        status: ['open', 'bogus'],
        standard_key: 'iso27001',
        to: '2026-12-01T00:00:00',
      }),
    ).toEqual({
      q: 'x',
      status: ['open'],
      from: null,
      to: '2026-12-01T00:00:00',
      standard_key: null,
    });
    expect(supportedFilters(null, { q: 'x' })).toEqual({});
  });
});

describe('form and designer helpers', () => {
  it('prefills a saved report from the register explorer', () => {
    const draft = draftFromQuery(
      {
        register: 'deviations',
        status: 'open,closed',
        columns: 'code,title',
        lang: 'nb',
        q: 'fire',
      },
      'en',
    );
    expect(draft.register_key).toBe('deviations');
    expect(draft.filters.status).toEqual(['open', 'closed']);
    expect(draft.filters.q).toBe('fire');
    expect(draft.columns).toEqual(['code', 'title']);
    expect(draft.lang).toBe('nb');
    expect(draftFromQuery({ lang: 'de' }, 'en').lang).toBe('en');
  });

  it('turns an encoded assignee into schedule fields', () => {
    expect(assigneeFields('role:quality_manager')).toEqual({
      assignee_type: 'role',
      assignee_value: 'quality_manager',
    });
    expect(assigneeFields('')).toEqual({});
  });

  it('moves, normalises and builds layouts', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(
      normaliseLayout([{ key: 'x', size: 'huge' as never, framework: 'nope' as never }]),
    ).toEqual([{ key: 'x', size: 'md', framework: null }]);
    const catalog = [
      { key: 'a', default: true },
      { key: 'b', default: false },
    ] as unknown as WidgetCatalogItem[];
    expect(builtinLayout(catalog)).toEqual([{ key: 'a', framework: null, size: 'md' }]);
  });

  it('starts a scope from its role layout, else the built-in default, else the catalogue', () => {
    const catalog = [{ key: 'a', default: true }] as unknown as WidgetCatalogItem[];
    const builtin = {
      default: [{ key: 'tasks.overdue', size: 'sm' as const }],
      roles: {
        dpo: [{ key: 'privacy.deadlines', size: 'lg' as const, framework: 'gdpr' as const }],
      },
    };
    expect(startingLayout('dpo', builtin, catalog)).toEqual([
      { key: 'privacy.deadlines', size: 'lg', framework: 'gdpr' },
    ]);
    expect(startingLayout('auditor', builtin, catalog)[0].key).toBe('tasks.overdue');
    expect(startingLayout('default', null, catalog)[0].key).toBe('a');
  });

  it('labels date filters after the date they filter on', () => {
    expect(dateFilterKey('due', 'from')).toBe('reports.filters.dates.due.from');
    expect(dateFilterKey('aware', 'to')).toBe('reports.filters.dates.aware.to');
    expect(dateFilterKey('mystery', 'to')).toBe('reports.filters.to');
    expect(dateFilterKey(undefined, 'from')).toBe('reports.filters.from');
  });

  it('uses the register words for statuses, then the portal words', () => {
    const reg = { ...REGISTER, status_labels: { open: { en: 'Open', nb: 'Åpen' } } };
    const translate = (key: string) => (key === 'reports.statuses.done' ? 'Ferdig' : key);
    expect(registerStatusLabel(reg, 'open', translate, 'nb')).toBe('Åpen');
    expect(registerStatusLabel(reg, 'done', translate, 'nb')).toBe('Ferdig');
    expect(registerStatusLabel(null, 'in_treatment', translate, 'nb')).toBe('In treatment');
  });

  it('averages coverage series per month', () => {
    const series = (values: number[]) => ({
      key: 'standards.readiness',
      scope: 's',
      scope_label: null,
      label: { en: 'Coverage' },
      module: 'standards',
      unit: 'percent',
      better: 'up',
      points: values.map((value, i) => ({ period: `2026-0${i + 1}-01`, value })),
      latest: values.at(-1) ?? null,
      previous: values.at(-2) ?? null,
      delta: null,
    });
    const avg = averageSeries([series([10, 20]), series([30, 40])]);
    expect(avg?.points.map((p) => p.value)).toEqual([20, 30]);
    expect(avg?.delta).toBe(10);
    expect(averageSeries([])).toBeNull();
  });

  it('prefills the audit pack drawer from an audit and checks the period', () => {
    const prefill = prefillFromFlow({
      key: 'audit_plan.to_audit_pack',
      token: 't',
      targetType: 'audit_pack',
      targetRoute: '/reports/audit-packs?flow=t',
      prefill: {
        audit_plan_id: 'plan-1',
        standard_keys: ['iso27001-2022', 7],
        title: 'Internrevisjon 2026',
        from: {
          entity_type: 'audit_plan',
          entity_id: 'plan-1',
          code: 'AUD-2026-002',
          title: 'Internrevisjon 2026',
          url: '/audits/plans/plan-1',
        },
      },
      source: null,
      requirementRef: null,
      startedAt: 0,
    });
    expect(prefill?.standardKeys).toEqual(['iso27001-2022']);
    expect(prefill?.auditPlan?.code).toBe('AUD-2026-002');
    expect(prefill?.title).toBe('Internrevisjon 2026');
    expect(prefillFromFlow(null)).toBeNull();
    expect(validPeriod('2026-01-01', '2026-12-31')).toBe(true);
    expect(validPeriod('2026-12-31', '2026-01-01')).toBe(false);
    expect(validPeriod('', '2026-01-01')).toBe(true);
  });

  it('reads the standards and coverage of a pack, old and new', () => {
    const base = {
      standard_key: 'iso27001-2022',
      framework: 'iso27001',
      summary: {
        requirements: 364,
        applicable: 300,
        covered: 30,
        evidence_links: 40,
        readiness: 10,
      },
    } as unknown as AuditPack;
    expect(packStandardKeys(base)).toEqual(['iso27001-2022']);
    expect(packCoverage(base)).toEqual([
      expect.objectContaining({ applicable: 300, covered: 30, score: 10 }),
    ]);
    const multi = {
      ...base,
      standard_keys: ['iso9001-2015', 'iso27001-2022'],
      summary: {
        standards: [
          {
            standard_key: 'iso9001-2015',
            framework: 'iso9001',
            requirements: 80,
            applicable: 80,
            covered: 8,
            evidence_links: 9,
            score: 10,
          },
        ],
      },
    } as unknown as AuditPack;
    expect(packStandardKeys(multi)).toHaveLength(2);
    expect(packCoverage(multi)[0].standard_key).toBe('iso9001-2015');
    expect(shortHash('abcdef0123456789')).toBe('abcdef012345');
    expect(shortHash(null)).toBe('—');
  });
});

describe('report errors', () => {
  it('maps coded errors, bare 403s and other statuses', () => {
    const coded = new HttpErrorResponse({
      status: 409,
      error: { detail: { code: 'standard_not_enabled' } },
    });
    expect(reportErrorKey(coded)).toBe('reports.errors.standard_not_enabled');
    expect(reportErrorKey(new HttpErrorResponse({ status: 403 }))).toBe('reports.errors.forbidden');
    expect(reportErrorKey(new HttpErrorResponse({ status: 500 }))).not.toContain('reports.');
    expect(reportErrorKey('boom')).toBe('errors.generic');
  });

  it('reads coded errors from blob bodies', async () => {
    const blob = new Blob([JSON.stringify({ detail: { code: 'audit_pack_empty' } })], {
      type: 'application/json',
    });
    const error = new HttpErrorResponse({ status: 409, error: blob });
    await expect(blobErrorKey(error)).resolves.toBe('reports.errors.audit_pack_empty');
  });
});
