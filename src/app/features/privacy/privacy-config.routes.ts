import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * `/settings/modules/privacy` (U10): the controller and DPO contacts (read by every privacy reader, changed by privacy:manage), the module's configuration.
 * `module-config.routes` gates the area on the module and its read permission.
 * The old `/privacy/settings` URL redirects here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('privacy')],
    children: [
      {
        path: '',
        loadComponent: () => import('./privacy-settings').then((m) => m.PrivacySettingsPage),
      },
    ],
  },
] satisfies Routes;
