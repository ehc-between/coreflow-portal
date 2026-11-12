import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toList = { redirectTo: '/settings/record-types' };

/**
 * `/settings/record-types` (scope `records`): configurable record types and
 * workflows. Reading needs `records:read`; creating needs `records:admin`
 * (existing designs open read-only without it). The entity URLs the backend
 * registers are `/settings/record-types/{id}` and
 * `/settings/record-types/workflows/{id}`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('records')],
    canActivate: [permissionGuard('records:read', { redirectTo: '/settings' })],
    children: [
      {
        path: '',
        loadComponent: () => import('./record-types-list').then((m) => m.RecordTypesList),
      },
      {
        path: 'new',
        canActivate: [permissionGuard('records:admin', toList)],
        loadComponent: () => import('./record-type-designer').then((m) => m.RecordTypeDesigner),
      },
      {
        path: 'workflows/new',
        canActivate: [permissionGuard('records:admin', toList)],
        loadComponent: () => import('./workflow-designer').then((m) => m.WorkflowDesigner),
      },
      {
        path: 'workflows/:id',
        loadComponent: () => import('./workflow-designer').then((m) => m.WorkflowDesigner),
      },
      {
        path: ':id',
        loadComponent: () => import('./record-type-designer').then((m) => m.RecordTypeDesigner),
      },
    ],
  },
] satisfies Routes;
