import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/** `/setup`: the organisation setup wizard (guarded with `org:manage` in app.routes). */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('modules')],
    loadComponent: () => import('./setup/setup-wizard').then((m) => m.SetupWizard),
  },
] satisfies Routes;
