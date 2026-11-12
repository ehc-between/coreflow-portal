import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * My Work (lazy-loaded from app.routes, scoped to the current org): the caller's
 * tasks, CAPA actions, owned deviations, reviews and acknowledgements in one feed,
 * as a list, a board or a month calendar (`?view=list|board|calendar`).
 * Open to every member; each source is permission-filtered by the backend.
 */
const routes: Routes = [
  {
    path: '',
    providers: [provideTranslocoScope('tasks')],
    children: [
      {
        path: '',
        loadComponent: () => import('./my-work').then((m) => m.MyWork),
      },
    ],
  },
];

export default routes;
