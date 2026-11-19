import { Signal, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ModuleNavItem } from '../../shared/ui/module-nav/module-nav';
import { REGISTERS, REGISTER_LIST, RegisterKey } from './data/privacy-registers';

/** The permissions of the signed-in user in the current org (reactive). */
export function privacyPermissions() {
  const selectedOrg = inject(SelectedOrgService);
  return computed<ReadonlySet<string>>(() => new Set(selectedOrg.currentOrg()?.permissions ?? []));
}

/**
 * U32: the work tabs that hold two registers each. The tab opens the first register the
 * user may read (or the one being viewed); the list pages switch between the two
 * (`app-privacy-group-switch`).
 */
export const PRIVACY_TAB_GROUPS: readonly {
  readonly key: 'processors' | 'incidents';
  readonly registers: readonly RegisterKey[];
}[] = [
  { key: 'processors', registers: ['processor', 'transfer'] },
  { key: 'incidents', registers: ['breach', 'dsr'] },
];

/** The registers that have their own work tab; the rest sit under "Flere registre". */
const IN_TABS: ReadonlySet<RegisterKey> = new Set([
  'ropa',
  ...PRIVACY_TAB_GROUPS.flatMap((g) => g.registers),
]);

/**
 * The sub-pages of the privacy area (`app-module-nav` under every page header), U32:
 * four work tabs (Oversikt · Behandlinger · Databehandlere og overføringer · Hendelser og
 * henvendelser), then every other register the user may read and "Dokumenter og
 * rapporter" under "Flere registre". Requests and consents need `privacy:requests`; the
 * settings sit behind the gear in the page header.
 */
export function privacyNavItems(perms: Signal<ReadonlySet<string>>): Signal<ModuleNavItem[]> {
  const router = inject(Router);
  const url = toSignal(
    router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => router.url),
    ),
    { initialValue: router.url },
  );
  return computed(() => {
    const readable = (key: RegisterKey) => perms().has(REGISTERS[key].readPermission);
    const segment = url().split(/[?#]/)[0].split('/')[2] ?? '';
    const items: ModuleNavItem[] = [
      { labelKey: 'privacy.nav.overview', link: '/privacy', exact: true, testId: 'nav-overview' },
    ];
    if (readable('ropa')) {
      items.push({
        labelKey: 'privacy.nav.groups.ropa',
        link: ['/privacy', REGISTERS.ropa.segment],
        testId: 'privacy-nav-ropa',
      });
    }
    for (const group of PRIVACY_TAB_GROUPS) {
      const keys = group.registers.filter(readable);
      if (!keys.length) {
        continue;
      }
      const current = keys.find((k) => REGISTERS[k].segment === segment) ?? keys[0];
      items.push({
        labelKey: `privacy.nav.groups.${group.key}`,
        link: ['/privacy', REGISTERS[current].segment],
        testId: `privacy-nav-${group.key}`,
      });
    }
    items.push(
      ...REGISTER_LIST.filter((r) => !IN_TABS.has(r.key) && readable(r.key)).map((r) => ({
        labelKey: `privacy.nav.${r.key}`,
        link: ['/privacy', r.segment],
        testId: `privacy-nav-${r.key}`,
      })),
      {
        labelKey: 'privacy.nav.documents',
        link: '/privacy/documents',
        testId: 'privacy-nav-documents',
      },
    );
    return items;
  });
}
