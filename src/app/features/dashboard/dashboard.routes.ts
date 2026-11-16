import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { Dashboard } from './dashboard';

/**
 * Home (Oversikt), lazy-loaded from app.routes. Its strings live in the `home` scope
 * (`assets/i18n/home/<lang>.json`), shared with the journey page under Standards.
 */
const routes: Routes = [
  {
    path: '',
    providers: [provideTranslocoScope('home', 'tasks')],
    children: [{ path: '', component: Dashboard }],
  },
];

export default routes;
