import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const manage = permissionGuard('documents:manage', { redirectTo: '/settings/modules/documents' });

/**
 * `/settings/modules/documents` (U10): document types, templates and retention
 * rules, the documents module's configuration. `module-config.routes` gates the
 * area on the module and `documents:read`; creating needs `documents:manage`. The
 * old `/documents/types*`, `/documents/templates*` and `/documents/retention*`
 * URLs (also the backend's entity URLs) redirect here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('documents')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'types' },
      {
        path: 'types',
        loadComponent: () =>
          import('./types/document-type-list').then((m) => m.DocumentTypeListPage),
      },
      {
        path: 'types/new',
        canActivate: [manage],
        loadComponent: () =>
          import('./types/document-type-form').then((m) => m.DocumentTypeFormPage),
      },
      {
        path: 'types/:id',
        loadComponent: () =>
          import('./types/document-type-form').then((m) => m.DocumentTypeFormPage),
      },
      {
        path: 'templates',
        loadComponent: () => import('./templates/template-list').then((m) => m.TemplateListPage),
      },
      {
        path: 'templates/new',
        canActivate: [manage],
        loadComponent: () => import('./templates/template-form').then((m) => m.TemplateFormPage),
      },
      {
        path: 'templates/:id',
        loadComponent: () => import('./templates/template-form').then((m) => m.TemplateFormPage),
      },
      {
        path: 'retention',
        loadComponent: () => import('./retention/retention-list').then((m) => m.RetentionListPage),
      },
      {
        path: 'retention/new',
        canActivate: [manage],
        loadComponent: () => import('./retention/retention-form').then((m) => m.RetentionFormPage),
      },
      {
        path: 'retention/:id',
        loadComponent: () => import('./retention/retention-form').then((m) => m.RetentionFormPage),
      },
    ],
  },
] satisfies Routes;
