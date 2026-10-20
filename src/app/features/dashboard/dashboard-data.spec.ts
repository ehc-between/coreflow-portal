import { DeviationStats } from '../../core/deviations/deviation.models';
import {
  FAILED,
  HIDDEN,
  LOADING,
  buildDashboardTiles,
  monthKey,
  ready,
  recentMonths,
} from './dashboard-data';

function stats(overrides: Partial<DeviationStats> = {}): DeviationStats {
  return {
    total: 10,
    open: 4,
    closed: 6,
    overdue: 2,
    by_status: {
      open: 2,
      investigating: 1,
      action: 1,
      verification: 0,
      closed: 6,
      cancelled: 0,
    },
    by_type: [],
    by_standard: {},
    by_severity: { low: 3, medium: 4, high: 2, critical: 1 },
    by_department: {},
    by_clause: [],
    opened_over_time: [],
    open_actions: 5,
    overdue_actions: 0,
    ...overrides,
  };
}

describe('buildDashboardTiles', () => {
  it('builds all six tiles from ready sources with values, tones and links', () => {
    const tiles = buildDashboardTiles({
      stats: ready(stats()),
      pendingProposals: ready(3),
      documentsInReview: ready(0),
    });

    expect(tiles.map((t) => [t.id, t.value, t.tone])).toEqual([
      ['openDeviations', 4, 'accent'],
      ['overdueDeviations', 2, 'fail'],
      ['openActions', 5, 'info'],
      ['overdueActions', 0, 'neutral'],
      ['pendingProposals', 3, 'warn'],
      ['documentsInReview', 0, 'neutral'],
    ]);
    expect(tiles.every((t) => t.state === 'ready')).toBe(true);

    const docs = tiles.find((t) => t.id === 'documentsInReview');
    expect(docs?.link).toBe('/documents');
    expect(docs?.queryParams).toEqual({ status: 'in_review' });
    expect(tiles.find((t) => t.id === 'pendingProposals')?.link).toBe('/review');
    expect(tiles.find((t) => t.id === 'openDeviations')?.link).toBe('/deviations');
  });

  it('drills each stats tile into the exact filtered list behind its number', () => {
    const tiles = buildDashboardTiles({
      stats: ready(stats()),
      pendingProposals: HIDDEN,
      documentsInReview: HIDDEN,
    });
    const target = (id: string) => {
      const t = tiles.find((tile) => tile.id === id);
      return [t?.link, t?.queryParams];
    };
    expect(target('openDeviations')).toEqual(['/deviations', { active: 'true' }]);
    expect(target('overdueDeviations')).toEqual([
      '/deviations',
      { overdue: 'true', sort: 'due_at' },
    ]);
    expect(target('openActions')).toEqual(['/deviations/actions', undefined]);
    expect(target('overdueActions')).toEqual(['/deviations/actions', { overdue: 'true' }]);
  });

  it('omits tiles for sources the user may not see', () => {
    const tiles = buildDashboardTiles({
      stats: HIDDEN,
      pendingProposals: HIDDEN,
      documentsInReview: ready(7),
    });
    expect(tiles.map((t) => t.id)).toEqual(['documentsInReview']);
  });

  it('returns no tiles when every source is hidden', () => {
    expect(
      buildDashboardTiles({ stats: HIDDEN, pendingProposals: HIDDEN, documentsInReview: HIDDEN }),
    ).toEqual([]);
  });

  it('keeps loading and failed sources as value-less tiles', () => {
    const tiles = buildDashboardTiles({
      stats: LOADING,
      pendingProposals: FAILED,
      documentsInReview: HIDDEN,
    });
    expect(tiles).toHaveLength(5);
    expect(tiles.slice(0, 4).every((t) => t.state === 'loading' && t.value === null)).toBe(true);
    expect(tiles[4]).toMatchObject({ id: 'pendingProposals', state: 'error', value: null });
  });
});

describe('recentMonths', () => {
  it('returns the trailing months oldest-first, filling gaps with zero', () => {
    const now = new Date(2026, 9, 19); // October 2026
    const result = recentMonths(
      [
        { month: '2026-01', count: 9 }, // outside the window
        { month: '2026-08', count: 2 },
        { month: '2026-10', count: 5 },
      ],
      4,
      now,
    );
    expect(result).toEqual([
      { month: '2026-07', count: 0 },
      { month: '2026-08', count: 2 },
      { month: '2026-09', count: 0 },
      { month: '2026-10', count: 5 },
    ]);
  });

  it('crosses year boundaries', () => {
    const result = recentMonths([], 3, new Date(2026, 0, 15));
    expect(result.map((p) => p.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('formats month keys with zero padding', () => {
    expect(monthKey(new Date(2026, 2, 1))).toBe('2026-03');
  });
});
