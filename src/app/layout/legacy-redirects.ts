import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, RedirectFunction, Route, Router } from '@angular/router';

/**
 * A redirect that keeps the query string (a plain `redirectTo` string drops it, and
 * links such as `/reports/audit-packs?flow=<token>` depend on it).
 */
export function moved(
  target: (params: ActivatedRouteSnapshot['params']) => string[],
): RedirectFunction {
  return (route) => {
    const router = inject(Router);
    return router.createUrlTree(target(route.params), { queryParams: route.queryParams });
  };
}

/**
 * Old landing pages that IA v2 replaced (docs/ia-v2.md §7), mounted in app.routes
 * before the module routes so they apply whatever the module gate says. Record URLs
 * never change (D1); only landing pages move. Redirects of a module's own sub-pages
 * (`/context`, `/processes`, `/deviations`, `/reports/calendar`, `/library/**`) live in
 * that module's route file.
 */
export const LEGACY_REDIRECTS: Route[] = [
  // The old home page and its aliases.
  { path: 'dashboard', pathMatch: 'full', redirectTo: moved(() => ['/home']) },
  // Procedures became the process register, which is now the Håndbok.
  { path: 'procedures', pathMatch: 'full', redirectTo: moved(() => ['/handbook']) },
  // The standards module used to live at /iso (placeholder).
  { path: 'iso', pathMatch: 'full', redirectTo: moved(() => ['/standards']) },
  // A short, guessable URL for the learning centre.
  { path: 'learning', pathMatch: 'full', redirectTo: moved(() => ['/account/learning']) },
  // U11 moved these from Reports to /library; IA v2 brings them back under Rapporter.
  { path: 'reports/registers', pathMatch: 'full', redirectTo: moved(() => ['/reports/exports']) },
  { path: 'reports/definitions', pathMatch: 'full', redirectTo: moved(() => ['/reports/custom']) },
  {
    path: 'reports/definitions/new',
    pathMatch: 'full',
    redirectTo: moved(() => ['/reports/custom/new']),
  },
  {
    path: 'reports/definitions/:id',
    pathMatch: 'full',
    redirectTo: moved((p) => ['/reports/custom', p['id']]),
  },
  {
    path: 'reports/definitions/:id/edit',
    pathMatch: 'full',
    redirectTo: moved((p) => ['/reports/custom', p['id'], 'edit']),
  },
];
