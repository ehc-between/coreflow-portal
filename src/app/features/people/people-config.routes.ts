import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * `/settings/modules/people` (U10): the default joiner and leaver checklist items, the module's configuration.
 * `module-config.routes` gates the area on the module and its read permission.
 * The old `/people/settings` URL redirects here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('people')],
    children: [
      {
        path: '',
        loadComponent: () => import('./people-settings').then((m) => m.PeopleSettings),
      },
    ],
  },
] satisfies Routes;
