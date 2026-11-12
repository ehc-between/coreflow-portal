import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const writeGuard = (redirectTo: string) => permissionGuard('objectives:write', { redirectTo });

/**
 * Objectives, KPIs and measurement (M08), lazy-loaded from app.routes where the
 * whole area is gated on module `objectives` and `objectives:read`. Creating and
 * editing need `objectives:write`; a denied user goes back to the list. The
 * backend links records as `/objectives/<id>` and `/objectives/kpis/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('objectives')],
    children: [
      {
        path: '',
        loadComponent: () => import('./objectives-list').then((m) => m.ObjectivesList),
      },
      {
        path: 'new',
        canActivate: [writeGuard('/objectives')],
        loadComponent: () => import('./objective-editor').then((m) => m.ObjectiveEditor),
      },
      {
        path: 'kpis',
        loadComponent: () => import('./kpis-list').then((m) => m.KpisList),
      },
      {
        path: 'kpis/new',
        canActivate: [writeGuard('/objectives/kpis')],
        loadComponent: () => import('./kpi-editor').then((m) => m.KpiEditor),
      },
      {
        path: 'kpis/:id',
        loadComponent: () => import('./kpi-detail').then((m) => m.KpiDetail),
      },
      {
        path: 'kpis/:id/edit',
        canActivate: [writeGuard('/objectives/kpis')],
        loadComponent: () => import('./kpi-editor').then((m) => m.KpiEditor),
      },
      {
        path: ':id',
        loadComponent: () => import('./objective-detail').then((m) => m.ObjectiveDetail),
      },
      {
        path: ':id/edit',
        canActivate: [writeGuard('/objectives')],
        loadComponent: () => import('./objective-editor').then((m) => m.ObjectiveEditor),
      },
    ],
  },
] satisfies Routes;
