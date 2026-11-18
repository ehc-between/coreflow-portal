import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

/**
 * `/settings/modules/recruitment` (U10): retention of candidate data, privacy notice and pipeline stages, the module's configuration.
 * `module-config.routes` gates the area on the module and its read permission; changing it needs `recruitment:manage`.
 * The old `/recruitment/settings` URL redirects here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('recruitment')],
    children: [
      {
        path: '',
        canActivate: [
          permissionGuard('recruitment:manage', { redirectTo: '/recruitment/requisitions' }),
        ],
        loadComponent: () =>
          import('./settings/recruitment-settings').then((m) => m.RecruitmentSettingsPage),
      },
    ],
  },
] satisfies Routes;
