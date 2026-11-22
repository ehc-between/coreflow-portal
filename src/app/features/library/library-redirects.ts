import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RedirectFunction,
  Route,
  Router,
} from '@angular/router';
import { Observable, map } from 'rxjs';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';

/**
 * A redirect that keeps the query string (a plain `redirectTo` string drops it,
 * and links such as `/reports/audit-packs?flow=<token>` depend on it).
 */
export function moved(
  target: (params: ActivatedRouteSnapshot['params']) => string[],
): RedirectFunction {
  return (route) => {
    const router = inject(Router);
    return router.createUrlTree(target(route.params), { queryParams: route.queryParams });
  };
}

/** Whether the caller can open the Reports module pages below the Rapporter hub. */
function reportsReachable(): Observable<boolean> {
  const modules = inject(ModuleService);
  const selectedOrg = inject(SelectedOrgService);
  return modules
    .ensureLoaded()
    .pipe(
      map(
        () =>
          modules.isEnabled('reports') &&
          (selectedOrg.currentOrg()?.permissions ?? []).includes('reports:read'),
      ),
    );
}

/**
 * Sends an old `/library/...` URL to its new place under `/reports` (query string kept)
 * when the caller can open the Reports module pages (`reports` module on and
 * `reports:read`), so the module gate there would not turn them away. Otherwise the
 * old page keeps rendering: the catalogue, the archive and a generated file were open
 * to every member before IA v2, so nothing is lost.
 */
export function toReportsWhenReachable(
  target: (route: ActivatedRouteSnapshot) => string[],
): CanActivateFn {
  return (route) => {
    const router = inject(Router);
    return reportsReachable().pipe(
      map((ok) =>
        ok ? router.createUrlTree(target(route), { queryParams: route.queryParams }) : true,
      ),
    );
  };
}

/** Query params that narrow the catalogue (a module or standard page's "Dokumenter og rapporter"). */
const CATALOGUE_PARAMS = ['module', 'standard', 'kind'] as const;

/**
 * Where `/library` goes (IA v2 §7): the register-export filter to Eksport av registre, a
 * narrowed catalogue to "Alt CoreFlow kan lage" (`/reports/all`), anything else to the
 * Rapporter hub.
 */
export function libraryRootTarget(route: Pick<ActivatedRouteSnapshot, 'queryParams'>): string[] {
  const query = route.queryParams;
  if (query['kind'] === 'register_export') {
    return ['/reports/exports'];
  }
  return CATALOGUE_PARAMS.some((p) => query[p]) ? ['/reports/all'] : ['/reports'];
}

/**
 * Old `/reports/*` sub-page URLs (U11 moved them to `/library`, IA v2 brings them back
 * under Rapporter). Mounted by app.routes before the Reports module route. The IA v2
 * shell carries the same entries in `layout/legacy-redirects.ts`; this list can go
 * once app.routes no longer imports it.
 */
export const REPORTS_REDIRECTS: Route[] = [
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
