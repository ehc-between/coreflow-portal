import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Guards the authenticated shell. Allows navigation when a session is present;
 * otherwise attempts a silent refresh (in case the access token was lost on a
 * full reload but the refresh cookie is still valid) before redirecting to the
 * login page with a returnUrl.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return auth
    .restoreSession()
    .pipe(
      map(
        (ok) => ok || router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }),
      ),
    );
};
