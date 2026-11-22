import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { moduleConfigRedirect } from '../../core/modules/module-config';
import { kindToType } from '../documents-hub/kind-redirect';

const draft = permissionGuard('documents:draft', { redirectTo: '/documents' });
/** Every documents route provides the `documents` i18n scope (kept flat for route specs). */
const scope = [provideTranslocoScope('documents')];
const distribute = permissionGuard('documents:distribute', { redirectTo: '/documents' });
/** Everyone's read confirmations; without approve rights the user lands on their own list. */
const approve = permissionGuard('documents:approve', { redirectTo: '/documents/waiting' });

/**
 * Documents feature routes (lazy-loaded; `app.routes.ts` already wraps the module
 * in `moduleGuard('documents')` + `permissionGuard('documents:read')`). IA v2
 * (docs/ia-v2.md §5.6): `/documents` itself is the Dokumenter hub
 * (`features/documents-hub`, mounted by app.routes), so the full list lives at
 * `/documents/all` (a `?kind=` from the hub or the menu becomes the list's `?type=`),
 * next to the hub's sub-pages `templates` (read view), `archive` and `waiting`. The
 * section pages (list, master list, campaigns, external documents) show the section navigation (`app-documents-nav`) under
 * their header; a document's own pages (new, detail, editor, history) do not. Entity URLs from the backend:
 * `/documents/<id>`, `/documents/external/<id>`, `/documents/campaigns/<id>`, and
 * `/documents/types|templates|retention/<id>`, which redirect to their configuration
 * home under `/settings/modules/documents` (U10, `documents-config.routes.ts`).
 */
export default [
  {
    // The section pages (list, master list, distribution, external) each render the module navigation under their header.
    providers: scope,
    path: '',
    children: [
      {
        path: 'all',
        canActivate: [kindToType],
        loadComponent: () => import('./documents-list').then((m) => m.DocumentsList),
      },
      {
        // Dokumenter › Maler: pick a template to start from (editing stays in settings).
        path: 'templates',
        loadComponent: () =>
          import('../documents-hub/templates-page').then((m) => m.DocumentTemplatesPage),
      },
      {
        // Dokumenter › Arkiv: the locked, generated reports and minutes.
        path: 'archive',
        loadComponent: () =>
          import('../documents-hub/archive-page').then((m) => m.DocumentsArchivePage),
      },
      {
        // Dokumenter › Venter på deg: my approvals and read confirmations.
        path: 'waiting',
        loadComponent: () =>
          import('../documents-hub/waiting-page').then((m) => m.DocumentsWaitingPage),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./register/document-register').then((m) => m.DocumentRegisterPage),
      },
      {
        path: 'campaigns',
        canActivate: [distribute],
        loadComponent: () => import('./campaigns/campaign-list').then((m) => m.CampaignListPage),
      },
      {
        path: 'external',
        loadComponent: () => import('./external/external-list').then((m) => m.ExternalListPage),
      },
      // U10: types and retention rules are configuration (/settings/modules/documents);
      // a template's own URL still opens its settings page.
      moduleConfigRedirect('types', 'documents'),
      moduleConfigRedirect('retention', 'documents'),
    ],
  },
  {
    providers: scope,
    path: 'campaigns/new',
    canActivate: [distribute],
    loadComponent: () => import('./campaigns/campaign-form').then((m) => m.CampaignFormPage),
  },
  {
    providers: scope,
    path: 'campaigns/:id',
    canActivate: [distribute],
    loadComponent: () => import('./campaigns/campaign-detail').then((m) => m.CampaignDetailPage),
  },
  {
    providers: scope,
    path: 'external/new',
    canActivate: [draft],
    loadComponent: () => import('./external/external-form').then((m) => m.ExternalFormPage),
  },
  {
    providers: scope,
    path: 'external/:id/edit',
    canActivate: [draft],
    loadComponent: () => import('./external/external-form').then((m) => m.ExternalFormPage),
  },
  {
    providers: scope,
    path: 'external/:id',
    loadComponent: () => import('./external/external-detail').then((m) => m.ExternalDetailPage),
  },
  moduleConfigRedirect('types/new', 'documents'),
  moduleConfigRedirect('types/:id', 'documents'),
  moduleConfigRedirect('templates/new', 'documents'),
  moduleConfigRedirect('templates/:id', 'documents'),
  moduleConfigRedirect('retention/new', 'documents'),
  moduleConfigRedirect('retention/:id', 'documents'),
  {
    // U27: who has read and confirmed which document (people x documents).
    providers: scope,
    path: 'read-confirm',
    canActivate: [approve],
    loadComponent: () =>
      import('./read-confirm/read-confirm-matrix').then((m) => m.ReadConfirmMatrixPage),
  },
  {
    providers: scope,
    path: 'new',
    canActivate: [draft],
    loadComponent: () => import('./document-new').then((m) => m.DocumentNew),
  },
  {
    providers: scope,
    path: ':id/edit',
    canActivate: [draft],
    loadComponent: () => import('./editor/document-editor-page').then((m) => m.DocumentEditorPage),
  },
  {
    providers: scope,
    path: ':id/history',
    loadComponent: () => import('./history/document-history').then((m) => m.DocumentHistoryPage),
  },
  {
    providers: scope,
    path: ':id',
    loadComponent: () => import('./document-detail').then((m) => m.DocumentDetail),
  },
] satisfies Routes;
