import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { SelectedOrgService } from '../org/selected-org.service';
import { AuthService } from './auth.service';

/** Where a member blocked by their org's MFA policy is sent to set up a factor. */
export const MFA_SETUP_URL = '/account/security';

/**
 * Whether the selected org withholds access until this session has a second
 * factor (the org requires MFA of the member and the session did not pass one).
 */
export function selectedOrgRequiresMfa(
  auth: AuthService,
  selectedOrg: SelectedOrgService,
): boolean {
  const orgId = selectedOrg.currentOrgId();
  return !!orgId && auth.orgs()[orgId]?.mfa_required === true;
}

/**
 * Shell child guard: while the selected org's MFA policy blocks the member
 * (the server returns no permissions for that org), every page except the
 * user's own account pages redirects to the two-step verification setup. The
 * server is the real enforcement; this keeps the user on the one page that
 * lets them regain access. After enrolment the session is refreshed, the flag
 * clears and navigation is free again.
 */
export const mfaEnrolmentGuard: CanActivateChildFn = (_route, state) => {
  const auth = inject(AuthService);
  const selectedOrg = inject(SelectedOrgService);
  if (!selectedOrgRequiresMfa(auth, selectedOrg)) {
    return true;
  }
  const path = state.url.split(/[?#]/)[0];
  if (path === '/account' || path.startsWith('/account/')) {
    return true;
  }
  // Platform administration is not org-scoped, so an org policy doesn't gate it.
  if (auth.isSuperuser() && path.startsWith('/admin/')) {
    return true;
  }
  return inject(Router).createUrlTree([MFA_SETUP_URL]);
};
