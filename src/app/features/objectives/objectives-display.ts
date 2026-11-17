import { formatDate } from '@angular/common';
import { ToneMeaning } from '../../shared/ui/tones';
import {
  CLOSED_OBJECTIVE_STATUSES,
  Kpi,
  KpiDirection,
  KpiFrequency,
  KpiStatus,
  ManagementSystem,
  MeasurementStatus,
  Objective,
  ObjectiveStatus,
  Trend,
} from './data/objectives.models';

/** The Transloco scope (portal path) and the module key of M08. */
export const OBJECTIVES_SCOPE = 'objectives';
export const OBJECTIVES_MODULE = 'objectives';

export const objectiveStatusKey = (status: ObjectiveStatus) =>
  `objectives.objectiveStatus.${status}`;
export const kpiStatusKey = (status: KpiStatus) => `objectives.kpiStatus.${status}`;
/** Health of a KPI from its last measurement; `null` (never measured) is "no data". */
export const healthKey = (status: MeasurementStatus | null) =>
  `objectives.health.${status ?? 'no_data'}`;
export const trendKey = (trend: Trend) => `objectives.trend.${trend}`;
export const managementSystemKey = (system: string) => `objectives.managementSystems.${system}`;

/**
 * How a module value reads on the shared tone map (docs/ux-guide.md §5): the
 * badge passes `meaning` + `value` to `app-status-badge` and keeps the module's
 * own label. No local colour functions.
 */
export interface ToneSpec {
  readonly meaning: ToneMeaning;
  readonly value: string;
}

/** Objective lifecycle: draft grey, active accent, achieved green, not achieved red. */
export const OBJECTIVE_STATUS_TONE: Readonly<Record<ObjectiveStatus, ToneSpec>> = {
  draft: { meaning: 'lifecycle', value: 'draft' },
  active: { meaning: 'lifecycle', value: 'active' },
  achieved: { meaning: 'lifecycle', value: 'completed' },
  not_achieved: { meaning: 'lifecycle', value: 'failed' },
  cancelled: { meaning: 'lifecycle', value: 'cancelled' },
};

/** KPI lifecycle: only "active" is coloured; paused and retired are neutral. */
export const KPI_STATUS_TONE: Readonly<Record<KpiStatus, ToneSpec>> = {
  active: { meaning: 'lifecycle', value: 'active' },
  paused: { meaning: 'lifecycle', value: 'draft' },
  retired: { meaning: 'lifecycle', value: 'retired' },
};

/** KPI health reads as "is the target met": on track = met, at risk = partial, off track = not met. */
const HEALTH_TONE: Readonly<Record<MeasurementStatus | 'no_data', ToneSpec>> = {
  on_track: { meaning: 'compliance', value: 'met' },
  at_risk: { meaning: 'compliance', value: 'partial' },
  off_track: { meaning: 'compliance', value: 'not_met' },
  no_target: { meaning: 'compliance', value: 'unknown' },
  no_data: { meaning: 'compliance', value: 'unknown' },
};

export const healthSpec = (status: MeasurementStatus | null): ToneSpec =>
  HEALTH_TONE[status ?? 'no_data'];

export const TREND_TONE: Readonly<Record<Trend, ToneSpec>> = {
  improving: { meaning: 'compliance', value: 'met' },
  worsening: { meaning: 'compliance', value: 'not_met' },
  stable: { meaning: 'compliance', value: 'unknown' },
  insufficient_data: { meaning: 'compliance', value: 'unknown' },
};

/** CSS colour of a measurement status, for chart markers (always paired with a label). */
export const HEALTH_COLOR: Readonly<Record<MeasurementStatus | 'no_data', string>> = {
  on_track: 'var(--pass)',
  at_risk: 'var(--warn)',
  off_track: 'var(--fail)',
  no_target: 'var(--fg-subtle)',
  no_data: 'var(--fg-subtle)',
};

export const healthColor = (status: MeasurementStatus | null): string =>
  HEALTH_COLOR[status ?? 'no_data'];

export function isClosedObjective(status: ObjectiveStatus): boolean {
  return CLOSED_OBJECTIVE_STATUSES.includes(status);
}

/** Every system an objective serves (older servers only send the primary one). */
export function objectiveSystems(o: Pick<Objective, 'management_system' | 'management_systems'>) {
  const list = o.management_systems?.length
    ? o.management_systems
    : o.management_system
      ? [o.management_system]
      : [];
  return list as readonly ManagementSystem[];
}

/** at_risk + off_track, from the server when it sends it. */
export function needsAttention(k: {
  readonly at_risk: number;
  readonly off_track: number;
  readonly needs_attention?: number;
}): number {
  return k.needs_attention ?? k.at_risk + k.off_track;
}

/** The progress to show (manual override, else computed from the KPIs), or null. */
export function shownProgress(o: Objective): number | null {
  if (o.effective_progress !== undefined) {
    return o.effective_progress;
  }
  return o.progress;
}

/** Where the shown progress comes from (older servers: manual when set). */
export function progressSource(o: Objective): 'kpis' | 'manual' | 'none' {
  if (o.progress_source) {
    return o.progress_source;
  }
  return o.progress !== null ? 'manual' : 'none';
}

/** Whether a KPI needs action now (at risk or off track). */
export function kpiNeedsAction(k: Pick<Kpi, 'last_status'>): boolean {
  return k.last_status === 'at_risk' || k.last_status === 'off_track';
}

/**
 * Whether a change is an improvement given the direction ("lower is better" makes
 * a drop good). Null when there is no change.
 */
export function changeIsBetter(change: number | null, direction: KpiDirection): boolean | null {
  if (change === null || change === 0) {
    return null;
  }
  return direction === 'higher' ? change > 0 : change < 0;
}

/**
 * Client-side check of the threshold rule the backend enforces: a warning value
 * needs a target, and sits on the "worse" side of it (at or below the target
 * when higher is better, at or above when lower is better). Returns the error
 * code the server would answer with, or null.
 */
export function thresholdError(
  direction: Kpi['direction'],
  target: number | null,
  warning: number | null,
): 'warning_without_target' | 'invalid_thresholds' | null {
  if (warning === null) {
    return null;
  }
  if (target === null) {
    return 'warning_without_target';
  }
  if (direction === 'higher' ? warning > target : warning < target) {
    return 'invalid_thresholds';
  }
  return null;
}

/**
 * The status a value would get against the thresholds (same rule as the backend):
 * on target or better is on track, between target and warning at risk, past the
 * warning (or past the target without a warning) off track.
 */
export function previewStatus(
  value: number | null,
  direction: KpiDirection,
  target: number | null,
  warning: number | null,
): MeasurementStatus | null {
  if (value === null || Number.isNaN(value)) {
    return null;
  }
  if (target === null) {
    return 'no_target';
  }
  const better = (a: number, b: number) => (direction === 'higher' ? a >= b : a <= b);
  if (better(value, target)) {
    return 'on_track';
  }
  if (warning !== null && better(value, warning)) {
    return 'at_risk';
  }
  return 'off_track';
}

/** Parse a number input's text (`,` accepted as a decimal separator); '' is null, junk NaN. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Today as `YYYY-MM-DD` in the user's local time zone. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** `YYYY-MM-DD` that is `months` after `from` (clamped to the end of shorter months). */
export function addMonthsIso(from: string, months: number): string {
  const [y, m, d] = from.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return todayIso(target);
}

/** One calendar period of a KPI's frequency. */
export interface Period {
  readonly start: string;
  readonly end: string;
}

/** The calendar period of `frequency` that contains `day` (weeks run Monday to Sunday). */
export function periodContaining(frequency: KpiFrequency, day: string): Period {
  const d = parseIso(day);
  const y = d.getFullYear();
  const m = d.getMonth();
  const span = (start: Date, end: Date): Period => ({ start: todayIso(start), end: todayIso(end) });
  switch (frequency) {
    case 'weekly': {
      const offset = (d.getDay() + 6) % 7;
      const start = new Date(y, m, d.getDate() - offset);
      return span(start, new Date(y, m, d.getDate() - offset + 6));
    }
    case 'monthly':
      return span(new Date(y, m, 1), new Date(y, m + 1, 0));
    case 'quarterly': {
      const q = Math.floor(m / 3) * 3;
      return span(new Date(y, q, 1), new Date(y, q + 3, 0));
    }
    case 'half_yearly': {
      const h = m < 6 ? 0 : 6;
      return span(new Date(y, h, 1), new Date(y, h + 6, 0));
    }
    default:
      return span(new Date(y, 0, 1), new Date(y, 11, 31));
  }
}

/** The period before `period` (same frequency). */
export function previousPeriod(frequency: KpiFrequency, period: Period): Period {
  const start = parseIso(period.start);
  start.setDate(start.getDate() - 1);
  return periodContaining(frequency, todayIso(start));
}

/** The last `count` periods that have ended by `today`, newest first. */
export function completedPeriods(frequency: KpiFrequency, today: string, count = 12): Period[] {
  let period = periodContaining(frequency, today);
  if (period.end > today) {
    period = previousPeriod(frequency, period);
  }
  const out: Period[] = [];
  for (let i = 0; i < count; i++) {
    out.push(period);
    period = previousPeriod(frequency, period);
  }
  return out;
}

/** ISO 8601 week number and its year. */
export function isoWeek(day: string): { week: number; year: number } {
  const d = parseIso(day);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getDay() + 6) % 7)) /
        7,
    );
  return { week, year: target.getFullYear() };
}

/**
 * The i18n key and params that name a period in plain words ("oktober 2026",
 * "3. kvartal 2026", "uke 42, 2026"). Months are formatted by the caller
 * (`monthName`), because month names come from the locale, not the files.
 */
export function periodLabelParts(
  frequency: KpiFrequency,
  period: Period,
): { key: string; params: Record<string, number> } {
  const start = parseIso(period.start);
  const year = start.getFullYear();
  switch (frequency) {
    case 'weekly': {
      const w = isoWeek(period.start);
      return { key: 'objectives.period.week', params: { week: w.week, year: w.year } };
    }
    case 'monthly':
      return { key: 'objectives.period.month', params: { month: start.getMonth(), year } };
    case 'quarterly':
      return {
        key: 'objectives.period.quarter',
        params: { quarter: Math.floor(start.getMonth() / 3) + 1, year },
      };
    case 'half_yearly':
      return {
        key: 'objectives.period.half',
        params: { half: start.getMonth() < 6 ? 1 : 2, year },
      };
    default:
      return { key: 'objectives.period.year', params: { year } };
  }
}

/** Whether a period matches a calendar period of the frequency exactly. */
export function isCalendarPeriod(frequency: KpiFrequency, period: Period): boolean {
  const calendar = periodContaining(frequency, period.end);
  return calendar.start === period.start && calendar.end === period.end;
}

/** Plan years offered in filters and forms: last year to two years ahead. */
export function planYears(today: string = todayIso()): number[] {
  const year = Number(today.slice(0, 4));
  return [year - 1, year, year + 1, year + 2];
}

/** Strip a `user:` / `department:` prefix from an assignee option value. */
export function optionId(value: string, prefix: 'user' | 'department'): string | null {
  return value.startsWith(`${prefix}:`) ? value.slice(prefix.length + 1) : null;
}

/** Empty text becomes null (so a cleared field is sent as "no value"). */
export function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

/** Save a downloaded file. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}

/** A period in plain words in the UI language ("oktober 2026", "3. kvartal 2026"). */
export function periodLabel(
  frequency: KpiFrequency,
  period: Period,
  locale: string,
  translate: (key: string, params?: Record<string, unknown>) => string,
): string {
  const parts = periodLabelParts(frequency, period);
  if (frequency === 'monthly') {
    const month = formatDate(period.start, 'LLLL', locale);
    return translate(parts.key, { month, year: parts.params['year'] });
  }
  return translate(parts.key, parts.params);
}

/** The singular form of a counted key (`…One`) when `count` is 1 (repo plural convention). */
export function countKey(key: string, count: number): string {
  return count === 1 ? `${key}One` : key;
}
