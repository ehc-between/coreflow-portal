import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toReports = { redirectTo: '/reports' };
const toDefinitions = { redirectTo: '/reports/definitions' };

/**
 * `/reports` (M23, scope `reports`; app.routes wraps it in the `reports` module
 * gate and `reports:read`): the compliance dashboard per framework, the
 * organisation calendar, register exports, saved reports, audit packs and the
 * role dashboard designer. The backend links records as
 * `/reports/definitions/{id}` and `/reports/audit-packs/{id}`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('reports')],
    loadComponent: () => import('./reports-shell').then((m) => m.ReportsShell),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./overview/compliance-overview').then((m) => m.ComplianceOverview),
      },
      {
        path: 'calendar',
        loadComponent: () => import('./calendar/org-calendar').then((m) => m.OrgCalendar),
      },
      {
        path: 'registers',
        loadComponent: () => import('./registers/registers-page').then((m) => m.RegistersPage),
      },
      {
        path: 'definitions',
        loadComponent: () =>
          import('./definitions/definitions-list').then((m) => m.DefinitionsList),
      },
      {
        path: 'definitions/new',
        canActivate: [permissionGuard('reports:write', toDefinitions)],
        loadComponent: () => import('./definitions/definition-form').then((m) => m.DefinitionForm),
      },
      {
        path: 'definitions/:id',
        loadComponent: () =>
          import('./definitions/definition-detail').then((m) => m.DefinitionDetail),
      },
      {
        path: 'definitions/:id/edit',
        canActivate: [permissionGuard('reports:write', toDefinitions)],
        loadComponent: () => import('./definitions/definition-form').then((m) => m.DefinitionForm),
      },
      {
        path: 'audit-packs',
        canActivate: [permissionGuard('reports:audit_pack', toReports)],
        loadComponent: () => import('./audit-packs/audit-packs-list').then((m) => m.AuditPacksList),
      },
      {
        path: 'audit-packs/:id',
        canActivate: [permissionGuard('reports:audit_pack', toReports)],
        loadComponent: () =>
          import('./audit-packs/audit-pack-detail').then((m) => m.AuditPackDetail),
      },
      {
        path: 'dashboards',
        canActivate: [permissionGuard('reports:manage', toReports)],
        loadComponent: () =>
          import('./dashboards/dashboard-designer').then((m) => m.DashboardDesigner),
      },
    ],
  },
] satisfies Routes;
