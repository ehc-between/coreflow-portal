import { WorkGroup, WorkItem } from '../../core/tasks/task.models';
import { addDays, dayOf, localDay } from '../../shared/tasks/task-display';

/** The three My Work views (`?view=`). */
export type MyWorkView = 'list' | 'board' | 'calendar';
export const MY_WORK_VIEWS: readonly MyWorkView[] = ['list', 'board', 'calendar'];

export function parseView(value: string | null | undefined): MyWorkView {
  return MY_WORK_VIEWS.includes(value as MyWorkView) ? (value as MyWorkView) : 'list';
}

/**
 * The My Work tabs (`?tab=`): Overdue, This week, Later and Awaiting review (the old
 * "Needs your review" page). Each maps to the backend's item `group`.
 */
export type WorkTab = 'overdue' | 'this_week' | 'later' | 'review';
export const WORK_TABS: readonly WorkTab[] = ['overdue', 'this_week', 'later', 'review'];

const TAB_GROUP: Record<WorkTab, WorkGroup> = {
  overdue: 'overdue',
  this_week: 'this_week',
  later: 'later',
  review: 'awaiting_review',
};

export function tabGroup(tab: WorkTab): WorkGroup {
  return TAB_GROUP[tab];
}

/** `?tab=` value -> tab; accepts the group names and `week` too. Null when absent or unknown. */
export function parseTab(value: string | null | undefined): WorkTab | null {
  switch (value) {
    case 'overdue':
    case 'later':
    case 'review':
    case 'this_week':
      return value;
    case 'week':
      return 'this_week';
    case 'awaiting_review':
      return 'review';
    default:
      return null;
  }
}

/** Sources that ask the caller to review or approve something (the review tab). */
export const REVIEW_SOURCES: readonly string[] = [
  'document_review',
  'proposal',
  'audit_report_review',
  'management_review_signoff',
];

/** Days ahead that count as "this week" (the backend's rule: the next seven days). */
export const THIS_WEEK_DAYS = 7;

/**
 * The tab an item belongs in: the backend's `group`, or (for an older backend) the
 * same rule computed here: review sources, then overdue, then due within seven days.
 */
export function groupOf(item: WorkItem, today: string): WorkGroup {
  if (item.group) {
    return item.group;
  }
  if (REVIEW_SOURCES.includes(item.source)) {
    return 'awaiting_review';
  }
  if (item.overdue) {
    return 'overdue';
  }
  const day = dayOf(item.due_at);
  return day && day <= addDays(today, THIS_WEEK_DAYS) ? 'this_week' : 'later';
}

export type TabCounts = Readonly<Record<WorkTab, number>>;

export function countTabs(items: readonly WorkItem[], today: string): TabCounts {
  const counts: Record<WorkTab, number> = { overdue: 0, this_week: 0, later: 0, review: 0 };
  for (const item of items) {
    const group = groupOf(item, today);
    const tab = WORK_TABS.find((t) => TAB_GROUP[t] === group) ?? 'later';
    counts[tab]++;
  }
  return counts;
}

/** The tab to open without `?tab=`: the first one with something in it. */
export function defaultTab(counts: TabCounts): WorkTab {
  return WORK_TABS.find((tab) => counts[tab] > 0) ?? 'overdue';
}

export interface WorkFilters {
  /** `all` or a module key. */
  readonly module: string;
  /** `all` or a source key (the item type). */
  readonly source: string;
}

export const NO_FILTERS: WorkFilters = { module: 'all', source: 'all' };

/** My Work sources with their own label (`tasks.work.kinds.<source>`); others read "Other". */
export const LABELLED_SOURCES: readonly string[] = [
  'task',
  'deviation_action',
  'deviation',
  'document_review',
  'document_ack',
  'proposal',
  'audit_finding',
  'audit_plan',
  'audit_report_review',
  'inspection',
  'inspection_finding',
  'management_review',
  'management_review_signoff',
  'project_milestone',
  'training_due',
];

/** i18n key (scope `tasks`) naming what an item is. */
export function sourceLabelKey(source: string): string {
  return LABELLED_SOURCES.includes(source)
    ? `tasks.work.kinds.${source}`
    : 'tasks.work.kinds.other';
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
    case 'document_ack':
      return 'documents';
    case 'proposal':
      return 'spark';
    case 'audit_finding':
    case 'audit_plan':
    case 'audit_report_review':
      return 'audit';
    case 'inspection':
    case 'inspection_finding':
      return 'qa';
    case 'management_review':
    case 'management_review_signoff':
      return 'calendar';
    case 'project_milestone':
      return 'projects';
    case 'training_due':
      return 'training';
    default:
      return 'inbox';
  }
}

const WHY_REASONS = [
  'overdue',
  'due_today',
  'due_soon',
  'approve',
  'acknowledge',
  'owner',
  'assigned',
] as const;

/**
 * The i18n key and params of an item's one-line reason ("Due in 3 days", "You are
 * the approver"). From the backend's `why_key`; a one-day deadline uses the `…One`
 * variant so the sentence reads naturally ("Due tomorrow").
 */
export function whyOf(item: WorkItem): { key: string; params: Record<string, unknown> } {
  const raw = item.why_key ?? '';
  const reason = raw.slice(raw.lastIndexOf('.') + 1);
  const known = (WHY_REASONS as readonly string[]).includes(reason) ? reason : fallbackReason(item);
  const days = Math.abs(Number(item.why_params?.['days'] ?? 0)) || 0;
  const one = (known === 'overdue' || known === 'due_soon') && days === 1;
  return { key: `tasks.work.why.${known}${one ? 'One' : ''}`, params: { days } };
}

function fallbackReason(item: WorkItem): string {
  if (REVIEW_SOURCES.includes(item.source)) {
    return 'approve';
  }
  if (item.overdue) {
    return 'overdue';
  }
  return item.source === 'task' ? 'assigned' : 'owner';
}

/** Apply the module and type filters. */
export function filterWorkItems(items: readonly WorkItem[], filters: WorkFilters): WorkItem[] {
  return items.filter(
    (item) =>
      (filters.source === 'all' || item.source === filters.source) &&
      (filters.module === 'all' || item.module === filters.module),
  );
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
