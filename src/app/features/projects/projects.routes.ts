import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toList = { redirectTo: '/projects' };

/**
 * Projects (M14, scope `projects`). `app.routes.ts` already gates the area on the
 * `projects` module and `projects:read`; creating and editing need
 * `projects:write`. The backend links projects as `/projects/<id>`, milestones as
 * `/projects/<id>?milestone=<mid>` and design reviews as `/projects/<id>?review=<rid>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('projects')],
    children: [
      {
        path: '',
        loadComponent: () => import('./projects-list').then((m) => m.ProjectsList),
      },
      {
        path: 'new',
        canActivate: [permissionGuard('projects:write', toList)],
        loadComponent: () => import('./project-new').then((m) => m.ProjectNew),
      },
      {
        path: ':id',
        loadComponent: () => import('./project-detail').then((m) => m.ProjectDetailPage),
      },
      {
        path: ':id/edit',
        canActivate: [permissionGuard('projects:write', toList)],
        loadComponent: () => import('./project-edit').then((m) => m.ProjectEdit),
      },
    ],
  },
] satisfies Routes;
