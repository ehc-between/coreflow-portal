import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toReports = { redirectTo: '/reports' };

/**
 * `/reports` (M23, scope `reports`; app.routes wraps it in the `reports` module
 * gate and `reports:read`): the reporting overview (key numbers, trends and the
 * role overview), the organisation calendar and the role-overview designer. Each
 * page renders its own header and the Reports sub-navigation (`app-reports-nav`).
 *
 * U11: register exports, saved reports and audit packs moved into "Dokumenter og
 * rapporter" (`/library/registers`, `/library/reports`, `/library/audit-packs`);
 * `features/library/library-redirects.ts` keeps the old `/reports/*` URLs working.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('reports')],
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
        path: 'dashboards',
        canActivate: [permissionGuard('reports:manage', toReports)],
        loadComponent: () =>
          import('./dashboards/dashboard-designer').then((m) => m.DashboardDesigner),
      },
    ],
  },
] satisfies Routes;
