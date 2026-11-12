import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const write = permissionGuard('risk:write', { redirectTo: '/risk' });
const manage = permissionGuard('risk:manage', { redirectTo: '/risk' });

/**
 * M04 risk and opportunity management, and the Statement of Applicability
 * (lazy-loaded; `app.routes.ts` already wraps it in `moduleGuard('risk')` +
 * `permissionGuard('risk:read')`). Entity URLs from the backend:
 * `/risk/risks/<id>` (`?treatment=<id>`), `/risk/opportunities/<id>`,
 * `/risk/matrices/<id>`, `/risk/registers/<id>`, `/risk/soa/<key>?control=<ref>`.
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
      {
        path: 'soa',
        loadComponent: () => import('./soa/soa-index').then((m) => m.SoaIndexPage),
      },
      {
        path: 'soa/:key',
        loadComponent: () => import('./soa/soa-view').then((m) => m.SoaViewPage),
      },
      {
        path: 'registers',
        loadComponent: () => import('./registers/register-list').then((m) => m.RegisterListPage),
      },
      {
        path: 'registers/:id',
        loadComponent: () =>
          import('./registers/register-detail').then((m) => m.RegisterDetailPage),
      },
      {
        path: 'matrices',
        loadComponent: () => import('./matrices/matrix-list').then((m) => m.MatrixListPage),
      },
      {
        path: 'matrices/new',
        canActivate: [manage],
        loadComponent: () => import('./matrices/matrix-editor').then((m) => m.MatrixEditorPage),
      },
      {
        path: 'matrices/:id',
        loadComponent: () => import('./matrices/matrix-editor').then((m) => m.MatrixEditorPage),
      },
    ],
  },
] satisfies Routes;
