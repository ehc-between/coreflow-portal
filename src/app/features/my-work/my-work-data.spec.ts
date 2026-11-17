import { WorkItem } from '../../core/tasks/task.models';
import {
  NO_FILTERS,
  boardColumn,
  countTabs,
  defaultTab,
  filterWorkItems,
  gridRange,
  groupByColumn,
  groupOf,
  itemsByDay,
  monthGrid,
  parseTab,
  parseView,
  shiftMonth,
  sourceLabelKey,
  tabGroup,
  whyOf,
} from './my-work-data';

function item(overrides: Partial<WorkItem>): WorkItem {
  return {
    source: 'task',
    id: 'i-1',
    title: 'Item',
    code: null,
    status: 'open',
    priority: 'normal',
    due_at: null,
    url: '/tasks/i-1',
    entity_type: 'task',
    entity_id: 'i-1',
    module: 'tasks',
    overdue: false,
    ...overrides,
  };
}

const TODAY = '2026-11-12';

describe('My Work data', () => {
  const items = [
    item({ id: 'a', due_at: '2026-11-10T23:59:59', overdue: true, priority: 'high' }),
    item({ id: 'b', due_at: '2026-11-12T23:59:59' }),
    item({
      id: 'c',
      due_at: '2026-11-18T10:00:00',
      source: 'deviation_action',
      status: 'in_progress',
      module: 'deviations',
    }),
    item({ id: 'd', due_at: '2026-11-25T10:00:00', status: 'blocked' }),
    item({ id: 'e', source: 'document_ack', status: null, priority: null, module: 'documents' }),
    item({ id: 'f', source: 'document_review', module: 'documents' }),
  ];

  it('parses the view param', () => {
    expect(parseView('board')).toBe('board');
    expect(parseView('calendar')).toBe('calendar');
    expect(parseView('gantt')).toBe('list');
    expect(parseView(null)).toBe('list');
  });

  it('parses the tab param, accepting the backend group names', () => {
    expect(parseTab('overdue')).toBe('overdue');
    expect(parseTab('week')).toBe('this_week');
    expect(parseTab('awaiting_review')).toBe('review');
    expect(parseTab('review')).toBe('review');
    expect(parseTab('soon')).toBeNull();
    expect(parseTab(null)).toBeNull();
    expect(tabGroup('review')).toBe('awaiting_review');
  });

  it('uses the backend group, else computes it the same way', () => {
    expect(groupOf(item({ group: 'later', overdue: true }), TODAY)).toBe('later');
    expect(items.map((i) => groupOf(i, TODAY))).toEqual([
      'overdue',
      'this_week',
      'this_week',
      'later',
      'later',
      'awaiting_review',
    ]);
  });

  it('counts the tabs and opens the first one with items', () => {
    const counts = countTabs(items, TODAY);
    expect(counts).toEqual({ overdue: 1, this_week: 2, later: 2, review: 1 });
    expect(defaultTab(counts)).toBe('overdue');
    expect(defaultTab({ overdue: 0, this_week: 0, later: 3, review: 1 })).toBe('later');
    expect(defaultTab({ overdue: 0, this_week: 0, later: 0, review: 0 })).toBe('overdue');
  });

  it('filters by module and type', () => {
    const ids = (f: Partial<typeof NO_FILTERS>) =>
      filterWorkItems(items, { ...NO_FILTERS, ...f }).map((i) => i.id);
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(ids({ source: 'deviation_action' })).toEqual(['c']);
    expect(ids({ module: 'documents' })).toEqual(['e', 'f']);
    expect(ids({ module: 'documents', source: 'document_ack' })).toEqual(['e']);
  });

  it('says why an item is on the list, with a natural one-day variant', () => {
    expect(whyOf(item({ why_key: 'tasks:work.why.due_soon', why_params: { days: 3 } }))).toEqual({
      key: 'tasks.work.why.due_soon',
      params: { days: 3 },
    });
    expect(whyOf(item({ why_key: 'tasks:work.why.overdue', why_params: { days: 1 } })).key).toBe(
      'tasks.work.why.overdueOne',
    );
    // Without the P5 fields: derived from the source.
    expect(whyOf(item({ source: 'proposal' })).key).toBe('tasks.work.why.approve');
    expect(whyOf(item({ source: 'deviation' })).key).toBe('tasks.work.why.owner');
  });

  it('groups items into board columns', () => {
    expect(boardColumn(item({ status: 'pending' }))).toBe('open');
    const board = groupByColumn(items);
    expect(board.open.map((i) => i.id)).toEqual(['a', 'b', 'e', 'f']);
    expect(board.in_progress.map((i) => i.id)).toEqual(['c']);
    expect(board.blocked.map((i) => i.id)).toEqual(['d']);
  });

  it('builds a Monday-first month grid covering the month', () => {
    const grid = monthGrid(2026, 11, TODAY);
    // November 2026 starts on a Sunday: the grid starts Monday 26 October.
    expect(grid[0][0].day).toBe('2026-10-26');
    expect(grid[0][6]).toMatchObject({ day: '2026-11-01', inMonth: true, dayOfMonth: 1 });
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(
      grid
        .flat()
        .filter((d) => d.isToday)
        .map((d) => d.day),
    ).toEqual([TODAY]);
    expect(grid.flat().filter((d) => d.inMonth)).toHaveLength(30);
    expect(gridRange(grid)).toEqual({
      from: '2026-10-26T00:00:00',
      to: `${grid[grid.length - 1][6].day}T23:59:59`,
    });
  });

  it('keys dated items by day', () => {
    const byDay = itemsByDay(items);
    expect(byDay.get('2026-11-12')?.map((i) => i.id)).toEqual(['b']);
    expect([...byDay.keys()]).not.toContain('');
  });

  it('shifts months across years', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('labels every known source and calls the rest other', () => {
    expect(sourceLabelKey('deviation')).toBe('tasks.work.kinds.deviation');
    expect(sourceLabelKey('training_due')).toBe('tasks.work.kinds.training_due');
    expect(sourceLabelKey('vendor_thing')).toBe('tasks.work.kinds.other');
  });
});
