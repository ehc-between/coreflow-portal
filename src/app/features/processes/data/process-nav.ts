import { ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';

/** Sub-pages of Prosesser (app-module-nav under the page header). */
export const PROCESS_NAV: readonly ModuleNavItem[] = [
  // IA v2: `/processes` itself redirects to Håndbok; the full register lives at `all`.
  { labelKey: 'processes.nav.register', link: '/processes/all', exact: true },
  { labelKey: 'processes.nav.interactionMap', link: '/processes/interaction-map' },
];
