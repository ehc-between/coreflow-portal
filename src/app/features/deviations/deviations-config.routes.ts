import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const admin = permissionGuard('deviations:admin', { redirectTo: '/deviations' });

/**
 * `/settings/modules/deviations` (U10): deviation types, report templates and the
 * anonymous reporting channel, all `deviations:admin`. `module-config.routes` gates
 * the area on the module and `deviations:read`; the old `/deviations/types*`,
 * `/deviations/templates` and `/deviations/intake/settings` URLs redirect here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('deviations')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'types' },
      {
        path: 'types',
        canActivate: [admin],
        loadComponent: () =>
          import('./types/deviation-types-list').then((m) => m.DeviationTypesList),
      },
      {
        path: 'types/new',
        canActivate: [admin],
        loadComponent: () =>
          import('./types/deviation-type-editor').then((m) => m.DeviationTypeEditor),
      },
      {
        path: 'types/:id',
        canActivate: [admin],
        loadComponent: () =>
          import('./types/deviation-type-editor').then((m) => m.DeviationTypeEditor),
      },
      {
        path: 'templates',
        canActivate: [admin],
        loadComponent: () =>
          import('./templates/deviation-templates').then((m) => m.DeviationTemplatesPage),
      },
      {
        path: 'intake',
        canActivate: [admin],
        loadComponent: () => import('./intake/intake-settings').then((m) => m.IntakeSettingsPage),
      },
    ],
  },
] satisfies Routes;
