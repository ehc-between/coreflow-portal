import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import type { ProcessMapEditor } from './map/process-map-editor';

const toList = { redirectTo: '/processes' };

/**
 * `/processes` (scope `processes`, M02): the process register, a process's detail
 * (map, turtle diagram, description document, interactions, review tasks and the
 * record kit tabs), the swimlane map editor and the interaction map. `app.routes`
 * already gates the whole area on the `processes` module and `processes:read`;
 * creating and editing need `processes:write`; the map editor opens read-only for
 * readers (the server's `can_edit` decides). The backend's entity URL is
 * `/processes/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('processes')],
    children: [
      {
        path: '',
        loadComponent: () => import('./processes-list').then((m) => m.ProcessesList),
      },
      {
        path: 'new',
        canActivate: [permissionGuard('processes:write', toList)],
        loadComponent: () => import('./form/process-form-page').then((m) => m.ProcessFormPage),
      },
      {
        path: 'interaction-map',
        loadComponent: () =>
          import('./interactions/interaction-map-page').then((m) => m.InteractionMapPage),
      },
      {
        path: ':id',
        loadComponent: () => import('./detail/process-detail').then((m) => m.ProcessDetailPage),
      },
      {
        path: ':id/edit',
        canActivate: [permissionGuard('processes:write', toList)],
        loadComponent: () => import('./form/process-form-page').then((m) => m.ProcessFormPage),
      },
      {
        path: ':id/map',
        canDeactivate: [(editor: ProcessMapEditor) => editor.canLeave()],
        loadComponent: () => import('./map/process-map-editor').then((m) => m.ProcessMapEditor),
      },
    ],
  },
] satisfies Routes;
