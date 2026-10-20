import { ActivatedRoute, Router } from '@angular/router';

/**
 * Read a one-time secret (e.g. a password-reset or invitation `?token=`) from
 * the current route ONCE and immediately remove it from the address bar and
 * browser history (`replaceUrl`), so it isn't kept in history, copied along
 * with the URL, or picked up by error reporting / session replay. Other query
 * params are preserved. The caller keeps the returned value in memory; after a
 * reload the param is gone and this returns `''` (the "invalid link" state).
 */
export function takeQueryToken(route: ActivatedRoute, router: Router, param = 'token'): string {
  const token = route.snapshot.queryParamMap.get(param) ?? '';
  if (route.snapshot.queryParamMap.has(param)) {
    void router.navigate([], {
      relativeTo: route,
      queryParams: { [param]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  return token;
}
