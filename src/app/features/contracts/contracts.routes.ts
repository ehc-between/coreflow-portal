import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toList = { redirectTo: '/contracts' };

/**
 * Contract management (M12, scope `contracts`). `app.routes.ts` already gates the
 * area on the `contracts` module and `contracts:read`; creating and editing need
 * `contracts:write`. The backend links contracts as `/contracts/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('contracts')],
    children: [
      {
        path: '',
        loadComponent: () => import('./contracts-list').then((m) => m.ContractsList),
      },
      {
        path: 'deadlines',
        loadComponent: () => import('./contract-deadlines').then((m) => m.ContractDeadlines),
      },
      {
        path: 'new',
        canActivate: [permissionGuard('contracts:write', toList)],
        loadComponent: () => import('./contract-new').then((m) => m.ContractNew),
      },
      {
        path: ':id',
        loadComponent: () => import('./contract-detail').then((m) => m.ContractDetail),
      },
      {
        path: ':id/edit',
        canActivate: [permissionGuard('contracts:write', toList)],
        loadComponent: () => import('./contract-edit').then((m) => m.ContractEdit),
      },
    ],
  },
] satisfies Routes;
