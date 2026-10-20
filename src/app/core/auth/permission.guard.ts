import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map } from 'rxjs';
import { NotificationService } from '../notifications/notification.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { AuthService } from './auth.service';
import { hasAnyPermission } from './permission';

/** i18n key of the warning shown when a guard turns a signed-in user away. */
export const FORBIDDEN_MESSAGE_KEY = 'errors.forbidden';

/** Where a denied user lands when no `redirectTo` is given. */
export const DEFAULT_DENIED_REDIRECT = '/dashboard';

/** Options for {@link permissionGuard}. */
export interface PermissionGuardOptions {
  /**
   * Where an authenticated user lacking the permission is sent. Defaults to the
   * dashboard; feature sub-pages pass their module's list page instead. That
   * target is itself guarded, so a user lacking access there too falls through
   * further (e.g. list → dashboard → my-work) without looping.
   */
  readonly redirectTo?: string;
  /**
   * Whether to show the translated "no access" warning on denial. Disabled for
   * silent fallbacks such as the default landing page (`/dashboard`).
   */
  readonly notify?: boolean;
}

/**
 * Builds a route guard that allows navigation only for an authenticated user
 * holding `permission` in their currently selected org (`SelectedOrgService`).
 * A list means ANY one of the permissions suffices.
 *
 * Session restore: when no session is present (hard refresh — the in-memory
 * access token is gone) it waits for the single-flight silent refresh before
 * deciding, so a reload never falsely redirects. The selected org is a
 * synchronous `computed` over the auth state, so it is already resolved when
 * the refresh emits. An unauthenticated user is sent to login; an
 * authenticated one lacking the permission to `redirectTo` with a warning.
 */
export function permissionGuard(
  permission: string | readonly string[],
  options: PermissionGuardOptions = {},
): CanActivateFn {
  const { redirectTo = DEFAULT_DENIED_REDIRECT, notify = true } = options;

  return () => {
    const auth = inject(AuthService);
    const selectedOrg = inject(SelectedOrgService);
    const notifications = inject(NotificationService);
    const router = inject(Router);

    // Captured-reference reads (not the inject()-based hasPermission helper),
    // so they stay valid inside the async restoreSession callback.
    const decide = (): boolean | UrlTree => {
      if (hasAnyPermission(selectedOrg.currentOrg()?.permissions, permission)) {
        return true;
      }
      // Dedupe: a fall-through chain (e.g. /documents/new → /documents →
      // /dashboard) should surface a single warning, not one per hop.
      const alreadyShown = notifications
        .notifications()
        .some((n) => n.message === FORBIDDEN_MESSAGE_KEY);
      if (notify && !alreadyShown) {
        notifications.warning(FORBIDDEN_MESSAGE_KEY);
      }
      return router.parseUrl(redirectTo);
    };

    if (auth.isAuthenticated()) {
      return decide();
    }

    return auth
      .restoreSession()
      .pipe(map(() => (auth.isAuthenticated() ? decide() : router.createUrlTree(['/login']))));
  };
}
