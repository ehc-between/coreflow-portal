import { Routes } from '@angular/router';

/**
 * ISO & standards feature routes (lazy-loaded from app.routes, scoped to the
 * current org). The whole module is gated on `standards:read` upstream; manage
 * actions inside the pages are gated on `standards:manage`.
 */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./standards-overview').then((m) => m.StandardsOverview),
  },
  {
    path: ':key',
    loadComponent: () => import('./standard-view').then((m) => m.StandardView),
  },
  {
    path: ':key/clauses/:number',
    loadComponent: () => import('./clause-detail').then((m) => m.ClauseDetailPage),
  },
];

export default routes;
