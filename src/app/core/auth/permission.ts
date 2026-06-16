import { inject } from '@angular/core';
import { SelectedOrgService } from '../org/selected-org.service';
import { AuthService } from './auth.service';

/**
 * Whether the current user holds `permission`. When `orgId` is given the check
 * is scoped to that org; otherwise it is scoped to the user's currently selected
 * org. Must be called within an injection context (or after the services are
 * resolved) — reads reactive AuthService / SelectedOrgService state.
 */
export function hasPermission(permission: string, orgId?: string): boolean {
  if (orgId === undefined) {
    const selectedOrg = inject(SelectedOrgService);
    return (selectedOrg.currentOrg()?.permissions ?? []).includes(permission);
  }
  const auth = inject(AuthService);
  return (auth.orgs()[orgId]?.permissions ?? []).includes(permission);
}
