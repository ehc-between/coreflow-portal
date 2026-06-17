import { Routes } from '@angular/router';

/** Deviations feature routes (lazy-loaded from app.routes, scoped to the current org). */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./deviations-list').then((m) => m.DeviationsList),
  },
  {
    path: 'new',
    loadComponent: () => import('./deviation-new').then((m) => m.DeviationNew),
  },
  {
    path: 'stats',
    loadComponent: () => import('./stats/deviation-stats').then((m) => m.DeviationStatsPage),
  },
  {
    path: 'types',
    loadComponent: () => import('./types/deviation-types-list').then((m) => m.DeviationTypesList),
  },
  {
    path: 'types/new',
    loadComponent: () => import('./types/deviation-type-editor').then((m) => m.DeviationTypeEditor),
  },
  {
    path: 'types/:id',
    loadComponent: () => import('./types/deviation-type-editor').then((m) => m.DeviationTypeEditor),
  },
  {
    path: ':id',
    loadComponent: () => import('./deviation-detail').then((m) => m.DeviationDetail),
  },
];

export default routes;
