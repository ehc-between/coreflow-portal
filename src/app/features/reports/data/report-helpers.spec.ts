import { HttpErrorResponse } from '@angular/common/http';
import { assigneeFields } from '../definitions/schedule-dialog';
import { draftFromQuery } from '../definitions/definition-form';
import { builtinLayout, moveItem, normaliseLayout } from '../dashboards/dashboard-designer';
import { dateFilterValue, dateInputValue, supportedFilters } from '../components/register-filters';
import { widgetSpan } from '../components/report-widgets';
import {
  calendarTone,
  cellText,
  formatBytes,
  gridWindow,
  groupByDay,
  localized,
  monthGrid,
  parseMonth,
  readHeatMap,
  readPercent,
  scoreTone,
  widgetLink,
} from './report-display';
import { blobErrorKey, fileStem, reportErrorKey } from './report-errors';
import { CalendarItem, Register, WidgetCatalogItem } from './reports.models';

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

  it('chooses a tone per calendar item', () => {
    expect(calendarTone(item({ overdue: true, kind: 'review' }))).toBe('fail');
    expect(calendarTone(item({ kind: 'review' }))).toBe('info');
    expect(calendarTone(item({ kind: 'action' }))).toBe('accent');
    expect(calendarTone(item({}))).toBe('neutral');
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

  it('maps scores, sizes, links and bytes', () => {
    expect(scoreTone(90)).toBe('pass');
    expect(scoreTone(60)).toBe('warn');
    expect(scoreTone(10)).toBe('fail');
    expect(scoreTone(null)).toBe('neutral');
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
