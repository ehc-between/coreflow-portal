import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { SelectedOrgService } from '../org/selected-org.service';
import { AuthService } from './auth.service';
import { hasAnyPermission } from './permission';

/**
 * Builds a guard that allows navigation only for an authenticated user holding
 * ANY of `permissions` in their currently selected org. When no session is
 * present (e.g. the access token was lost on a full reload) a silent refresh is
 * attempted first; an authenticated user without the permission is sent to the
 * dashboard, an unauthenticated one to the login page.
 */
export function anyOrgPermissionGuard(...permissions: readonly string[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const selectedOrg = inject(SelectedOrgService);
    const router = inject(Router);

    // Captured-reference signal read (not the inject()-based hasPermission helper),
    // so it stays valid inside the async restoreSession callback below.
    const allowed = () => hasAnyPermission(selectedOrg.currentOrg()?.permissions, permissions);

    if (auth.isAuthenticated()) {
      return allowed() || router.createUrlTree(['/dashboard']);
    }

    return auth.restoreSession().pipe(
      map(() => {
        if (!auth.isAuthenticated()) {
          return router.createUrlTree(['/login']);
        }
        return allowed() || router.createUrlTree(['/dashboard']);
      }),
    );
  };
}

/** Org-settings management surfaces (departments, members): requires `org:manage`. */
export const orgManageGuard: CanActivateFn = anyOrgPermissionGuard('org:manage');

/** The Settings area: reachable with `org:manage` OR `users:invite` (invitations only). */
export const settingsGuard: CanActivateFn = anyOrgPermissionGuard('org:manage', 'users:invite');
