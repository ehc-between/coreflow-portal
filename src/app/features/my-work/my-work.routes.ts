import { Routes } from '@angular/router';

/** My Work feature routes (lazy-loaded from app.routes, scoped to the current org). */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./my-work').then((m) => m.MyWork),
  },
];

export default routes;
