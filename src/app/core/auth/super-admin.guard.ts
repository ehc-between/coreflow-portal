import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Guards the super-admin area. Allows navigation only for an authenticated
 * super-user. When no session is present (e.g. the access token was lost on a
 * full reload) a silent refresh is attempted first; a non-super authenticated
 * user is sent to the dashboard, an unauthenticated one to the login page.
 */
export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return auth.isSuperuser() || router.createUrlTree(['/dashboard']);
  }

  return auth.restoreSession().pipe(
    map(() => {
      if (!auth.isAuthenticated()) {
        return router.createUrlTree(['/login']);
      }
      return auth.isSuperuser() || router.createUrlTree(['/dashboard']);
    }),
  );
};
