import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { SelectedOrgService } from '../org/selected-org.service';
import { AuthService } from './auth.service';

/**
 * Builds a route guard that allows navigation only for an authenticated user
 * holding `permission` in their currently selected org. Mirrors orgManageGuard:
 * attempts a silent refresh when no session is present, sends an authenticated
 * user lacking the permission to the dashboard and an unauthenticated one to
 * login.
 */
export function permissionGuard(permission: string): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const selectedOrg = inject(SelectedOrgService);
    const router = inject(Router);

    // Captured-reference signal read (not the inject()-based hasPermission
    // helper), so it stays valid inside the async restoreSession callback.
    const allowed = () => (selectedOrg.currentOrg()?.permissions ?? []).includes(permission);

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
