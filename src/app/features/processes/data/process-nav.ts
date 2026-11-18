import { ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';

/** Sub-pages of Prosesser (app-module-nav under the page header). */
export const PROCESS_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'processes.nav.register', link: '/processes', exact: true },
  { labelKey: 'processes.nav.interactionMap', link: '/processes/interaction-map' },
];
