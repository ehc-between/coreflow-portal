import en from '../../../../assets/i18n/annual/en.json';
import nb from '../../../../assets/i18n/annual/nb.json';
import { expectKeyParity } from '../../../../testing/i18n-parity';
import {
  MAX_DOTS,
  groupByMonth,
  monthDots,
  monthHeading,
  proposalMonths,
  proposalYear,
  shortMonth,
  statusLabel,
} from './annual-cycle.logic';
import { ACTION_LABELS, ITEM_AREAS, RECURRENCES, YearItem, YearMonth } from './annual-cycle.models';

function item(overrides: Partial<YearItem>): YearItem {
  return {
    id: 'due:task:1',
    source: 'due',
    entity_type: 'task',
    entity_id: '1',
    title: 'Item',
    code: null,
    area: 'annual',
    module: 'tasks',
    kind: 'due',
    month: '2026-11',
    due_at: '2026-11-20T00:00:00',
    days: 5,
    recurrence: null,
    owner_name: null,
    status: 'soon',
    detail: null,
    action: { kind: 'open', label_key: 'annual.actions.open', url: '/tasks/1' },
    requirement_refs: [],
    ...overrides,
  };
}

const month = (m: string, counts: Partial<YearMonth['counts']> = {}): YearMonth => ({
  month: m,
  counts: { overdue: 0, soon: 0, planned: 0, not_planned: 0, recurring: 0, ...counts },
});

describe('annual cycle logic', () => {
  it('puts the most urgent dots first and caps them', () => {
    expect(monthDots(month('2026-11', { planned: 1, overdue: 2, recurring: 1 }))).toEqual([
      'bad',
      'bad',
      'info',
      'ok',
    ]);
    expect(monthDots(month('2026-12', { planned: 20 }))).toHaveLength(MAX_DOTS);
  });

  it('groups by month in window order and skips empty months', () => {
    const groups = groupByMonth(
      [month('2026-11'), month('2026-12'), month('2027-01')],
      [item({ id: 'a', month: '2027-01' }), item({ id: 'b', month: '2026-11' })],
    );
    expect(groups.map((g) => g.month)).toEqual(['2026-11', '2027-01']);
  });

  it('words the status pill', () => {
    expect(statusLabel(item({ status: 'soon', days: 5 }))).toEqual({
      key: 'annual.status.days',
      params: { days: 5 },
    });
    expect(statusLabel(item({ status: 'soon', days: 1 })).key).toBe('annual.status.daysOne');
    expect(statusLabel(item({ status: 'soon', days: 0 })).key).toBe('annual.status.today');
    expect(statusLabel(item({ status: 'overdue' })).key).toBe('annual.status.overdue');
    expect(statusLabel(item({ status: 'not_planned' })).key).toBe('annual.status.notPlanned');
    expect(statusLabel(item({ status: 'recurring' })).key).toBe('annual.status.planned');
  });

  it('formats months like the prototype', () => {
    expect(shortMonth('2026-11', 'nb-NO')).toBe('nov');
    expect(monthHeading('2026-11', 'nb-NO', 2026)).toBe('November');
    expect(monthHeading('2027-01', 'nb-NO', 2026)).toBe('Januar 2027');
  });

  it('proposes next year from November and lists the remaining months', () => {
    expect(proposalYear(new Date(2026, 10, 22))).toBe(2027);
    expect(proposalYear(new Date(2026, 5, 1))).toBeNull();
    expect(proposalMonths(2026, new Date(2026, 9, 3))).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(proposalMonths(2027, new Date(2026, 10, 1))).toHaveLength(12);
  });
});

describe('annual i18n', () => {
  it('keeps en/nb at parity', () => expectKeyParity(en, nb));

  it('has a label for every area, recurrence and action', () => {
    for (const file of [en, nb]) {
      for (const a of ITEM_AREAS) {
        expect((file.areas as Record<string, string>)[a]).toBeTruthy();
      }
      for (const r of RECURRENCES) {
        expect((file.recurrence as Record<string, string>)[r]).toBeTruthy();
      }
      for (const k of ACTION_LABELS) {
        expect((file.actions as Record<string, string>)[k]).toBeTruthy();
      }
    }
  });

  it('uses the prototype wording', () => {
    expect(nb.title).toBe('Årshjul');
    expect(nb.intro).toBe(
      'Alt som skal skje jevnlig, samlet på ett sted. Vi sier fra i god tid før fristen.',
    );
    expect(nb.proposeFor).toBe('Foreslå årshjul for {{year}}');
    expect(nb.status.overdue).toBe('Forfalt');
    expect(nb.status.notPlanned).toBe('Ikke planlagt');
  });
});
