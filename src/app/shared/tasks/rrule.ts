/**
 * The RRULE subset the backend accepts (coreflow-core `app/platform/tasks/rrule.py`):
 * FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY (weekly), BYMONTHDAY (monthly /
 * yearly), BYMONTH (yearly), and COUNT or UNTIL=YYYYMMDD. An optional `RRULE:`
 * prefix is accepted; keys are case-insensitive.
 */

export type RruleFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export const RRULE_FREQS: readonly RruleFreq[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
export const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export type RruleEnd =
  | { readonly type: 'never' }
  | { readonly type: 'count'; readonly count: number }
  /** `until` is a calendar day, `YYYY-MM-DD`. */
  | { readonly type: 'until'; readonly until: string };

export interface RecurrenceRule {
  readonly freq: RruleFreq;
  readonly interval: number;
  readonly byDay: readonly Weekday[];
  readonly byMonthDay: number | null;
  readonly byMonth: number | null;
  readonly end: RruleEnd;
}

export const DEFAULT_RULE: RecurrenceRule = {
  freq: 'MONTHLY',
  interval: 1,
  byDay: [],
  byMonthDay: null,
  byMonth: null,
  end: { type: 'never' },
};

function int(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

/** Parse a rule string into its parts; null when it falls outside the supported subset. */
export function parseRrule(raw: string | null | undefined): RecurrenceRule | null {
  if (!raw) {
    return null;
  }
  const text = raw
    .trim()
    .toUpperCase()
    .replace(/^RRULE:/, '');
  if (!text) {
    return null;
  }
  const parts = new Map<string, string>();
  for (const part of text.split(';')) {
    if (!part) {
      continue;
    }
    const [key, value, ...rest] = part.split('=');
    if (!key || value === undefined || rest.length > 0 || parts.has(key)) {
      return null;
    }
    parts.set(key, value);
  }

  const freq = parts.get('FREQ') as RruleFreq | undefined;
  if (!freq || !RRULE_FREQS.includes(freq)) {
    return null;
  }
  let interval = 1;
  let byDay: Weekday[] = [];
  let byMonthDay: number | null = null;
  let byMonth: number | null = null;
  let end: RruleEnd = { type: 'never' };

  for (const [key, value] of parts) {
    switch (key) {
      case 'FREQ':
        break;
      case 'INTERVAL': {
        const n = int(value, 1, 1000);
        if (n === null) {
          return null;
        }
        interval = n;
        break;
      }
      case 'BYDAY': {
        if (freq !== 'WEEKLY') {
          return null;
        }
        const days = value.split(',');
        if (days.some((d) => !WEEKDAYS.includes(d as Weekday))) {
          return null;
        }
        byDay = WEEKDAYS.filter((d) => days.includes(d));
        break;
      }
      case 'BYMONTHDAY': {
        if (freq !== 'MONTHLY' && freq !== 'YEARLY') {
          return null;
        }
        byMonthDay = int(value, 1, 31);
        if (byMonthDay === null) {
          return null;
        }
        break;
      }
      case 'BYMONTH': {
        if (freq !== 'YEARLY') {
          return null;
        }
        byMonth = int(value, 1, 12);
        if (byMonth === null) {
          return null;
        }
        break;
      }
      case 'COUNT': {
        const n = int(value, 1, 10000);
        if (n === null || end.type !== 'never') {
          return null;
        }
        end = { type: 'count', count: n };
        break;
      }
      case 'UNTIL': {
        const m = value.match(/^(\d{4})(\d{2})(\d{2})(T\d{6}Z?)?$/);
        if (!m || end.type !== 'never') {
          return null;
        }
        end = { type: 'until', until: `${m[1]}-${m[2]}-${m[3]}` };
        break;
      }
      default:
        return null;
    }
  }
  return { freq, interval, byDay, byMonthDay, byMonth, end };
}

/** Serialise a rule (no `RRULE:` prefix), omitting defaults and parts the frequency ignores. */
export function buildRrule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) {
    parts.push(`INTERVAL=${Math.floor(rule.interval)}`);
  }
  if (rule.freq === 'WEEKLY' && rule.byDay.length > 0) {
    parts.push(`BYDAY=${WEEKDAYS.filter((d) => rule.byDay.includes(d)).join(',')}`);
  }
  if (rule.freq === 'YEARLY' && rule.byMonth !== null) {
    parts.push(`BYMONTH=${rule.byMonth}`);
  }
  if ((rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') && rule.byMonthDay !== null) {
    parts.push(`BYMONTHDAY=${rule.byMonthDay}`);
  }
  if (rule.end.type === 'count') {
    parts.push(`COUNT=${Math.max(1, Math.floor(rule.end.count))}`);
  } else if (rule.end.type === 'until' && /^\d{4}-\d{2}-\d{2}$/.test(rule.end.until)) {
    parts.push(`UNTIL=${rule.end.until.replaceAll('-', '')}`);
  }
  return parts.join(';');
}

/** One translatable fragment of a rule summary (key in the `tasks` scope + params). */
export interface RuleFragment {
  readonly key: string;
  readonly params?: Record<string, unknown>;
}

/**
 * A human summary of a rule as separate fragments (frequency, details, end), each a
 * translation key with params. Weekday / month names are passed as keys so the
 * caller translates them in the active language. Null for an unsupported rule.
 */
export function describeRrule(raw: string | null | undefined): readonly RuleFragment[] | null {
  const rule = parseRrule(raw);
  if (!rule) {
    return null;
  }
  const freq = rule.freq.toLowerCase();
  const fragments: RuleFragment[] = [
    rule.interval === 1
      ? { key: `tasks.rrule.summary.${freq}One` }
      : { key: `tasks.rrule.summary.${freq}`, params: { count: rule.interval } },
  ];
  if (rule.freq === 'WEEKLY' && rule.byDay.length > 0) {
    fragments.push({
      key: 'tasks.rrule.summary.onDays',
      params: { days: rule.byDay.map((d) => `tasks.rrule.weekdays.${d}`) },
    });
  }
  if (rule.freq === 'YEARLY' && rule.byMonth !== null) {
    fragments.push({
      key: 'tasks.rrule.summary.inMonth',
      params: { month: `tasks.rrule.months.${rule.byMonth}` },
    });
  }
  if (rule.byMonthDay !== null) {
    fragments.push({ key: 'tasks.rrule.summary.onMonthDay', params: { day: rule.byMonthDay } });
  }
  if (rule.end.type === 'count') {
    fragments.push({ key: 'tasks.rrule.summary.count', params: { count: rule.end.count } });
  } else if (rule.end.type === 'until') {
    fragments.push({ key: 'tasks.rrule.summary.until', params: { date: rule.end.until } });
  }
  return fragments;
}
