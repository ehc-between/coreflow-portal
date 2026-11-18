import { Signal, computed, inject } from '@angular/core';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ModuleNavItem } from '../../shared/ui/module-nav/module-nav';
import { REGISTER_LIST } from './data/privacy-registers';

/** The permissions of the signed-in user in the current org (reactive). */
export function privacyPermissions() {
  const selectedOrg = inject(SelectedOrgService);
  return computed<ReadonlySet<string>>(() => new Set(selectedOrg.currentOrg()?.permissions ?? []));
}

/**
 * The sub-pages of the privacy area (`app-module-nav` under every page header): the
 * overview and every register the user may read (requests and consents need
 * `privacy:requests`). Labels are the short register names (`privacy.nav.<key>`); the
 * settings sit behind the gear in the page header.
 */
export function privacyNavItems(perms: Signal<ReadonlySet<string>>): Signal<ModuleNavItem[]> {
  return computed(() => {
    const items: ModuleNavItem[] = [
      { labelKey: 'privacy.nav.overview', link: '/privacy', exact: true, testId: 'nav-overview' },
      ...REGISTER_LIST.filter((r) => perms().has(r.readPermission)).map((r) => ({
        labelKey: `privacy.nav.${r.key}`,
        link: ['/privacy', r.segment],
        testId: `privacy-nav-${r.key}`,
      })),
    ];
    return items;
  });
}
