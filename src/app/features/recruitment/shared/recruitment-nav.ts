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
export const RECRUITMENT_SETTINGS_LINK = '/recruitment/settings';

/** Sub-pages of the module (`app-module-nav` under every page header). */
export function recruitmentNavItems(manage: boolean): readonly ModuleNavItem[] {
  const items: ModuleNavItem[] = [
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
  if (manage) {
    items.push({
      labelKey: 'recruitment.nav.settings',
      link: '/recruitment/settings',
      testId: 'nav-settings',
    });
  }
  return items;
}

/** The nav items as a signal of the caller's permissions (call in an injection context). */
export function injectRecruitmentNav(
  perms: Signal<RecruitmentPerms>,
): Signal<readonly ModuleNavItem[]> {
  return computed(() => recruitmentNavItems(perms().manage));
}

/** The gear link for managers, else none. */
export function settingsLinkFor(perms: RecruitmentPerms): string | null {
  return perms.manage ? RECRUITMENT_SETTINGS_LINK : null;
}
