import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { moduleConfigRedirect } from '../../core/modules/module-config';

const write = permissionGuard('deviations:write', { redirectTo: '/deviations' });
const intake = permissionGuard('deviations:intake', { redirectTo: '/deviations' });

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
      {
        path: '',
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
