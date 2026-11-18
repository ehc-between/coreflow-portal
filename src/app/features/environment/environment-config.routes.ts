import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

/**
 * `/settings/modules/environment` (U10): the significance method for environmental aspects, the module's configuration.
 * `module-config.routes` gates the area on the module and its read permission; changing it needs `environment:manage`.
 * The old `/environment/scoring` URL redirects here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('environment')],
    children: [
      {
        path: '',
        canActivate: [permissionGuard('environment:manage', { redirectTo: '/environment' })],
        loadComponent: () => import('./scoring-settings').then((m) => m.ScoringSettings),
      },
    ],
  },
] satisfies Routes;
