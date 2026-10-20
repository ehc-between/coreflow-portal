import { KpiTone } from '../../shared/ui/kpi-tile/kpi-tile';
import { DeviationStats, StatsMonthCount } from '../../core/deviations/deviation.models';

/**
 * The load state of one dashboard data source. `hidden` means the user lacks
 * the permission for it (the source is never requested and its tiles are not
 * rendered).
 */
export type Loadable<T> =
  | { readonly state: 'hidden' }
  | { readonly state: 'loading' }
  | { readonly state: 'error' }
  | { readonly state: 'ready'; readonly value: T };

export const HIDDEN: Loadable<never> = { state: 'hidden' };
export const LOADING: Loadable<never> = { state: 'loading' };
export const FAILED: Loadable<never> = { state: 'error' };

export function ready<T>(value: T): Loadable<T> {
  return { state: 'ready', value };
}

/** Everything the dashboard tiles are assembled from. */
export interface DashboardSources {
  /** `GET deviations/stats` (needs `deviations:read`). */
  readonly stats: Loadable<DeviationStats>;
  /** Count of pending AI proposals (needs `documents:approve`). */
  readonly pendingProposals: Loadable<number>;
  /** Count of documents with status `in_review` (needs `documents:read`). */
  readonly documentsInReview: Loadable<number>;
}

/** A single rendered KPI tile: its value (null while loading/failed) and drill-down link. */
export interface DashboardTile {
  readonly id: string;
  readonly labelKey: string;
  readonly state: 'loading' | 'error' | 'ready';
  readonly value: number | null;
  readonly tone: KpiTone;
  /** Router link the tile navigates to (the filtered list behind the number). */
  readonly link: string;
  readonly queryParams?: Readonly<Record<string, string>>;
}

function tile(
  source: Loadable<unknown>,
  base: Omit<DashboardTile, 'state' | 'value' | 'tone'>,
  value: () => number,
  tone: (value: number) => KpiTone,
): DashboardTile | null {
  switch (source.state) {
    case 'hidden':
      return null;
    case 'loading':
      return { ...base, state: 'loading', value: null, tone: 'neutral' };
    case 'error':
      return { ...base, state: 'error', value: null, tone: 'neutral' };
    case 'ready': {
      const v = value();
      return { ...base, state: 'ready', value: v, tone: tone(v) };
    }
  }
}

/** Non-zero counts that need attention render red; zero falls back to neutral. */
const alertTone = (v: number): KpiTone => (v > 0 ? 'fail' : 'neutral');
/** Queues awaiting action render amber when non-empty. */
const queueTone = (v: number): KpiTone => (v > 0 ? 'warn' : 'neutral');

/**
 * Assembles the dashboard KPI tiles from the loaded sources. Sources the user
 * may not see (`hidden`) produce no tiles; loading / failed sources produce a
 * tile without a value so the grid keeps its shape. Every tile links to the
 * list behind its number.
 */
export function buildDashboardTiles(sources: DashboardSources): readonly DashboardTile[] {
  const { stats, pendingProposals, documentsInReview } = sources;
  const statsValue = (pick: (s: DeviationStats) => number) => () =>
    stats.state === 'ready' ? pick(stats.value) : 0;

  const tiles: (DashboardTile | null)[] = [
    tile(
      stats,
      { id: 'openDeviations', labelKey: 'dashboard.tiles.openDeviations', link: '/deviations' },
      statsValue((s) => s.open),
      (v) => (v > 0 ? 'accent' : 'neutral'),
    ),
    tile(
      stats,
      {
        id: 'overdueDeviations',
        labelKey: 'dashboard.tiles.overdueDeviations',
        link: '/deviations',
        // No server-side "overdue" filter yet: soonest-due first surfaces them.
        queryParams: { sort: 'due_at' },
      },
      statsValue((s) => s.overdue),
      alertTone,
    ),
    tile(
      stats,
      { id: 'openActions', labelKey: 'dashboard.tiles.openActions', link: '/deviations/stats' },
      statsValue((s) => s.open_actions),
      (v) => (v > 0 ? 'info' : 'neutral'),
    ),
    tile(
      stats,
      {
        id: 'overdueActions',
        labelKey: 'dashboard.tiles.overdueActions',
        link: '/deviations/stats',
      },
      statsValue((s) => s.overdue_actions),
      alertTone,
    ),
    tile(
      pendingProposals,
      { id: 'pendingProposals', labelKey: 'dashboard.tiles.pendingProposals', link: '/review' },
      () => (pendingProposals.state === 'ready' ? pendingProposals.value : 0),
      queueTone,
    ),
    tile(
      documentsInReview,
      {
        id: 'documentsInReview',
        labelKey: 'dashboard.tiles.documentsInReview',
        link: '/documents',
        queryParams: { status: 'in_review' },
      },
      () => (documentsInReview.state === 'ready' ? documentsInReview.value : 0),
      queueTone,
    ),
  ];
  return tiles.filter((t): t is DashboardTile => t !== null);
}

/** `YYYY-MM` for a date's month (local time). */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The trailing `months` calendar months ending with `now`'s month, oldest
 * first, with counts taken from `series` and gaps (months without deviations,
 * which the backend omits) filled with zero.
 */
export function recentMonths(
  series: readonly StatsMonthCount[],
  months: number,
  now: Date = new Date(),
): readonly StatsMonthCount[] {
  const counts = new Map(series.map((p) => [p.month, p.count]));
  const result: StatsMonthCount[] = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const month = monthKey(new Date(now.getFullYear(), now.getMonth() - offset, 1));
    result.push({ month, count: counts.get(month) ?? 0 });
  }
  return result;
}
