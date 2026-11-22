import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { moved } from '../library/library-redirects';

const toReports = { redirectTo: '/reports' };
const toCustom = { redirectTo: '/reports/custom' };

/**
 * The Reports module pages below the Rapporter hub (IA v2 §5.9). app.routes mounts
 * the hub (`reports-hub.routes.ts`, open to every member) at `/reports` and this file
 * below it behind the `reports` module gate and `reports:read`.
 *
 * - `status` "Status og nøkkeltall" (the compliance overview, was `/reports`),
 *   `dashboards` the role overview designer.
 * - Moved back from `/library` (U11): `saved` (archive of generated files),
 *   `generated/:id`, `exports` (register export), `custom/**` (saved report
 *   definitions) and `audit-packs/**`. `features/library/library.routes.ts` redirects
 *   the old URLs here.
 * - `calendar` moved to Årshjul (`/annual-cycle`).
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('reports', 'outputs')],
    children: [
      {
        // Reached only when app.routes mounts this file directly at `/reports`
        // (before the IA v2 shell); the shell serves the hub first.
        path: '',
        pathMatch: 'full',
        loadChildren: () => import('./reports-hub.routes'),
      },
      {
        path: 'status',
        title: 'reports.nav.status',
        loadComponent: () =>
          import('./overview/compliance-overview').then((m) => m.ComplianceOverview),
      },
      {
        path: 'calendar',
        pathMatch: 'full',
        redirectTo: moved(() => ['/annual-cycle']),
      },
      {
        path: 'dashboards',
        canActivate: [permissionGuard('reports:manage', toReports)],
        loadComponent: () =>
          import('./dashboards/dashboard-designer').then((m) => m.DashboardDesigner),
      },
      {
        path: 'all',
        title: 'reports.hub.all.title',
        loadComponent: () => import('../library/library-outputs').then((m) => m.LibraryOutputs),
      },
      {
        path: 'saved',
        title: 'outputs.saved.title',
        loadComponent: () => import('../library/generated-list').then((m) => m.GeneratedListPage),
      },
      { path: 'generated', pathMatch: 'full', redirectTo: moved(() => ['/reports/saved']) },
      {
        path: 'generated/:id',
        title: 'outputs.generated.title',
        loadComponent: () =>
          import('../library/generated-detail').then((m) => m.GeneratedDetailPage),
      },
      {
        path: 'exports',
        title: 'reports.registers.title',
        loadComponent: () => import('./registers/registers-page').then((m) => m.RegistersPage),
      },
      {
        path: 'custom',
        title: 'reports.definitions.title',
        loadComponent: () =>
          import('./definitions/definitions-list').then((m) => m.DefinitionsList),
      },
      {
        path: 'custom/new',
        canActivate: [permissionGuard('reports:write', toCustom)],
        loadComponent: () => import('./definitions/definition-form').then((m) => m.DefinitionForm),
      },
      {
        path: 'custom/:id',
        loadComponent: () =>
          import('./definitions/definition-detail').then((m) => m.DefinitionDetail),
      },
      {
        path: 'custom/:id/edit',
        canActivate: [permissionGuard('reports:write', toCustom)],
        loadComponent: () => import('./definitions/definition-form').then((m) => m.DefinitionForm),
      },
      {
        path: 'audit-packs',
        title: 'reports.packs.title',
        canActivate: [permissionGuard('reports:audit_pack', toReports)],
        loadComponent: () => import('./audit-packs/audit-packs-list').then((m) => m.AuditPacksList),
      },
      {
        path: 'audit-packs/:id',
        canActivate: [permissionGuard('reports:audit_pack', toReports)],
        loadComponent: () =>
          import('./audit-packs/audit-pack-detail').then((m) => m.AuditPackDetail),
      },
    ],
  },
] satisfies Routes;
