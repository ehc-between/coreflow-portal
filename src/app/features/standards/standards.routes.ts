import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { moduleGuard } from '../../core/modules/module.service';
import { workspaceMatcher } from './workspace/workspace-data';

/**
 * Old clause pages (`/standards/:key/clauses/:number?req=…`) now live inside
 * the workspace: redirect to that section, keeping `?req=` so the requirement
 * is still scrolled to and highlighted.
 */
export const legacyClauseRedirect: RedirectFunction = ({ params, queryParams }) =>
  inject(Router).createUrlTree(
    ['/standards', params['key'], ...(params['number'] ? [params['number']] : [])],
    { queryParams },
  );

/**
 * ISO & standards feature routes (lazy-loaded from app.routes, scoped to the
 * current org). The whole module is gated on `standards:read` upstream; manage
 * actions inside the pages are gated on `standards:manage`.
 *
 * Everything shares the `standards` Transloco scope (`assets/i18n/standards/<lang>.json`)
 * for the framework, readiness and learning-mode strings.
 *
 * - `''` — the overview of every framework (entry point).
 * - `readiness` — requirement coverage per enabled standard.
 * - `journey/:framework` — the guided journey of a framework (P5).
 * - `gaps/:key` — the uncovered requirements of one standard and how to close them.
 * - `soa` and `:key/soa` — the Statement of Applicability (U17, moved from `/risk/soa`).
 * - `:key` and `:key/:number` — the document workspace, one route config so
 *   moving between sections reuses the component.
 * - `:key/clauses[/:number]` — legacy, redirects into the workspace.
 */
const pages: Routes = [
  {
    path: '',
    loadComponent: () => import('./standards-overview').then((m) => m.StandardsOverview),
  },
  {
    // Before the workspace matcher, which would read "readiness" as a standard key.
    path: 'readiness',
    loadComponent: () => import('./frameworks/readiness-page').then((m) => m.ReadinessPage),
  },
  {
    // P5 guided journey ("Bli klar for ISO 27001"): the one agreed cross-item route
    // (polish plan §2.6). The page lives in features/dashboard and loads the `home` scope.
    path: 'journey/:framework',
    loadComponent: () => import('../dashboard/journey/journey-page').then((m) => m.JourneyPage),
  },
  {
    // Gaps of one enabled standard, with what would close each one. Before the matcher.
    path: 'gaps/:key',
    loadComponent: () => import('./gaps/gaps-page').then((m) => m.GapsPage),
  },
  {
    // U17: the Statement of Applicability lives on the standard page (it was
    // `/risk/soa`, which redirects here). The pages belong to the risk module: they
    // need the risk module and `risk:read`, and load the risk translation scope.
    path: 'soa',
    canActivate: [moduleGuard('risk'), permissionGuard('risk:read')],
    providers: [provideTranslocoScope('standards', 'risk')],
    loadComponent: () => import('../risk/soa/soa-index').then((m) => m.SoaIndexPage),
  },
  {
    path: ':key/soa',
    canActivate: [moduleGuard('risk'), permissionGuard('risk:read')],
    providers: [provideTranslocoScope('standards', 'risk')],
    loadComponent: () => import('../risk/soa/soa-view').then((m) => m.SoaViewPage),
  },
  {
    path: ':key/clauses/:number',
    redirectTo: legacyClauseRedirect,
  },
  {
    // The old clause list without a number: the top of the workspace.
    path: ':key/clauses',
    redirectTo: legacyClauseRedirect,
  },
  {
    matcher: workspaceMatcher,
    loadComponent: () => import('./workspace/standard-workspace').then((m) => m.StandardWorkspace),
  },
];

const routes: Routes = [
  {
    path: '',
    providers: [provideTranslocoScope('standards')],
    children: pages,
  },
];

export default routes;
