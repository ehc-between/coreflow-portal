import { Signal, computed } from '@angular/core';
import { ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';
import { Breadcrumb } from '../../../shared/ui/page-header/page-header';
import { RecruitmentPerms } from './recruitment-perms';

/** The module root crumb: the nav label (`modules.names.recruitment`). */
export const RECRUITMENT_CRUMB: Breadcrumb = {
  labelKey: 'modules.names.recruitment',
  link: '/recruitment',
};

/** The gear on the module's page headers (shown to holders of `recruitment:manage`). */
export const RECRUITMENT_SETTINGS_LINK = '/settings/modules/recruitment';

/**
 * Sub-pages of the module (`app-module-nav` under every page header). The settings
 * are configuration (U10): managers reach them through the gear, not a tab.
 */
export function recruitmentNavItems(): readonly ModuleNavItem[] {
  return [
    {
      labelKey: 'recruitment.nav.overview',
      link: '/recruitment',
      exact: true,
      testId: 'nav-overview',
    },
    {
      labelKey: 'recruitment.nav.requisitions',
      link: '/recruitment/requisitions',
      testId: 'nav-requisitions',
    },
    {
      labelKey: 'recruitment.nav.applications',
      link: '/recruitment/applications',
      testId: 'nav-applications',
    },
    {
      labelKey: 'recruitment.nav.candidates',
      link: '/recruitment/candidates',
      testId: 'nav-candidates',
    },
  ];
}

/** The nav items as a signal (the same for every reader since the settings tab left, U10). */
export function injectRecruitmentNav(): Signal<readonly ModuleNavItem[]> {
  return computed(() => recruitmentNavItems());
}

/** The gear link for managers, else none. */
export function settingsLinkFor(perms: RecruitmentPerms): string | null {
  return perms.manage ? RECRUITMENT_SETTINGS_LINK : null;
}
