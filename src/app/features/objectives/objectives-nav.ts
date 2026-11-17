import { Breadcrumb } from '../../shared/ui/page-header/page-header';
import { ModuleNavItem } from '../../shared/ui/module-nav/module-nav';

/** The module's sub-navigation, directly under the page header (replaces the old tabs). */
export const OBJECTIVES_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'objectives.nav.objectives', link: '/objectives', exact: true },
  { labelKey: 'objectives.nav.kpis', link: '/objectives/kpis' },
];

/** First breadcrumb of every page in the module (= nav label = module h1). */
export const OBJECTIVES_ROOT_CRUMB: Breadcrumb = {
  labelKey: 'modules.names.objectives',
  link: '/objectives',
};

export const KPIS_CRUMB: Breadcrumb = {
  labelKey: 'objectives.nav.kpis',
  link: '/objectives/kpis',
};
