import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AuthService } from './auth.service';

/** Auth endpoints that manage the session themselves — never add a bearer / retry. */
const AUTH_ENDPOINTS = ['/v1/auth/login', '/v1/auth/refresh', '/v1/auth/logout'];

function isAuthEndpoint(url: string): boolean {
  return AUTH_ENDPOINTS.some((path) => url.includes(path));
}

function withBearer(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Attaches the in-memory access token to backend API requests and transparently
 * recovers from expiry:
 *  - only requests to the configured `apiBaseUrl` are touched — static assets
 *    (e.g. the i18n JSON) and any third-party URL never receive the token;
 *  - login/refresh/logout carry the refresh cookie themselves and are left
 *    untouched (no bearer, no 401 retry);
 *  - other API requests get `Authorization: Bearer <access>` when a token exists;
 *  - on a 401 we trigger a single shared refresh (AuthService.refresh is
 *    single-flight, so concurrent 401s share one round-trip) and retry the
 *    original request once. If refresh fails, state is cleared and the user is
 *    sent to /login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const apiBaseUrl = inject(APP_CONFIG).apiBaseUrl;

  // Scope auth strictly to the backend API; leave everything else (assets, CDNs) alone.
  if (!req.url.startsWith(apiBaseUrl) || isAuthEndpoint(req.url)) {
    return next(req);
  }

  const token = auth.accessToken();
  const authedReq = token ? withBearer(req, token) : req;

  return next(authedReq).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        switchMap((ok): Observable<HttpEvent<unknown>> => {
          if (!ok) {
            void router.navigateByUrl('/login');
            return throwError(() => error);
          }
          return next(withBearer(req, auth.accessToken()!));
        }),
      );
    }),
  );
};
