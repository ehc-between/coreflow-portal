import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toAspects = { redirectTo: '/environment/aspects' };
const toPlans = { redirectTo: '/environment/emergency-plans' };
const toMetrics = { redirectTo: '/environment/metrics' };

/**
 * Environmental management (M17, ISO 14001; scope `environment`). `app.routes.ts`
 * already gates the area on the `environment` module and `environment:read`;
 * creating and editing need `environment:write`, the scoring method
 * `environment:manage`. The backend links records as `/environment/aspects/<id>`,
 * `/environment/emergency-plans/<id>[?drill=<id>]` and
 * `/environment/metrics/<id>[?measurement=<id>]`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('environment')],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./environment-overview').then((m) => m.EnvironmentOverviewPage),
      },
      {
        path: 'aspects',
        loadComponent: () => import('./aspects-list').then((m) => m.AspectsList),
      },
      {
        path: 'aspects/new',
        canActivate: [permissionGuard('environment:write', toAspects)],
        loadComponent: () => import('./aspect-editor').then((m) => m.AspectEditor),
      },
      {
        path: 'aspects/:id',
        loadComponent: () => import('./aspect-detail').then((m) => m.AspectDetail),
      },
      {
        path: 'aspects/:id/edit',
        canActivate: [permissionGuard('environment:write', toAspects)],
        loadComponent: () => import('./aspect-editor').then((m) => m.AspectEditor),
      },
      {
        path: 'emergency-plans',
        loadComponent: () => import('./plans-list').then((m) => m.PlansList),
      },
      {
        path: 'emergency-plans/new',
        canActivate: [permissionGuard('environment:write', toPlans)],
        loadComponent: () => import('./plan-editor').then((m) => m.PlanEditor),
      },
      {
        path: 'emergency-plans/:id',
        loadComponent: () => import('./plan-detail').then((m) => m.PlanDetail),
      },
      {
        path: 'emergency-plans/:id/edit',
        canActivate: [permissionGuard('environment:write', toPlans)],
        loadComponent: () => import('./plan-editor').then((m) => m.PlanEditor),
      },
      {
        path: 'metrics',
        loadComponent: () => import('./metrics-list').then((m) => m.MetricsList),
      },
      {
        path: 'metrics/new',
        canActivate: [permissionGuard('environment:write', toMetrics)],
        loadComponent: () => import('./metric-editor').then((m) => m.MetricEditor),
      },
      {
        path: 'metrics/:id',
        loadComponent: () => import('./metric-detail').then((m) => m.MetricDetail),
      },
      {
        path: 'metrics/:id/edit',
        canActivate: [permissionGuard('environment:write', toMetrics)],
        loadComponent: () => import('./metric-editor').then((m) => m.MetricEditor),
      },
      {
        path: 'emissions',
        loadComponent: () => import('./emissions-page').then((m) => m.EmissionsPage),
      },
      {
        path: 'scoring',
        canActivate: [permissionGuard('environment:manage', { redirectTo: '/environment' })],
        loadComponent: () => import('./scoring-settings').then((m) => m.ScoringSettings),
      },
    ],
  },
] satisfies Routes;
