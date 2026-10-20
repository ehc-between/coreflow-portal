import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { workspaceMatcher } from './workspace/workspace-data';

/**
 * Old clause pages (`/standards/:key/clauses/:number?req=…`) now live inside
 * the workspace: redirect to that section, keeping `?req=` so the requirement
 * is still scrolled to and highlighted.
 */
export const legacyClauseRedirect: RedirectFunction = ({ params, queryParams }) =>
  inject(Router).createUrlTree(['/standards', params['key'], params['number']], {
    queryParams,
  });

/**
 * ISO & standards feature routes (lazy-loaded from app.routes, scoped to the
 * current org). The whole module is gated on `standards:read` upstream; manage
 * actions inside the pages are gated on `standards:manage`.
 *
 * - `''` — the overview (entry point).
 * - `:key` and `:key/:number` — the document workspace, one route config so
 *   moving between sections reuses the component.
 * - `:key/clauses/:number` — legacy, redirects into the workspace.
 */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./standards-overview').then((m) => m.StandardsOverview),
  },
  {
    path: ':key/clauses/:number',
    redirectTo: legacyClauseRedirect,
  },
  {
    matcher: workspaceMatcher,
    loadComponent: () => import('./workspace/standard-workspace').then((m) => m.StandardWorkspace),
  },
];

export default routes;
