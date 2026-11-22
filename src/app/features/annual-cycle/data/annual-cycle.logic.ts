import { BadgeTone } from '../../../shared/ui/badge/badge';
import { YEAR_STATUSES, YearItem, YearMonth, YearStatus } from './annual-cycle.models';

/** Dots shown per month in the strip (prototype: "up to 6"). */
export const MAX_DOTS = 6;
/** Rows shown per month before "Vis alle". */
export const ROWS_PER_MONTH = 6;

export type DotTone = 'bad' | 'warn' | 'info' | 'ok';

/** Dot colour per status (prototype `.dots i.b / .w / (accent) / .g`). */
export const DOT_TONE: Readonly<Record<YearStatus, DotTone>> = {
  overdue: 'bad',
  soon: 'warn',
  not_planned: 'warn',
  planned: 'info',
  recurring: 'ok',
};

/** Pill tone per status. */
export const STATUS_TONE: Readonly<Record<YearStatus, BadgeTone>> = {
  overdue: 'fail',
  soon: 'warn',
  not_planned: 'warn',
  planned: 'neutral',
  recurring: 'neutral',
};

/** The month's dots, most urgent first, at most `MAX_DOTS`. */
export function monthDots(month: YearMonth): DotTone[] {
  const out: DotTone[] = [];
  for (const status of YEAR_STATUSES) {
    for (let i = 0; i < (month.counts[status] ?? 0) && out.length < MAX_DOTS; i++) {
      out.push(DOT_TONE[status]);
    }
  }
  return out;
}

export function monthTotal(month: YearMonth): number {
  return YEAR_STATUSES.reduce((sum, status) => sum + (month.counts[status] ?? 0), 0);
}

export interface MonthGroup {
  readonly month: string;
  readonly items: readonly YearItem[];
}

/** Items grouped by month in window order; months without items are left out. */
export function groupByMonth(
  months: readonly YearMonth[],
  items: readonly YearItem[],
): MonthGroup[] {
  const byMonth = new Map<string, YearItem[]>();
  for (const item of items) {
    const list = byMonth.get(item.month) ?? [];
    list.push(item);
    byMonth.set(item.month, list);
  }
  return months
    .map((m) => ({ month: m.month, items: byMonth.get(m.month) ?? [] }))
    .filter((g) => g.items.length > 0);
}

/** The status pill: i18n key + params (`annual.status.*`). */
export function statusLabel(item: YearItem): { key: string; params?: Record<string, unknown> } {
  if (item.status === 'soon') {
    const days = Math.max(0, item.days ?? 0);
    if (days === 0) {
      return { key: 'annual.status.today' };
    }
    return { key: days === 1 ? 'annual.status.daysOne' : 'annual.status.days', params: { days } };
  }
  if (item.status === 'recurring') {
    return { key: 'annual.status.planned' };
  }
  return { key: `annual.status.${item.status === 'not_planned' ? 'notPlanned' : item.status}` };
}

/** `YYYY-MM` -> a local Date on the 1st (no timezone shift). */
export function monthDate(month: string): Date {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, (m || 1) - 1, 1);
}

/** Short month name for the strip ("jan"), lower case without a trailing dot. */
export function shortMonth(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short' })
    .format(monthDate(month))
    .replace('.', '')
    .toLocaleLowerCase(locale);
}

/** Month heading ("November", "Januar 2027" when not the given year). */
export function monthHeading(month: string, locale: string, currentYear: number): string {
  const date = monthDate(month);
  const name = new Intl.DateTimeFormat(locale, { month: 'long' }).format(date);
  const cap = name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  return date.getFullYear() === currentYear ? cap : `${cap} ${date.getFullYear()}`;
}

/** The year "Foreslå årshjul for {year}" names: next year from November, else none. */
export function proposalYear(today: Date): number | null {
  return today.getMonth() >= 10 ? today.getFullYear() + 1 : null;
}

/** Months of `year` as `YYYY-MM` (from the current month when it is this year). */
export function proposalMonths(year: number, today: Date): string[] {
  const first = year === today.getFullYear() ? today.getMonth() + 1 : 1;
  const out: string[] = [];
  for (let m = first; m <= 12; m++) {
    out.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

/** DOM id of a month section (the strip scrolls to it). */
export function monthAnchor(month: string): string {
  return `annual-month-${month}`;
}
