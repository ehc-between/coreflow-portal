import { Breadcrumb } from '../../shared/ui/page-header/page-header';
import { ModuleNavItem } from '../../shared/ui/module-nav/module-nav';

/** Sub-pages of the contracts module (`app-module-nav` under every page header). */
export const CONTRACTS_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'contracts.nav.register', link: '/contracts', exact: true, testId: 'nav-register' },
  { labelKey: 'contracts.nav.deadlines', link: '/contracts/deadlines', testId: 'nav-deadlines' },
];

/** The module root crumb: the nav label (`modules.names.contracts`). */
export const CONTRACTS_CRUMB: Breadcrumb = {
  labelKey: 'modules.names.contracts',
  link: '/contracts',
};

/** The gear on the module's page headers (shown to holders of `contracts:manage`). */
export const CONTRACTS_SETTINGS_LINK = '/settings/modules/contracts';
