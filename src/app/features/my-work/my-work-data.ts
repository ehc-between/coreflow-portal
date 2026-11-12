import { KNOWN_WORK_SOURCES, WorkItem } from '../../core/tasks/task.models';
import { addDays, dayOf, localDay } from '../../shared/tasks/task-display';

/** The three My Work views (`?view=`). */
export type MyWorkView = 'list' | 'board' | 'calendar';
export const MY_WORK_VIEWS: readonly MyWorkView[] = ['list', 'board', 'calendar'];

export function parseView(value: string | null | undefined): MyWorkView {
  return MY_WORK_VIEWS.includes(value as MyWorkView) ? (value as MyWorkView) : 'list';
}

export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';
export const DUE_FILTERS: readonly DueFilter[] = ['all', 'overdue', 'today', 'week', 'none'];

export interface WorkFilters {
  /** `all` or a source key. */
  readonly source: string;
  readonly due: DueFilter;
  /** `all` or a priority. */
  readonly priority: string;
}

export const NO_FILTERS: WorkFilters = { source: 'all', due: 'all', priority: 'all' };

/** i18n key (scope `tasks`) naming a My Work source; module sources share "Other". */
export function sourceLabelKey(source: string): string {
  return (KNOWN_WORK_SOURCES as readonly string[]).includes(source)
    ? `tasks.sources.${source}`
    : 'tasks.sources.other';
}

export function sourceIcon(source: string): string {
  switch (source) {
    case 'task':
      return 'checkcircle';
    case 'deviation_action':
      return 'flag';
    case 'deviation':
      return 'alert';
    case 'document_review':
      return 'documents';
    case 'document_ack':
      return 'check';
    default:
      return 'inbox';
  }
}

/**
 * Apply the My Work filters. Due buckets use the calendar day of `due_at`
 * against `today` (`YYYY-MM-DD`, viewer's timezone); "overdue" trusts the
 * backend flag. "This week" is today plus the next six days.
 */
export function filterWorkItems(
  items: readonly WorkItem[],
  filters: WorkFilters,
  today: string,
): WorkItem[] {
  const weekEnd = addDays(today, 6);
  return items.filter((item) => {
    if (filters.source !== 'all' && item.source !== filters.source) {
      return false;
    }
    if (filters.priority !== 'all' && item.priority !== filters.priority) {
      return false;
    }
    const day = dayOf(item.due_at);
    switch (filters.due) {
      case 'overdue':
        return item.overdue;
      case 'today':
        return day === today;
      case 'week':
        return !!day && day >= today && day <= weekEnd;
      case 'none':
        return !day;
      default:
        return true;
    }
  });
}

/** Board columns: every open-like status lands in "To do". */
export type BoardColumn = 'open' | 'in_progress' | 'blocked';
export const BOARD_COLUMNS: readonly BoardColumn[] = ['open', 'in_progress', 'blocked'];

export function boardColumn(item: WorkItem): BoardColumn {
  return item.status === 'in_progress' || item.status === 'blocked' ? item.status : 'open';
}

export function groupByColumn(items: readonly WorkItem[]): Record<BoardColumn, WorkItem[]> {
  const groups: Record<BoardColumn, WorkItem[]> = { open: [], in_progress: [], blocked: [] };
  for (const item of items) {
    groups[boardColumn(item)].push(item);
  }
  return groups;
}

/** Counts for the My Work summary line. */
export function summarise(
  items: readonly WorkItem[],
  today: string,
): { readonly total: number; readonly overdue: number; readonly dueToday: number } {
  return {
    total: items.length,
    overdue: items.filter((i) => i.overdue).length,
    dueToday: items.filter((i) => dayOf(i.due_at) === today && !i.overdue).length,
  };
}

export interface CalendarDay {
  /** `YYYY-MM-DD`. */
  readonly day: string;
  readonly dayOfMonth: number;
  readonly inMonth: boolean;
  readonly isToday: boolean;
}

/**
 * The month grid for `year` / `month` (1-12): whole weeks from Monday to Sunday
 * covering the month, 4-6 rows of 7 days.
 */
export function monthGrid(year: number, month: number, today: string): CalendarDay[][] {
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month - 1, 1 - offset);
  const last = new Date(year, month, 0);
  const days = offset + last.getDate();
  const weeks = Math.ceil(days / 7);
  const grid: CalendarDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const day = localDay(date);
      week.push({
        day,
        dayOfMonth: date.getDate(),
        inMonth: date.getMonth() === month - 1,
        isToday: day === today,
      });
    }
    grid.push(week);
  }
  return grid;
}

/** The naive-UTC `from` / `to` window covering a month grid (first to last cell). */
export function gridRange(grid: readonly CalendarDay[][]): { from: string; to: string } {
  const first = grid[0][0].day;
  const lastWeek = grid[grid.length - 1];
  const last = lastWeek[lastWeek.length - 1].day;
  return { from: `${first}T00:00:00`, to: `${last}T23:59:59` };
}

/** Dated items keyed by their calendar day. */
export function itemsByDay(items: readonly WorkItem[]): Map<string, WorkItem[]> {
  const byDay = new Map<string, WorkItem[]>();
  for (const item of items) {
    const day = dayOf(item.due_at);
    if (!day) {
      continue;
    }
    const list = byDay.get(day) ?? [];
    list.push(item);
    byDay.set(day, list);
  }
  return byDay;
}

/** Shift a `{year, month}` by `delta` months. */
export function shiftMonth(
  ym: { readonly year: number; readonly month: number },
  delta: number,
): { year: number; month: number } {
  const date = new Date(ym.year, ym.month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}
