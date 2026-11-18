import { humanize } from '../../../core/kit/entity-types.service';
import { frameworkOf } from '../../../shared/requirement-links/requirement-label';
import { toneFor } from '../../../shared/ui/tones';
import {
  CalendarItem,
  CalendarItemState,
  ClauseLabel,
  LocalizedLabel,
  Register,
  RegisterColumn,
  TrendPoint,
  TrendSeries,
} from './reports.models';

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

/**
 * `reports.frameworks.<key>`: the short, readable standard name in the UI language
 * ("ISO 9001 – kvalitet"). Accepts a framework key (`iso9001`) or a catalogue
 * standard key (`iso9001-2015`, `eu-ai-act-2024`).
 */
export function frameworkLabelKey(frameworkOrStandard: string): string {
  return `reports.frameworks.${frameworkOf(frameworkOrStandard)}`;
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
  return isTranslated(text, key) ? text : humanize(raw);
}

/** Whether `translate(key)` found a text (missing keys come back as the key, sometimes prefixed). */
export function isTranslated(text: string | null | undefined, key: string): text is string {
  return !!text && text !== key && !text.endsWith(`.${key}`);
}

/** A clause badge in the UI language ("Felles ISO-krav · 7.5"), never the raw ref. */
export function clauseText(clause: ClauseLabel, lang: string): string {
  return localized(clause.label, lang, clause.number);
}

export interface WidgetTarget {
  readonly path: string;
  readonly queryParams?: Readonly<Record<string, string>>;
}

/**
 * Where a dashboard widget's "open" link goes: the list behind the built-in metrics,
 * else the `url` a module metric sends in its data (null: no page behind it).
 */
export function widgetLink(
  key: string,
  data?: Readonly<Record<string, unknown>> | null,
): WidgetTarget | null {
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
      return { path: '/library/audit-packs' };
  }
  const url = data?.['url'];
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
    const [path, query] = url.split('?');
    if (!query) {
      return { path };
    }
    const queryParams: Record<string, string> = {};
    new URLSearchParams(query).forEach((value, name) => (queryParams[name] = value));
    return { path, queryParams };
  }
  return null;
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

/**
 * CSS colour of a requirement-coverage score (for rings and bars), from the shared
 * `progress` tone: 100 is done, above 0 is progress, 0 or unknown is neutral. Never
 * red (polish plan decision 11).
 */
export function scoreColor(score: number | null | undefined): string {
  switch (toneFor('progress', score)) {
    case 'pass':
      return 'var(--pass)';
    case 'accent':
      return 'var(--accent)';
    default:
      return 'var(--fg-subtle)';
  }
}

/** A pack's coverage as a number (packs made before A25 stored the whole readiness row). */
export function packReadiness(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (value && typeof value === 'object') {
    const score = (value as Record<string, unknown>)['score'];
    return typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null;
  }
  return null;
}

/** `covered / applicable` as a whole percent (0 when nothing applies). */
export function percentOf(covered: number, applicable: number): number {
  return applicable > 0 ? Math.round((covered / applicable) * 100) : 0;
}

// --- calendar -----------------------------------------------------------------------------

/** Within this many days an item counts as "due soon" (the backend uses the same). */
export const DUE_SOON_DAYS = 14;

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

/**
 * What an item needs (the backend's `state`; derived for older backends): late,
 * due within 14 days, a review, an action, or a plain due date.
 */
export function calendarState(item: CalendarItem, now: Date = new Date()): CalendarItemState {
  const state = item.state;
  if (
    state === 'overdue' ||
    state === 'due_soon' ||
    state === 'review' ||
    state === 'action' ||
    state === 'due'
  ) {
    return state;
  }
  if (item.overdue) {
    return 'overdue';
  }
  const due = new Date(item.due_at.slice(0, 19) + 'Z').getTime();
  if (Number.isFinite(due) && due - now.getTime() <= DUE_SOON_DAYS * 86_400_000) {
    return 'due_soon';
  }
  if (item.kind === 'review' || item.kind === 'action') {
    return item.kind;
  }
  return 'due';
}

export type CalendarTone = 'warn' | 'accent' | 'info' | 'neutral';

/**
 * Colour of a calendar state, from the shared tone map: overdue is warn (always
 * with the word "Forfalt"), due soon accent, reviews info, the rest neutral.
 */
export const STATE_TONE: Readonly<Record<CalendarItemState, CalendarTone>> = {
  overdue: 'warn',
  due_soon: 'accent',
  review: 'info',
  action: 'neutral',
  due: 'neutral',
};

/** Badge tone of a calendar item. */
export function calendarTone(item: CalendarItem, now: Date = new Date()): CalendarTone {
  return STATE_TONE[calendarState(item, now)];
}

/** Items of one day that look the same (e.g. seven assignments of one course). */
export interface CalendarGroup {
  readonly key: string;
  readonly first: CalendarItem;
  readonly items: readonly CalendarItem[];
}

/**
 * Collapse items of the same type, code and title (seven training assignments of
 * TRN-001 on one day) into one group, keeping the day's order.
 */
export function groupAlike(items: readonly CalendarItem[]): CalendarGroup[] {
  const groups = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = `${item.entity_type}|${item.code ?? ''}|${item.title}`;
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return [...groups.entries()].map(([key, list]) => ({ key, first: list[0], items: list }));
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
    if (field === 'matrix') {
      continue;
    }
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
  readonly level: string | null;
}

/**
 * Read a heat map from a metric's data. Accepts `{cells: [{likelihood,
 * consequence, count, color?, level?}]}` (or `row`/`col`, `x`/`y`) plus optional
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
      level: typeof e['level'] === 'string' ? (e['level'] as string) : null,
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

/**
 * The label of a metric field: the portal's `reports.fields.<field>`, else the
 * metric's own words from the backend, else a humanized key.
 */
export function metricFieldLabel(
  translate: (key: string) => string,
  field: string,
  labels: Readonly<Record<string, LocalizedLabel>> | null | undefined,
  lang: string,
): string {
  const key = `reports.fields.${field}`;
  const text = translate(key);
  if (isTranslated(text, key)) {
    return text;
  }
  return localized(labels?.[field], lang, '') || humanize(field);
}

// --- trends --------------------------------------------------------------------------------

export type TrendDirection = 'better' | 'worse' | 'same';

/** Whether the latest change is good news (`better` says which way is good). */
export function trendDirection(series: Pick<TrendSeries, 'delta' | 'better'>): TrendDirection {
  const delta = series.delta;
  if (delta === null || delta === undefined || !Number.isFinite(delta) || delta === 0) {
    return 'same';
  }
  const up = delta > 0;
  return (series.better === 'down' ? !up : up) ? 'better' : 'worse';
}

/**
 * An SVG polyline (`x,y x,y …`) of the points in a `width` × `height` box, with a
 * 2 px inset so the stroke is not clipped. Flat series sit in the middle.
 */
export function sparklinePoints(
  points: readonly TrendPoint[],
  width: number,
  height: number,
): string {
  const values = points.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (values.length === 0) {
    return '';
  }
  const inset = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = values.length > 1 ? (width - inset * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = values.length > 1 ? inset + i * step : width / 2;
      const y = span === 0 ? height / 2 : inset + (1 - (v - min) / span) * (height - inset * 2);
      return `${round1(x)},${round1(y)}`;
    })
    .join(' ');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// --- register cells ---------------------------------------------------------------------------

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
    const record = value as Record<string, unknown>;
    const text = record['title'] ?? record['name'] ?? record['code'];
    return typeof text === 'string' && text ? text : '—';
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

/**
 * The text of one preview cell: the backend's display text (exactly what the
 * export shows) when it sent one, else the column's value words for enum codes,
 * else {@link cellText}.
 */
export function columnCell(
  column: RegisterColumn,
  raw: unknown,
  display: string | undefined,
  lang: string,
): string {
  if (typeof display === 'string') {
    return display || '—';
  }
  const words = column.values;
  if (words) {
    if (typeof raw === 'string' && words[raw]) {
      return localized(words[raw], lang, raw);
    }
    if (Array.isArray(raw)) {
      return (
        raw
          .map((v) => (typeof v === 'string' && words[v] ? localized(words[v], lang, v) : v))
          .map((v) => cellText(v, lang))
          .join(', ') || '—'
      );
    }
  }
  return cellText(raw, lang);
}

// --- registers ------------------------------------------------------------------------------

export interface RegisterGroup {
  readonly module: string;
  readonly name: string;
  readonly registers: readonly Register[];
}

/** Registers grouped by area, areas in name order. */
export function groupRegisters(
  registers: readonly Register[],
  moduleName: (module: string) => string,
): RegisterGroup[] {
  const groups = new Map<string, Register[]>();
  for (const reg of registers) {
    const list = groups.get(reg.module);
    if (list) {
      list.push(reg);
    } else {
      groups.set(reg.module, [reg]);
    }
  }
  return [...groups.entries()]
    .map(([module, list]) => ({ module, name: moduleName(module), registers: list }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
