import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toList = { redirectTo: '/obligations' };

/**
 * Compliance obligations register (M18, scope `obligations`). `app.routes.ts` already
 * gates the area on the `obligations` module and `obligations:read`; creating and
 * editing need `obligations:write`. The backend links obligations as `/obligations/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('obligations')],
    children: [
      {
        path: '',
        loadComponent: () => import('./obligations-list').then((m) => m.ObligationsList),
      },
      {
        path: 'new',
        canActivate: [permissionGuard('obligations:write', toList)],
        loadComponent: () => import('./obligation-new').then((m) => m.ObligationNew),
      },
      {
        path: ':id',
        loadComponent: () => import('./obligation-detail').then((m) => m.ObligationDetail),
      },
      {
        path: ':id/edit',
        canActivate: [permissionGuard('obligations:write', toList)],
        loadComponent: () => import('./obligation-edit').then((m) => m.ObligationEdit),
      },
    ],
  },
] satisfies Routes;
