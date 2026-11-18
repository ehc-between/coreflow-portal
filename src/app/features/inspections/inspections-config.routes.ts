import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toTemplates = { redirectTo: '/settings/modules/inspections/templates' };

/**
 * `/settings/modules/inspections` (U10): checklist templates (list, library,
 * detail, builder), the inspections module's configuration. `module-config.routes`
 * gates the area on the module and `inspections:read`; designing needs
 * `inspections:templates`. The old `/inspections/templates*` URLs (also the
 * backend's entity URL `/inspections/templates/<id>`) redirect here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('inspections')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'templates' },
      {
        path: 'templates',
        loadComponent: () => import('./templates/templates-list').then((m) => m.TemplatesList),
      },
      {
        path: 'templates/library',
        loadComponent: () => import('./templates/template-library').then((m) => m.TemplateLibrary),
      },
      {
        path: 'templates/new',
        canActivate: [permissionGuard('inspections:templates', toTemplates)],
        loadComponent: () => import('./templates/template-builder').then((m) => m.TemplateBuilder),
      },
      {
        path: 'templates/:id',
        loadComponent: () =>
          import('./templates/template-detail').then((m) => m.TemplateDetailPage),
      },
      {
        path: 'templates/:id/edit',
        canActivate: [permissionGuard('inspections:templates', toTemplates)],
        loadComponent: () => import('./templates/template-builder').then((m) => m.TemplateBuilder),
      },
    ],
  },
] satisfies Routes;
