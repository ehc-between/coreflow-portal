import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { moduleConfigRedirect } from '../../core/modules/module-config';

const write = permissionGuard('deviations:write', { redirectTo: '/deviations' });
const intake = permissionGuard('deviations:intake', { redirectTo: '/deviations' });

/** Query keys the Saker page understands; anything else is a filter of the full list. */
const CASES_QUERY = new Set(['type', 'tab', 'q']);

/**
 * IA v2 §7: `/deviations` (exact) now lands on Saker filtered to deviations
 * (`/cases?type=deviation`, keeping `tab` / `q`). A link that carries list filters
 * (`?status=`, `?kpi=1`, saved views …) goes to the full list at `/deviations/all`
 * with its query string intact, so dashboards, KPI tiles and bookmarks keep working.
 */
export const deviationsLanding: RedirectFunction = (route) => {
  const router = inject(Router);
  const params = route.queryParams;
  if (Object.keys(params).some((key) => !CASES_QUERY.has(key))) {
    return router.createUrlTree(['/deviations/all'], { queryParams: params });
  }
  return router.createUrlTree(['/cases'], { queryParams: { ...params, type: 'deviation' } });
};

/**
 * Deviations feature routes (M03; lazy-loaded, `app.routes.ts` already wraps the
 * module in `moduleGuard('deviations')` + `permissionGuard('deviations:read')`).
 * Filing and editing need `deviations:write`, the intake triage inbox `deviations:intake`.
 * Types, templates and the intake link (`deviations:admin`) are configuration under
 * `/settings/modules/deviations` (`deviations-config.routes.ts`); their old URLs redirect.
 * A denied user is sent back to the list. Entity URLs from the backend:
 * `/deviations/<id>` and `/deviations/intake/<report id>`. The public report form
 * (`/report/<token>`) lives outside the signed-in shell (`app.routes.ts`).
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('deviations')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: deviationsLanding },
      {
        path: 'all',
        loadComponent: () => import('./deviations-list').then((m) => m.DeviationsList),
      },
      {
        path: 'new',
        canActivate: [write],
        loadComponent: () => import('./deviation-new').then((m) => m.DeviationNew),
      },
      {
        path: 'stats',
        loadComponent: () => import('./stats/deviation-stats').then((m) => m.DeviationStatsPage),
      },
      {
        path: 'actions',
        loadComponent: () => import('./actions/actions-list').then((m) => m.ActionsList),
      },
      // U10: types, templates and the intake channel are configuration (/settings/modules/deviations).
      moduleConfigRedirect('types', 'deviations'),
      moduleConfigRedirect('types/new', 'deviations'),
      moduleConfigRedirect('types/:id', 'deviations'),
      moduleConfigRedirect('templates', 'deviations'),
      {
        path: 'intake',
        canActivate: [intake],
        loadComponent: () => import('./intake/intake-inbox').then((m) => m.IntakeInboxPage),
      },
      moduleConfigRedirect('intake/settings', 'deviations', 'intake'),
      {
        path: 'intake/:id',
        canActivate: [intake],
        loadComponent: () =>
          import('./intake/intake-report-detail').then((m) => m.IntakeReportDetailPage),
      },
      {
        path: ':id',
        loadComponent: () => import('./deviation-detail').then((m) => m.DeviationDetail),
      },
      {
        path: ':id/print',
        loadComponent: () => import('./print/deviation-print').then((m) => m.DeviationPrintPage),
      },
      {
        path: ':id/edit',
        canActivate: [write],
        data: { edit: true },
        loadComponent: () => import('./deviation-detail').then((m) => m.DeviationDetail),
      },
    ],
  },
] satisfies Routes;
