import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, RedirectFunction, Route, Router } from '@angular/router';

/**
 * A redirect that keeps the query string (a plain `redirectTo` string drops it,
 * and links such as `/reports/audit-packs?flow=<token>` depend on it).
 */
function moved(target: (params: ActivatedRouteSnapshot['params']) => string[]): RedirectFunction {
  return (route) => {
    const router = inject(Router);
    return router.createUrlTree(target(route.params), { queryParams: route.queryParams });
  };
}

/**
 * U11: register exports, saved reports and audit packs moved from Reports into
 * "Dokumenter og rapporter" (`/library`). Old links (bookmarks, e-mails, backend
 * URLs such as `/reports/audit-packs/{id}`) keep working. Mounted in app.routes
 * before the Reports module route, so they apply whatever the module gate says.
 */
export const REPORTS_REDIRECTS: Route[] = [
  { path: 'reports/registers', pathMatch: 'full', redirectTo: moved(() => ['/library/registers']) },
  { path: 'reports/definitions', pathMatch: 'full', redirectTo: moved(() => ['/library/reports']) },
  {
    path: 'reports/definitions/new',
    pathMatch: 'full',
    redirectTo: moved(() => ['/library/reports/new']),
  },
  {
    path: 'reports/definitions/:id',
    pathMatch: 'full',
    redirectTo: moved((p) => ['/library/reports', p['id']]),
  },
  {
    path: 'reports/definitions/:id/edit',
    pathMatch: 'full',
    redirectTo: moved((p) => ['/library/reports', p['id'], 'edit']),
  },
  {
    path: 'reports/audit-packs',
    pathMatch: 'full',
    redirectTo: moved(() => ['/library/audit-packs']),
  },
  {
    path: 'reports/audit-packs/:id',
    pathMatch: 'full',
    redirectTo: moved((p) => ['/library/audit-packs', p['id']]),
  },
];
