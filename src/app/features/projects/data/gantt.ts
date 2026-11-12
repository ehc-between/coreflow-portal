import { PlanItem, PlanItemKind } from './project.models';

/** One row of a Gantt chart (a plan item or a whole project on the portfolio view). */
export interface GanttRow {
  readonly id: string;
  readonly kind: PlanItemKind | 'project';
  readonly title: string;
  /** Secondary text (code, owner). */
  readonly subtitle?: string | null;
  readonly status: string;
  readonly start: string | null;
  readonly end: string | null;
  /** Indentation level (0 = top). */
  readonly depth: number;
  readonly overdue: boolean;
  /** Router URL (path plus optional `?query`). */
  readonly url: string;
}

export interface GanttBar {
  readonly row: GanttRow;
  /** Left offset in percent of the range, or null when the row has no dates. */
  readonly left: number | null;
  /** Width in percent; 0 for a point in time (milestone diamond). */
  readonly width: number;
  readonly point: boolean;
}

export interface GanttTick {
  /** First day of the month, `YYYY-MM-DD`. */
  readonly date: string;
  readonly left: number;
}

export interface GanttLayout {
  readonly start: string;
  readonly end: string;
  readonly days: number;
  readonly bars: readonly GanttBar[];
  readonly ticks: readonly GanttTick[];
  /** Today's offset in percent, or null when today is outside the range. */
  readonly today: number | null;
}

const DAY_MS = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Days since the epoch of a `YYYY-MM-DD` date (timestamps are cut to the date), else null. */
export function dayNumber(value: string | null | undefined): number | null {
  const m = value ? DATE.exec(value) : null;
  if (!m) {
    return null;
  }
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

export function dayString(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Today as a `YYYY-MM-DD` string in the user's local calendar. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Plan items as Gantt rows: each phase followed by its milestones, each milestone
 * by its tasks; then milestones outside a phase, then tasks directly on the project.
 * Order inside a group is the backend's order.
 */
export function planRows(items: readonly PlanItem[]): GanttRow[] {
  const phases = items.filter((i) => i.kind === 'phase');
  const milestones = items.filter((i) => i.kind === 'milestone');
  const tasks = items.filter((i) => i.kind === 'task');
  const phaseIds = new Set(phases.map((p) => p.id));
  const milestoneIds = new Set(milestones.map((m) => m.id));
  const rows: GanttRow[] = [];
  const push = (item: PlanItem, depth: number) =>
    rows.push({
      id: item.id,
      kind: item.kind,
      title: item.title,
      subtitle: item.owner?.name ?? null,
      status: item.status,
      start: item.start,
      end: item.end,
      depth,
      overdue: item.is_overdue,
      url: item.url,
    });
  const pushMilestone = (m: PlanItem, depth: number) => {
    push(m, depth);
    for (const t of tasks.filter((t) => t.parent_id === m.id)) {
      push(t, depth + 1);
    }
  };
  for (const phase of phases) {
    push(phase, 0);
    for (const m of milestones.filter((m) => m.parent_id === phase.id)) {
      pushMilestone(m, 1);
    }
  }
  for (const m of milestones.filter((m) => !m.parent_id || !phaseIds.has(m.parent_id))) {
    pushMilestone(m, 0);
  }
  for (const t of tasks.filter((t) => !t.parent_id || !milestoneIds.has(t.parent_id))) {
    push(t, 0);
  }
  return rows;
}

/**
 * Position every row on a shared day axis. The range covers all dated rows plus
 * the optional `start`/`end` hints, padded by a few days; null when nothing is dated.
 */
export function ganttLayout(
  rows: readonly GanttRow[],
  options: { start?: string | null; end?: string | null; today?: string } = {},
): GanttLayout | null {
  const days: number[] = [];
  for (const r of rows) {
    for (const d of [dayNumber(r.start), dayNumber(r.end)]) {
      if (d !== null) {
        days.push(d);
      }
    }
  }
  for (const d of [dayNumber(options.start), dayNumber(options.end)]) {
    if (d !== null) {
      days.push(d);
    }
  }
  if (!days.length) {
    return null;
  }
  const first = Math.min(...days) - 3;
  const last = Math.max(...days) + 3;
  const total = last - first + 1;
  const pct = (day: number) => ((day - first) / total) * 100;

  const bars: GanttBar[] = rows.map((row) => {
    const s = dayNumber(row.start);
    const e = dayNumber(row.end);
    if (s === null && e === null) {
      return { row, left: null, width: 0, point: false };
    }
    if (s === null || e === null || row.kind === 'milestone') {
      // A milestone (or anything with one date) is a point in time: its due day.
      const at = (e ?? s) as number;
      return { row, left: pct(at + 0.5), width: 0, point: true };
    }
    const from = Math.min(s, e);
    const to = Math.max(s, e);
    return { row, left: pct(from), width: ((to - from + 1) / total) * 100, point: false };
  });

  const ticks: GanttTick[] = [];
  const startDate = new Date(first * DAY_MS);
  let year = startDate.getUTCFullYear();
  let month = startDate.getUTCMonth() + 1;
  const months: number[] = [];
  for (;;) {
    if (month > 11) {
      month = 0;
      year += 1;
    }
    const day = Math.floor(Date.UTC(year, month, 1) / DAY_MS);
    if (day > last) {
      break;
    }
    months.push(day);
    month += 1;
  }
  const step = months.length > 24 ? 3 : 1;
  months.forEach((day, i) => {
    if (i % step === 0) {
      ticks.push({ date: dayString(day), left: pct(day) });
    }
  });

  const todayDay = dayNumber(options.today ?? localToday());
  const today = todayDay !== null && todayDay >= first && todayDay <= last ? pct(todayDay) : null;

  return { start: dayString(first), end: dayString(last), days: total, bars, ticks, today };
}

/** Split a backend url (`/projects/<id>?milestone=<mid>`) into router link + query params. */
export function routerTarget(url: string): {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
} {
  const [path, search = ''] = url.split('?', 2);
  const query: Record<string, string> = {};
  for (const part of search.split('&')) {
    if (!part) {
      continue;
    }
    const [k, v = ''] = part.split('=', 2);
    query[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return { path, query };
}
