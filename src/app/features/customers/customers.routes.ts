import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toList = { redirectTo: '/customers' };

/**
 * The customer register (scope `customers`, docs/customer-register-design.md §3).
 * `app.routes.ts` gates the area on the `customers` module and `customers:read`;
 * creating, editing and reviewing matches need `customers:write`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('customers')],
    children: [
      {
        path: '',
        loadComponent: () => import('./customers-list').then((m) => m.CustomersList),
      },
      {
        path: 'new',
        canActivate: [permissionGuard('customers:write', toList)],
        loadComponent: () => import('./customer-form-page').then((m) => m.CustomerFormPage),
      },
      {
        path: 'matches',
        canActivate: [permissionGuard('customers:write', toList)],
        loadComponent: () => import('./matches/customer-matches').then((m) => m.CustomerMatches),
      },
      {
        path: ':id',
        loadComponent: () => import('./customer-detail').then((m) => m.CustomerDetailPage),
      },
      {
        path: ':id/edit',
        canActivate: [permissionGuard('customers:write', toList)],
        loadComponent: () => import('./customer-form-page').then((m) => m.CustomerFormPage),
      },
    ],
  },
] satisfies Routes;
