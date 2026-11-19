import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { moduleConfigRedirect } from '../../core/modules/module-config';

const write = permissionGuard('risk:write', { redirectTo: '/risk' });

/** `/risk/soa/<key>?control=…` -> `/standards/<key>/soa?control=…` (U17). */
export const soaRedirect: RedirectFunction = ({ params, queryParams }) =>
  inject(Router).createUrlTree(['/standards', params['key'], 'soa'], { queryParams });

/**
 * M04 risk and opportunity management, and the Statement of Applicability
 * (lazy-loaded; `app.routes.ts` already wraps it in `moduleGuard('risk')` +
 * `permissionGuard('risk:read')`). Entity URLs from the backend:
 * `/risk/risks/<id>` (`?treatment=<id>`), `/risk/opportunities/<id>`,
 * `/risk/matrices/<id>`, `/risk/registers/<id>` (both redirect to `/settings/modules/risk/…`),
 * `/risk/soa[/<key>]` redirects to `/standards/soa` / `/standards/<key>/soa` (U17).
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('risk')],
    loadComponent: () => import('./risk-shell').then((m) => m.RiskShell),
    children: [
      {
        path: '',
        loadComponent: () => import('./overview/risk-overview').then((m) => m.RiskOverviewPage),
      },
      {
        path: 'risks',
        loadComponent: () => import('./risks/risk-list').then((m) => m.RiskListPage),
      },
      {
        path: 'risks/new',
        canActivate: [write],
        loadComponent: () => import('./risks/risk-form').then((m) => m.RiskFormPage),
      },
      {
        path: 'risks/:id',
        loadComponent: () => import('./risks/risk-detail').then((m) => m.RiskDetailPage),
      },
      {
        path: 'risks/:id/edit',
        canActivate: [write],
        loadComponent: () => import('./risks/risk-form').then((m) => m.RiskFormPage),
      },
      {
        // U24: the org-wide treatment plan behind the "Open treatments" tile.
        path: 'treatments',
        loadComponent: () =>
          import('./risks/treatment-plan-list').then((m) => m.TreatmentPlanListPage),
      },
      {
        path: 'opportunities',
        loadComponent: () =>
          import('./opportunities/opportunity-list').then((m) => m.OpportunityListPage),
      },
      {
        path: 'opportunities/new',
        canActivate: [write],
        loadComponent: () =>
          import('./opportunities/opportunity-form').then((m) => m.OpportunityFormPage),
      },
      {
        path: 'opportunities/:id',
        loadComponent: () =>
          import('./opportunities/opportunity-detail').then((m) => m.OpportunityDetailPage),
      },
      {
        path: 'opportunities/:id/edit',
        canActivate: [write],
        loadComponent: () =>
          import('./opportunities/opportunity-form').then((m) => m.OpportunityFormPage),
      },
      // U17: the Statement of Applicability moved to the standard page.
      { path: 'soa', pathMatch: 'full', redirectTo: '/standards/soa' },
      { path: 'soa/:key', redirectTo: soaRedirect },
      // U10: registers and matrices are configuration, under /settings/modules/risk.
      moduleConfigRedirect('registers', 'risk'),
      moduleConfigRedirect('registers/:id', 'risk'),
      moduleConfigRedirect('matrices', 'risk'),
      moduleConfigRedirect('matrices/new', 'risk'),
      moduleConfigRedirect('matrices/:id', 'risk'),
    ],
  },
] satisfies Routes;
