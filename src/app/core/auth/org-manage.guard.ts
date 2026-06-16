import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { SelectedOrgService } from '../org/selected-org.service';
import { AuthService } from './auth.service';

const MANAGE_PERMISSION = 'org:manage';

/**
 * Guards the org-settings area. Allows navigation only for an authenticated user
 * holding `org:manage` in their currently selected org. When no session is
 * present (e.g. the access token was lost on a full reload) a silent refresh is
 * attempted first; an authenticated user without the permission is sent to the
 * dashboard, an unauthenticated one to the login page.
 */
export const orgManageGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const selectedOrg = inject(SelectedOrgService);
  const router = inject(Router);

  // Captured-reference signal read (not the inject()-based hasPermission helper),
  // so it stays valid inside the async restoreSession callback below.
  const canManage = () => (selectedOrg.currentOrg()?.permissions ?? []).includes(MANAGE_PERMISSION);

  if (auth.isAuthenticated()) {
    return canManage() || router.createUrlTree(['/dashboard']);
  }

  return auth.restoreSession().pipe(
    map(() => {
      if (!auth.isAuthenticated()) {
        return router.createUrlTree(['/login']);
      }
      return canManage() || router.createUrlTree(['/dashboard']);
    }),
  );
};
