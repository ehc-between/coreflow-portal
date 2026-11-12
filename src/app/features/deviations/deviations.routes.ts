import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const write = permissionGuard('deviations:write', { redirectTo: '/deviations' });
const admin = permissionGuard('deviations:admin', { redirectTo: '/deviations' });
const intake = permissionGuard('deviations:intake', { redirectTo: '/deviations' });

/**
 * Deviations feature routes (M03; lazy-loaded, `app.routes.ts` already wraps the
 * module in `moduleGuard('deviations')` + `permissionGuard('deviations:read')`).
 * Filing and editing need `deviations:write`, type administration, templates and
 * the intake link `deviations:admin`, the intake triage inbox `deviations:intake`.
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
      {
        path: 'types',
        canActivate: [admin],
        loadComponent: () =>
          import('./types/deviation-types-list').then((m) => m.DeviationTypesList),
      },
      {
        path: 'types/new',
        canActivate: [admin],
        loadComponent: () =>
          import('./types/deviation-type-editor').then((m) => m.DeviationTypeEditor),
      },
      {
        path: 'types/:id',
        canActivate: [admin],
        loadComponent: () =>
          import('./types/deviation-type-editor').then((m) => m.DeviationTypeEditor),
      },
      {
        path: 'templates',
        canActivate: [admin],
        loadComponent: () =>
          import('./templates/deviation-templates').then((m) => m.DeviationTemplatesPage),
      },
      {
        path: 'intake',
        canActivate: [intake],
        loadComponent: () => import('./intake/intake-inbox').then((m) => m.IntakeInboxPage),
      },
      {
        path: 'intake/settings',
        canActivate: [admin],
        loadComponent: () => import('./intake/intake-settings').then((m) => m.IntakeSettingsPage),
      },
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
        path: ':id/edit',
        canActivate: [write],
        data: { edit: true },
        loadComponent: () => import('./deviation-detail').then((m) => m.DeviationDetail),
      },
    ],
  },
] satisfies Routes;
