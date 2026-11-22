import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { libraryRootTarget, moved, toReportsWhenReachable } from './library-redirects';

/**
 * `/library` (U11 "Dokumenter og rapporter") is now Rapporter (IA v2 §7): every old
 * URL redirects under `/reports`, query string kept.
 *
 * The catalogue, the archive and a generated file were open to every member, while
 * the pages under `/reports` need the Reports module. For a caller who cannot open
 * them, these three keep rendering here (`toReportsWhenReachable`), so links in
 * e-mails and backend `url` fields (`/library/generated/{id}`) still work.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('outputs', 'reports')],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'outputs.title',
        canActivate: [toReportsWhenReachable(libraryRootTarget)],
        loadComponent: () => import('./library-outputs').then((m) => m.LibraryOutputs),
      },
      {
        path: 'saved',
        title: 'outputs.saved.title',
        canActivate: [toReportsWhenReachable(() => ['/reports/saved'])],
        loadComponent: () => import('./generated-list').then((m) => m.GeneratedListPage),
      },
      {
        path: 'generated/:id',
        title: 'outputs.generated.title',
        canActivate: [toReportsWhenReachable((r) => ['/reports/generated', r.params['id']])],
        loadComponent: () => import('./generated-detail').then((m) => m.GeneratedDetailPage),
      },
      { path: 'registers', redirectTo: moved(() => ['/reports/exports']) },
      { path: 'reports', pathMatch: 'full', redirectTo: moved(() => ['/reports/custom']) },
      { path: 'reports/new', redirectTo: moved(() => ['/reports/custom/new']) },
      {
        // Full match: a prefix match would also swallow `reports/:id/edit` and drop `/edit`.
        path: 'reports/:id',
        pathMatch: 'full',
        redirectTo: moved((p) => ['/reports/custom', p['id']]),
      },
      {
        path: 'reports/:id/edit',
        redirectTo: moved((p) => ['/reports/custom', p['id'], 'edit']),
      },
      { path: 'audit-packs', pathMatch: 'full', redirectTo: moved(() => ['/reports/audit-packs']) },
      {
        path: 'audit-packs/:id',
        redirectTo: moved((p) => ['/reports/audit-packs', p['id']]),
      },
    ],
  },
] satisfies Routes;
