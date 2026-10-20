import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { reportError } from '../monitoring/error-reporter';
import { NotificationService } from '../notifications/notification.service';

/**
 * Per-request opt-out of the generic user-facing error toast. Set on requests
 * whose failures are an expected, handled-in-place outcome (e.g. a public
 * invitation lookup that 404s/410s for an expired link). Server/network errors
 * are still reported to monitoring.
 */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/**
 * Centralised HTTP error handling:
 *  - forwards server (5xx) and network (status 0) failures to the error reporter
 *    (Sentry when enabled — otherwise a no-op);
 *  - surfaces a neutral, user-facing message via the NotificationService;
 *  - re-throws so feature code can still react to the specific error.
 *
 * 401/403 are left to the auth layer (authInterceptor handles token refresh and
 * redirects), so we don't show a generic error for those.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(NotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const isServerOrNetwork = error.status === 0 || error.status >= 500;
        const isAuth = error.status === 401 || error.status === 403;

        if (isServerOrNetwork) {
          reportError(error, { url: req.urlWithParams, method: req.method, status: error.status });
        }

        if (!isAuth && !req.context.get(SKIP_ERROR_TOAST)) {
          notifications.error(httpErrorMessageKey(error.status));
        }
      }
      return throwError(() => error);
    }),
  );
};

/**
 * Maps an HTTP status to an i18n key for a neutral user-facing message. Exported
 * so callers that opt out via SKIP_ERROR_TOAST can still toast consistently.
 */
export function httpErrorMessageKey(status: number): string {
  if (status === 0) {
    return 'errors.network';
  }
  if (status === 404) {
    return 'errors.notFound';
  }
  if (status >= 500) {
    return 'errors.server';
  }
  return 'errors.generic';
}
