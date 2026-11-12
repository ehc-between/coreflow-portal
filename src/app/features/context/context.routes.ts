import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { ContextKind } from './data/context.models';
import { KINDS, KIND_ORDER } from './context-kinds';

const toOverview = { redirectTo: '/context' };

/** list, new, :id, :id/edit for one record kind. */
function kindRoutes(kind: ContextKind): Routes {
  const data = { contextKind: kind };
  return [
    {
      path: KINDS[kind].segment,
      data,
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
        path: 'responsibilities/matrix',
        loadComponent: () => import('./raci/raci-matrix').then((m) => m.RaciMatrixPage),
      },
      ...KIND_ORDER.flatMap(kindRoutes),
    ],
  },
] satisfies Routes;
