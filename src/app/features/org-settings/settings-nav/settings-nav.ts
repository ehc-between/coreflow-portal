import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { hasAnyPermission } from '../../../core/auth/permission';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ModuleNav, ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';

/** One tab of the "People and access" settings group, with the permission it needs. */
export interface PeopleNavEntry extends ModuleNavItem {
  readonly permission: string | readonly string[];
}

/**
 * Settings → People and access: members, departments, invitations and roles.
 * Each page carries this tab row under its header.
 */
export const PEOPLE_NAV: readonly PeopleNavEntry[] = [
  {
    labelKey: 'settings.people.nav.members',
    link: '/settings/members',
    permission: 'org:manage',
    testId: 'people-nav-members',
  },
  {
    labelKey: 'settings.people.nav.departments',
    link: '/settings/departments',
    permission: 'org:manage',
    testId: 'people-nav-departments',
  },
  {
    labelKey: 'settings.people.nav.invitations',
    link: '/settings/invitations',
    permission: 'users:invite',
    testId: 'people-nav-invitations',
  },
  {
    labelKey: 'settings.people.nav.roles',
    link: '/settings/roles',
    permission: ['users:invite', 'org:manage', 'audit:read'],
    testId: 'people-nav-roles',
  },
];

/** The tabs the caller may open, in order. */
export function peopleNavFor(granted: readonly string[] | null | undefined): ModuleNavItem[] {
  return PEOPLE_NAV.filter((entry) => hasAnyPermission(granted, entry.permission)).map(
    ({ labelKey, link, testId }) => ({ labelKey, link, testId }),
  );
}

/** The first "People and access" page the caller may open (the hub card target). */
export function peopleLandingFor(granted: readonly string[] | null | undefined): string {
  const first = peopleNavFor(granted)[0];
  return typeof first?.link === 'string' ? first.link : '/settings/members';
}

/** Tab row for the "People and access" settings pages. */
@Component({
  selector: 'app-settings-people-nav',
  imports: [ModuleNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-module-nav labelKey="settings.people.title" [items]="items()" />`,
})
export class SettingsPeopleNav {
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly items = computed(() =>
    peopleNavFor(this.selectedOrg.currentOrg()?.permissions),
  );
}
