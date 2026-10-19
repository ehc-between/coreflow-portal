import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';

/**
 * Deviations feature routes (lazy-loaded from app.routes, scoped to the current
 * org). The whole module (list, stats, detail) is gated on `deviations:read`
 * upstream; filing needs `deviations:write` and type administration
 * `deviations:admin`. A denied user is sent back to the list.
 */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./deviations-list').then((m) => m.DeviationsList),
  },
  {
    path: 'new',
    canActivate: [permissionGuard('deviations:write', { redirectTo: '/deviations' })],
    loadComponent: () => import('./deviation-new').then((m) => m.DeviationNew),
  },
  {
    path: 'stats',
    loadComponent: () => import('./stats/deviation-stats').then((m) => m.DeviationStatsPage),
  },
  {
    path: 'types',
    canActivate: [permissionGuard('deviations:admin', { redirectTo: '/deviations' })],
    loadComponent: () => import('./types/deviation-types-list').then((m) => m.DeviationTypesList),
  },
  {
    path: 'types/new',
    canActivate: [permissionGuard('deviations:admin', { redirectTo: '/deviations' })],
    loadComponent: () => import('./types/deviation-type-editor').then((m) => m.DeviationTypeEditor),
  },
  {
    path: 'types/:id',
    canActivate: [permissionGuard('deviations:admin', { redirectTo: '/deviations' })],
    loadComponent: () => import('./types/deviation-type-editor').then((m) => m.DeviationTypeEditor),
  },
  {
    path: ':id',
    loadComponent: () => import('./deviation-detail').then((m) => m.DeviationDetail),
  },
];

export default routes;
