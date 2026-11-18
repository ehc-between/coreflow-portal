import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * `/settings/modules/management-review` (U10): the review interval and reminder, the module's configuration.
 * `module-config.routes` gates the area on the module and its read permission.
 * The old `/management-review/settings` URL redirects here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('management-review')],
    children: [
      {
        path: '',
        loadComponent: () => import('./review-settings').then((m) => m.ReviewSettingsPage),
      },
    ],
  },
] satisfies Routes;
