import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * Registre (`/registers`): the shell v2 destination (U03) holding the hub (U04). Open
 * to every member: the counts endpoint only returns the registers the caller may
 * read, and each list keeps its own guard. The old menu has no entry for it.
 */
const routes: Routes = [
  {
    path: '',
    providers: [provideTranslocoScope('registers')],
    loadComponent: () => import('./registers-hub').then((m) => m.RegistersHub),
  },
];

export default routes;
