import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { moduleGuard } from '../../core/modules/module.service';

const toLibrary = { redirectTo: '/library' };
const toSavedReports = { redirectTo: '/library/reports' };

/** The Reports pages hosted in the library still need the Reports module. */
const reports = (permission: string, redirect = toLibrary) => [
  moduleGuard('reports'),
  permissionGuard(permission, redirect),
];

/**
 * `/library` (U11, "Dokumenter og rapporter"): everything CoreFlow can hand out.
 *
 * - `''` Hent ut: every output the caller can make, grouped by audience
 *   (`?module=` / `?standard=` / `?kind=` narrow it; module and standard pages link here).
 * - `saved` the archive of generated files; `generated/:id` one stored version.
 * - `registers` register export with filters and columns (moved from `/reports/registers`).
 * - `reports` saved reports (moved from `/reports/definitions`).
 * - `audit-packs` audit packs (moved from `/reports/audit-packs`).
 *
 * Open to every member: each output is gated by its own module and permission in
 * the backend. The pages moved from Reports keep the Reports gates.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('outputs', 'reports')],
    children: [
      {
        path: '',
        title: 'outputs.title',
        loadComponent: () => import('./library-outputs').then((m) => m.LibraryOutputs),
      },
      {
        path: 'saved',
        title: 'outputs.saved.title',
        loadComponent: () => import('./generated-list').then((m) => m.GeneratedListPage),
      },
      {
        path: 'generated/:id',
        title: 'outputs.generated.title',
        loadComponent: () => import('./generated-detail').then((m) => m.GeneratedDetailPage),
      },
      {
        path: 'registers',
        canActivate: reports('reports:read'),
        loadComponent: () =>
          import('../reports/registers/registers-page').then((m) => m.RegistersPage),
      },
      {
        path: 'reports',
        canActivate: reports('reports:read'),
        loadComponent: () =>
          import('../reports/definitions/definitions-list').then((m) => m.DefinitionsList),
      },
      {
        path: 'reports/new',
        canActivate: reports('reports:write', toSavedReports),
        loadComponent: () =>
          import('../reports/definitions/definition-form').then((m) => m.DefinitionForm),
      },
      {
        path: 'reports/:id',
        canActivate: reports('reports:read'),
        loadComponent: () =>
          import('../reports/definitions/definition-detail').then((m) => m.DefinitionDetail),
      },
      {
        path: 'reports/:id/edit',
        canActivate: reports('reports:write', toSavedReports),
        loadComponent: () =>
          import('../reports/definitions/definition-form').then((m) => m.DefinitionForm),
      },
      {
        path: 'audit-packs',
        canActivate: reports('reports:audit_pack'),
        loadComponent: () =>
          import('../reports/audit-packs/audit-packs-list').then((m) => m.AuditPacksList),
      },
      {
        path: 'audit-packs/:id',
        canActivate: reports('reports:audit_pack'),
        loadComponent: () =>
          import('../reports/audit-packs/audit-pack-detail').then((m) => m.AuditPackDetail),
      },
    ],
  },
] satisfies Routes;
