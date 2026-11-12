import { humanize } from '../../../core/kit/entity-types.service';
import { CalendarItem, LocalizedLabel } from './reports.models';

/** The label in the UI language, else English, else any language, else `fallback`. */
export function localized(
  label: LocalizedLabel | null | undefined,
  lang: string,
  fallback = '',
): string {
  if (!label) {
    return fallback;
  }
  return label[lang] || label['en'] || Object.values(label).find((v) => !!v) || fallback;
}

/** `reports.frameworks.<key>` (the eight framework names live in the reports scope). */
export function frameworkLabelKey(framework: string): string {
  return `reports.frameworks.${framework}`;
}

/** Global module name key (`modules.names.<key>`, provided by the module registry). */
export function moduleLabelKey(module: string): string {
  return `modules.names.${module}`;
}

/**
 * Translate `key` with `translate` (which returns the key when missing), falling
 * back to a humanized form of `raw` so an unknown value still reads well.
 */
export function labelOr(translate: (key: string) => string, key: string, raw: string): string {
  const text = translate(key);
  return text && text !== key ? text : humanize(raw);
}

/** Where a dashboard widget's "open" link goes (null: no list page behind it). */
export function widgetLink(key: string): {
  readonly path: string;
  readonly queryParams?: Readonly<Record<string, string>>;
} | null {
  switch (key) {
    case 'standards.readiness':
      return { path: '/standards' };
    case 'deviations.open_findings':
    case 'deviations.overdue_actions':
      return { path: '/deviations' };
    case 'tasks.overdue':
      return { path: '/my-work' };
    case 'documents.reviews':
      return { path: '/documents' };
    case 'reports.overdue_items':
      return { path: '/reports/calendar', queryParams: { overdue: '1' } };
    case 'reports.upcoming':
      return { path: '/reports/calendar' };
    case 'reports.audit_packs':
      return { path: '/reports/audit-packs' };
    default:
      return null;
  }
}

/** Human file size (`1.2 MB`), using the given number formatter. */
export function formatBytes(bytes: number, lang = 'en'): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Math.max(0, bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  const text = new Intl.NumberFormat(lang, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
  return `${text} ${units[unit]}`;
}

/** Tone of a readiness score (0–100). */
export function scoreTone(score: number | null | undefined): 'pass' | 'warn' | 'fail' | 'neutral' {
  if (score === null || score === undefined) {
    return 'neutral';
  }
  if (score >= 80) return 'pass';
  if (score >= 50) return 'warn';
  return 'fail';
}

/** CSS colour of a readiness score (for rings and bars). */
export function scoreColor(score: number | null | undefined): string {
  switch (scoreTone(score)) {
    case 'pass':
      return 'var(--pass)';
    case 'warn':
      return 'var(--warn)';
    case 'fail':
      return 'var(--fail)';
    default:
      return 'var(--accent)';
  }
}

// --- calendar -----------------------------------------------------------------------------

/** `YYYY-MM-DD` of a local date. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The calendar day of a naive-UTC ISO datetime (`2026-11-12T09:00:00` -> `2026-11-12`). */
export function isoDay(value: string): string {
  return value.slice(0, 10);
}

/** A naive ISO datetime at local midnight of `date` (what the API's `from`/`to` expect). */
export function naiveStartOfDay(date: Date): string {
  return `${dayKey(date)}T00:00:00`;
}

/** Parse `YYYY-MM` (else null). */
export function parseMonth(
  value: string | null | undefined,
): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (!match) {
    return null;
  }
  const month = Number(match[2]) - 1;
  return month >= 0 && month <= 11 ? { year: Number(match[1]), month } : null;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export interface CalendarDay {
  readonly key: string;
  readonly date: Date;
  readonly inMonth: boolean;
  readonly isToday: boolean;
}

/**
 * The weeks (Monday first) covering a month: 4–6 rows of seven days, padded with
 * the neighbouring months' days.
 */
export function monthGrid(year: number, month: number, today: Date = new Date()): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - offset);
  const last = new Date(year, month + 1, 0);
  const days = offset + last.getDate();
  const weeks = Math.ceil(days / 7);
  const todayKey = dayKey(today);
  const grid: CalendarDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const key = dayKey(date);
      week.push({ key, date, inMonth: date.getMonth() === month, isToday: key === todayKey });
    }
    grid.push(week);
  }
  return grid;
}

/** The API window for a month grid: its first shown day to the day after its last. */
export function gridWindow(grid: readonly (readonly CalendarDay[])[]): {
  from: string;
  to: string;
} {
  const first = grid[0][0].date;
  const lastWeek = grid[grid.length - 1];
  const last = lastWeek[lastWeek.length - 1].date;
  const after = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
  return { from: naiveStartOfDay(first), to: naiveStartOfDay(after) };
}

/** Calendar items grouped by their due day, each day sorted overdue first then by title. */
export function groupByDay(items: readonly CalendarItem[]): Map<string, CalendarItem[]> {
  const groups = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = isoDay(item.due_at);
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  for (const list of groups.values()) {
    list.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.title.localeCompare(b.title));
  }
  return groups;
}

/** Badge tone of a calendar item. */
export function calendarTone(item: CalendarItem): 'fail' | 'info' | 'accent' | 'neutral' {
  if (item.overdue) return 'fail';
  if (item.kind === 'review') return 'info';
  if (item.kind === 'action') return 'accent';
  return 'neutral';
}

// --- metric data -----------------------------------------------------------------------------

/** A numeric field of a metric's data, for generic rendering. */
export interface MetricNumber {
  readonly field: string;
  readonly value: number;
}

/** Top-level numeric fields of a metric's data (booleans and nested values excluded). */
export function metricNumbers(
  data: Readonly<Record<string, unknown>> | null | undefined,
): MetricNumber[] {
  if (!data) {
    return [];
  }
  return Object.entries(data)
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
    .map(([field, value]) => ({ field, value: value as number }));
}

/** Top-level `{label: number}` maps of a metric's data (e.g. `by_severity`). */
export function metricBreakdowns(
  data: Readonly<Record<string, unknown>> | null | undefined,
): { readonly field: string; readonly entries: readonly MetricNumber[] }[] {
  if (!data) {
    return [];
  }
  const out: { field: string; entries: MetricNumber[] }[] = [];
  for (const [field, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => ({ field: k, value: v as number }));
      if (entries.length) {
        out.push({ field, entries });
      }
    }
  }
  return out;
}

/** A cell of a risk heat map, accepted in a few common shapes. */
export interface HeatCell {
  readonly row: number;
  readonly col: number;
  readonly count: number;
  readonly color: string | null;
}

/**
 * Read a heat map from a metric's data. Accepts `{cells: [{likelihood,
 * consequence, count, color?}]}` (or `row`/`col`, `x`/`y`) plus optional
 * `rows`/`cols` sizes; returns null for any other shape so the page can fall back
 * to the generic view.
 */
export function readHeatMap(
  data: Readonly<Record<string, unknown>> | null | undefined,
): { readonly rows: number; readonly cols: number; readonly cells: readonly HeatCell[] } | null {
  const raw = data?.['cells'];
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const cells: HeatCell[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const e = entry as Record<string, unknown>;
    const row = Number(e['likelihood'] ?? e['row'] ?? e['y']);
    const col = Number(e['consequence'] ?? e['col'] ?? e['x']);
    const count = Number(e['count'] ?? e['value'] ?? 0);
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      continue;
    }
    cells.push({
      row,
      col,
      count: Number.isFinite(count) ? count : 0,
      color: typeof e['color'] === 'string' ? (e['color'] as string) : null,
    });
  }
  if (!cells.length) {
    return null;
  }
  const rows = Number(data?.['rows']) || Math.max(...cells.map((c) => c.row));
  const cols = Number(data?.['cols']) || Math.max(...cells.map((c) => c.col));
  return rows > 0 && cols > 0 && rows <= 10 && cols <= 10 ? { rows, cols, cells } : null;
}

/** A percentage in a training-style metric (`rate`, `percent`, `compliance`, 0–1 or 0–100). */
export function readPercent(
  data: Readonly<Record<string, unknown>> | null | undefined,
): number | null {
  for (const field of ['percent', 'rate', 'compliance', 'score']) {
    const value = data?.[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value <= 1 && field === 'rate' ? value * 100 : value);
    }
  }
  return null;
}

const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/**
 * A register cell as text: dates in the UI language (date only, from the
 * calendar day the API sent), numbers with grouping, lists comma-separated,
 * booleans as a check mark, empty values as a dash.
 */
export function cellText(value: unknown, lang = 'en'): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? '✓' : '—';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Intl.NumberFormat(lang).format(value) : '—';
  }
  if (Array.isArray(value)) {
    return value.map((v) => cellText(v, lang)).join(', ') || '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  const text = String(value);
  const match = ISO_DATETIME.exec(text);
  if (match && text.length <= 32) {
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    try {
      return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
    } catch {
      return text;
    }
  }
  return text;
}
