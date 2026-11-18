import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * `/settings/modules/contracts` (U10): the contract reminder settings, the module's configuration.
 * `module-config.routes` gates the area on the module and its read permission.
 * The old `/contracts/settings` URL redirects here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('contracts')],
    children: [
      {
        path: '',
        loadComponent: () => import('./contract-settings').then((m) => m.ContractSettingsPage),
      },
    ],
  },
] satisfies Routes;
