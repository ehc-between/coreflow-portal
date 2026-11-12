import { DEFAULT_RULE, buildRrule, describeRrule, parseRrule } from './rrule';

describe('parseRrule', () => {
  it('parses the supported subset, case-insensitively and with a prefix', () => {
    expect(parseRrule('rrule:freq=weekly;interval=2;byday=we,mo;count=10')).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      byDay: ['MO', 'WE'],
      byMonthDay: null,
      byMonth: null,
      end: { type: 'count', count: 10 },
    });
    expect(parseRrule('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=31;UNTIL=20301231')).toEqual({
      freq: 'YEARLY',
      interval: 1,
      byDay: [],
      byMonthDay: 31,
      byMonth: 3,
      end: { type: 'until', until: '2030-12-31' },
    });
  });

  it.each([
    '',
    'FREQ=HOURLY',
    'INTERVAL=2',
    'FREQ=DAILY;BYDAY=MO',
    'FREQ=WEEKLY;BYMONTHDAY=3',
    'FREQ=MONTHLY;BYMONTH=2',
    'FREQ=MONTHLY;BYMONTHDAY=32',
    'FREQ=DAILY;COUNT=3;UNTIL=20300101',
    'FREQ=DAILY;INTERVAL=0',
    'FREQ=DAILY;FOO=1',
    'FREQ=DAILY;FREQ=WEEKLY',
  ])('rejects %s', (rule) => {
    expect(parseRrule(rule)).toBeNull();
  });
});

describe('buildRrule', () => {
  it('round-trips a parsed rule', () => {
    for (const rule of [
      'FREQ=DAILY',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR',
      'FREQ=MONTHLY;BYMONTHDAY=15;COUNT=12',
      'FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=1;UNTIL=20301231',
    ]) {
      expect(buildRrule(parseRrule(rule)!)).toBe(rule);
    }
  });

  it('drops parts the frequency ignores', () => {
    expect(buildRrule({ ...DEFAULT_RULE, freq: 'DAILY', byDay: ['MO'], byMonthDay: 3 })).toBe(
      'FREQ=DAILY',
    );
    expect(buildRrule({ ...DEFAULT_RULE, freq: 'MONTHLY', byMonth: 4 })).toBe('FREQ=MONTHLY');
  });
});

describe('describeRrule', () => {
  it('describes frequency, details and end as fragments', () => {
    expect(describeRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5')).toEqual([
      { key: 'tasks.rrule.summary.weekly', params: { count: 2 } },
      {
        key: 'tasks.rrule.summary.onDays',
        params: { days: ['tasks.rrule.weekdays.MO', 'tasks.rrule.weekdays.WE'] },
      },
      { key: 'tasks.rrule.summary.count', params: { count: 5 } },
    ]);
    expect(describeRrule('FREQ=YEARLY;BYMONTH=3;UNTIL=20301231')).toEqual([
      { key: 'tasks.rrule.summary.yearlyOne' },
      { key: 'tasks.rrule.summary.inMonth', params: { month: 'tasks.rrule.months.3' } },
      { key: 'tasks.rrule.summary.until', params: { date: '2030-12-31' } },
    ]);
  });

  it('returns null for an unsupported rule', () => {
    expect(describeRrule('FREQ=SECONDLY')).toBeNull();
  });
});
