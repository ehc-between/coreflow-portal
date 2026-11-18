import { ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';

/** Counts shown on the sub-page tabs (unset or 0 shows none). */
export interface AssetsNavCounts {
  readonly calibrationDue?: number | null;
  readonly openReviews?: number | null;
  readonly openChanges?: number | null;
}

/**
 * The assets module's sub-pages for `app-module-nav`: the register, calibration of
 * measuring equipment, access reviews and change requests.
 */
export function assetsNav(counts: AssetsNavCounts = {}): readonly ModuleNavItem[] {
  const count = (n: number | null | undefined) => (n ? { count: n } : {});
  return [
    { labelKey: 'assets.nav.inventory', link: '/assets', exact: true },
    {
      labelKey: 'assets.nav.calibration',
      link: '/assets/calibration',
      exact: true,
      ...count(counts.calibrationDue),
    },
    {
      labelKey: 'assets.nav.accessReviews',
      link: '/assets/access-reviews',
      ...count(counts.openReviews),
    },
    { labelKey: 'assets.nav.changes', link: '/assets/changes', ...count(counts.openChanges) },
  ];
}
