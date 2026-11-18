import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { moduleConfigLink } from '../../core/modules/module-config';

const manage = permissionGuard('risk:manage', { redirectTo: moduleConfigLink('risk', 'matrices') });

/**
 * `/settings/modules/risk` (U10): risk matrices and risk registers, the risk
 * module's configuration. `module-config.routes` gates the area on the module and
 * `risk:read`; the old `/risk/matrices*` and `/risk/registers*` URLs redirect here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('risk')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'matrices' },
      {
        path: 'matrices',
        loadComponent: () => import('./matrices/matrix-list').then((m) => m.MatrixListPage),
      },
      {
        path: 'matrices/new',
        canActivate: [manage],
        loadComponent: () => import('./matrices/matrix-editor').then((m) => m.MatrixEditorPage),
      },
      {
        path: 'matrices/:id',
        loadComponent: () => import('./matrices/matrix-editor').then((m) => m.MatrixEditorPage),
      },
      {
        path: 'registers',
        loadComponent: () => import('./registers/register-list').then((m) => m.RegisterListPage),
      },
      {
        path: 'registers/:id',
        loadComponent: () =>
          import('./registers/register-detail').then((m) => m.RegisterDetailPage),
      },
    ],
  },
] satisfies Routes;
