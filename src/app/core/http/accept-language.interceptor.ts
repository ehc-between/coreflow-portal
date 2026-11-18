import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { APP_CONFIG } from '../config/app-config';

/**
 * Sends the active UI language as `Accept-Language` on every request to the
 * CoreFlow API, so texts the backend writes (catalogue titles, default record
 * titles, PDF exports) follow the language the user reads, not the browser's.
 * Requests to other hosts (assets, CDNs) and requests that already set the
 * header are left untouched.
 */
export const acceptLanguageInterceptor: HttpInterceptorFn = (req, next) => {
  const apiBaseUrl = inject(APP_CONFIG).apiBaseUrl;
  if (!apiBaseUrl || !req.url.startsWith(apiBaseUrl) || req.headers.has('Accept-Language')) {
    return next(req);
  }
  const lang = inject(TranslocoService).getActiveLang();
  if (!lang) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { 'Accept-Language': lang } }));
};
