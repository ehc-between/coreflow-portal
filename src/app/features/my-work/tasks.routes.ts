import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

/**
 * Task pages under `/tasks` (lazy-loaded from app.routes, gated on `tasks:read`
 * there): every task the caller can see, recurring series, and a task's detail.
 * Creating and editing need `tasks:write`; a denied user goes back to the list.
 * Part of the My Work feature (contracts 5.4); the backend links tasks as `/tasks/<id>`.
 */
const routes: Routes = [
  {
    path: '',
    providers: [provideTranslocoScope('tasks')],
    children: [
      {
        path: '',
        loadComponent: () => import('./tasks/task-list').then((m) => m.TaskList),
      },
      {
        path: 'new',
        canActivate: [permissionGuard('tasks:write', { redirectTo: '/tasks' })],
        loadComponent: () => import('./tasks/task-new').then((m) => m.TaskNew),
      },
      {
        path: 'recurring',
        loadComponent: () =>
          import('./recurring/recurrence-list').then((m) => m.RecurrenceListPage),
      },
      {
        path: ':id',
        loadComponent: () => import('./tasks/task-detail').then((m) => m.TaskDetailPage),
      },
      {
        path: ':id/edit',
        canActivate: [permissionGuard('tasks:write', { redirectTo: '/tasks' })],
        loadComponent: () => import('./tasks/task-edit').then((m) => m.TaskEdit),
      },
    ],
  },
];

export default routes;
