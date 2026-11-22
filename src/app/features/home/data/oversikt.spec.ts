import { makeHome } from '../../dashboard/data/home.testing';
import { FrameworkStatus, NextAction } from '../../dashboard/data/home.models';
import {
  DeadlineItem,
  actionRefs,
  actionTone,
  barTone,
  dateTile,
  greetingKey,
  isUrgent,
  quickTiles,
  shownStandards,
  summaryKey,
  upcomingDeadlines,
  weekCount,
} from './oversikt';

const t = (key: string) => (key.endsWith('.short') ? key.split('.')[2].toUpperCase() : key);

function action(over: Partial<NextAction> = {}): NextAction {
  return {
    key: 'k',
    kind: 'overdue',
    title_key: 'home:next.overdue.title',
    why_key: 'home:next.overdue.why',
    params: {},
    url: '/tasks/1',
    priority: 0,
    module: null,
    ...over,
  };
}

function deadline(over: Partial<DeadlineItem> = {}): DeadlineItem {
  return {
    entity_id: 'e',
    title: 'T',
    code: null,
    due_at: '2026-11-27T09:00:00',
    url: '/x',
    overdue: false,
    state: 'due_soon',
    label_key: null,
    ...over,
  };
}

describe('oversikt helpers', () => {
  it('greets by the time of day (05–10 / 10–17 / 17–05)', () => {
    expect(greetingKey(5)).toBe('home.oversikt.greeting.morning');
    expect(greetingKey(9)).toBe('home.oversikt.greeting.morning');
    expect(greetingKey(10)).toBe('home.oversikt.greeting.day');
    expect(greetingKey(16)).toBe('home.oversikt.greeting.day');
    expect(greetingKey(17)).toBe('home.oversikt.greeting.evening');
    expect(greetingKey(2)).toBe('home.oversikt.greeting.evening');
  });

  it('counts overdue, due this week and reviews as this week’s work', () => {
    const work = { ...makeHome().my_work, overdue: 1, due_this_week: 2, awaiting_review: 1 };
    expect(weekCount(work)).toBe(4);
    expect(weekCount(null)).toBe(0);
    expect(summaryKey(0).key).toBe('home.oversikt.summary.none');
    expect(summaryKey(1).key).toBe('home.oversikt.summary.one');
    expect(summaryKey(4)).toEqual({ key: 'home.oversikt.summary.many', params: { count: 4 } });
  });

  it('names the top action only when it is high priority', () => {
    expect(isUrgent(action({ priority: 0 }))).toBe(true);
    expect(isUrgent(action({ priority: 3 }))).toBe(false);
    expect(isUrgent(null)).toBe(false);
  });

  it('colours the to-do dot by urgency', () => {
    expect(actionTone(action({ priority: 0, kind: 'overdue' }))).toBe('bad');
    expect(actionTone(action({ priority: 1, kind: 'review' }))).toBe('warn');
    expect(actionTone(action({ priority: 6, kind: 'gap' }))).toBe('info');
  });

  it('derives requirement chips from a gap, or from explicit refs', () => {
    expect(
      actionRefs(action({ kind: 'gap', params: { framework: 'iso27001', number: '9.2' } }), t),
    ).toEqual(['ISO27001 · 9.2']);
    expect(actionRefs(action(), t)).toEqual([]);
    const explicit = { ...action(), requirement_refs: ['gdpr:33'] } as NextAction;
    expect(actionRefs(explicit, t)).toEqual(['GDPR · 33']);
  });

  it('shows the four prototype tiles when the caller can use them', () => {
    const tiles = quickTiles(['suppliers:write', 'documents:draft'], () => true, []);
    expect(tiles.map((q) => q.key)).toEqual(['speakUp', 'supplier', 'policy', 'report']);
    expect(tiles[2].query).toEqual({ type: 'policy' });
  });

  it('replaces a tile the caller cannot use with the next API quick action', () => {
    const tiles = quickTiles([], (m) => m !== 'suppliers', makeHome().quick_actions);
    // Supplier (module off) -> find_document; policy (no permission) -> nothing left.
    // "report_issue" is never used: Meld fra already covers it.
    expect(tiles.map((q) => q.key)).toEqual(['speakUp', 'find_document', 'report']);
    expect(tiles[1].labelKey).toBe('home.quick.find_document');
    expect(tiles[1].path).toBe('/documents');
  });

  it('lists upcoming deadlines soonest first, without overdue ones', () => {
    const list = upcomingDeadlines([
      deadline({ entity_id: 'c', due_at: '2026-12-15T09:00:00' }),
      deadline({ entity_id: 'o', due_at: '2026-11-20T09:00:00', overdue: true }),
      deadline({ entity_id: 'a', due_at: '2026-11-27T09:00:00' }),
      deadline({ entity_id: 'b', due_at: '2026-12-03T09:00:00' }),
      deadline({ entity_id: 'd', due_at: '2026-12-20T09:00:00' }),
    ]);
    expect(list.map((d) => d.entity_id)).toEqual(['a', 'b', 'c']);
  });

  it('formats the date tile in the UI language', () => {
    expect(dateTile('2026-11-27T09:00:00', 'nb')).toEqual({ day: '27', month: 'nov' });
    expect(dateTile('2026-12-03T09:00:00', 'en').day).toBe('03');
    expect(dateTile('garbage', 'nb')).toEqual({ day: '', month: '' });
  });

  it('colours the standard bar green / amber / red', () => {
    expect(barTone(84)).toBe('ok');
    expect(barTone(80)).toBe('ok');
    expect(barTone(62)).toBe('warn');
    expect(barTone(49)).toBe('bad');
  });

  it('shows target standards first and counts the rest', () => {
    const fw = (framework: string, is_target: boolean) =>
      ({ framework, is_target }) as FrameworkStatus;
    const all = [fw('iso9001', true), fw('gdpr', false), fw('iso27001', true)];
    expect(shownStandards(all, false).shown.map((f) => f.framework)).toEqual([
      'iso9001',
      'iso27001',
    ]);
    expect(shownStandards(all, false).hidden).toBe(1);
    expect(shownStandards(all, true).shown).toHaveLength(3);
    expect(shownStandards([fw('gdpr', false)], false).shown).toHaveLength(1);
  });
});
