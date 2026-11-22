import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * Oversikt (IA v2 §5.1), the landing page at `/home`. Not permission-guarded: every
 * member sees the same page with their own data. Strings live in the `home` scope
 * (`assets/i18n/home/<lang>.json`), shared with the journey page under Standards.
 */
const routes: Routes = [
  {
    path: '',
    providers: [provideTranslocoScope('home', 'tasks')],
    loadComponent: () => import('./home-page').then((m) => m.HomePage),
  },
];

export default routes;
