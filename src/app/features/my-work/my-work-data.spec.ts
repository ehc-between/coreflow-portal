import { WorkItem } from '../../core/tasks/task.models';
import {
  NO_FILTERS,
  boardColumn,
  filterWorkItems,
  gridRange,
  groupByColumn,
  itemsByDay,
  monthGrid,
  parseView,
  shiftMonth,
  sourceLabelKey,
  summarise,
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
    }),
    item({ id: 'd', due_at: '2026-11-19T10:00:00', status: 'blocked' }),
    item({ id: 'e', source: 'document_ack', status: null, priority: null }),
  ];

  it('parses the view param', () => {
    expect(parseView('board')).toBe('board');
    expect(parseView('calendar')).toBe('calendar');
    expect(parseView('gantt')).toBe('list');
    expect(parseView(null)).toBe('list');
  });

  it('filters by source, priority and due bucket', () => {
    const ids = (f: Partial<typeof NO_FILTERS>) =>
      filterWorkItems(items, { ...NO_FILTERS, ...f }, TODAY).map((i) => i.id);
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids({ source: 'deviation_action' })).toEqual(['c']);
    expect(ids({ priority: 'high' })).toEqual(['a']);
    expect(ids({ due: 'overdue' })).toEqual(['a']);
    expect(ids({ due: 'today' })).toEqual(['b']);
    // Today plus six days: the 18th is in, the 19th is out.
    expect(ids({ due: 'week' })).toEqual(['b', 'c']);
    expect(ids({ due: 'none' })).toEqual(['e']);
  });

  it('summarises overdue and due-today counts', () => {
    expect(summarise(items, TODAY)).toEqual({ total: 5, overdue: 1, dueToday: 1 });
  });

  it('groups items into board columns', () => {
    expect(boardColumn(item({ status: 'pending' }))).toBe('open');
    const board = groupByColumn(items);
    expect(board.open.map((i) => i.id)).toEqual(['a', 'b', 'e']);
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

  it('labels module sources as other', () => {
    expect(sourceLabelKey('deviation')).toBe('tasks.sources.deviation');
    expect(sourceLabelKey('training_assignment')).toBe('tasks.sources.other');
  });
});
