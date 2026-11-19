import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ContextKind } from './data/context.models';
import { KINDS, KIND_ORDER } from './context-kinds';

const toOverview = { redirectTo: '/context' };

/**
 * U16 — one policy concept: policies are controlled documents, so the policy list is
 * the documents list filtered by type. Falls back to the context list when the
 * documents module is off or the user cannot read documents.
 */
export const policiesToDocuments: CanActivateFn = (route) => {
  const modules = inject(ModuleService);
  const permissions = inject(SelectedOrgService).currentOrg()?.permissions ?? [];
  if (modules.isEnabled('documents') && permissions.includes('documents:read')) {
    // Keep the list filters of the link (e.g. `?status=approved` from an overview tile).
    const status = route.queryParamMap.get('status');
    return inject(Router).createUrlTree(['/documents'], {
      queryParams: { type: 'policy', ...(status ? { status } : {}) },
    });
  }
  return true;
};

/** list, new, :id, :id/edit for one record kind. */
function kindRoutes(kind: ContextKind): Routes {
  const data = { contextKind: kind };
  return [
    {
      path: KINDS[kind].segment,
      data,
      ...(kind === 'policy' ? { canActivate: [policiesToDocuments] } : {}),
      loadComponent: () => import('./list/context-list').then((m) => m.ContextList),
    },
    {
      path: `${KINDS[kind].segment}/new`,
      data,
      canActivate: [permissionGuard('context:write', toOverview)],
      loadComponent: () => import('./form/context-form').then((m) => m.ContextForm),
    },
    {
      path: `${KINDS[kind].segment}/:id`,
      data,
      loadComponent: () => import('./detail/context-detail').then((m) => m.ContextDetail),
    },
    {
      path: `${KINDS[kind].segment}/:id/edit`,
      data,
      canActivate: [permissionGuard('context:write', toOverview)],
      loadComponent: () => import('./form/context-form').then((m) => m.ContextForm),
    },
  ];
}

/**
 * `/context` (module `context`, scope `context`): M01 context of the
 * organisation and leadership (ISO HS 4.1-4.3, 5.1-5.3). `app.routes.ts` already
 * gates the module on `moduleGuard('context')` + `context:read`; creating and
 * editing need `context:write`. Detail URLs match the backend's
 * `/context/<segment>/<id>` (analyses, interested-parties, scopes, policies,
 * responsibilities).
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('context')],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./overview/context-overview').then((m) => m.ContextOverviewPage),
      },
      {
        // U34: the beginner's four-question interview (drafts analysis, parties, scope).
        path: 'interview',
        canActivate: [permissionGuard('context:write', toOverview)],
        loadComponent: () =>
          import('./interview/context-interview').then((m) => m.ContextInterviewPage),
      },
      {
        path: 'responsibilities/matrix',
        loadComponent: () => import('./raci/raci-matrix').then((m) => m.RaciMatrixPage),
      },
      ...KIND_ORDER.flatMap(kindRoutes),
    ],
  },
] satisfies Routes;
