import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { moduleConfigRedirect } from '../../core/modules/module-config';

const draft = permissionGuard('documents:draft', { redirectTo: '/documents' });
/** Every documents route provides the `documents` i18n scope (kept flat for route specs). */
const scope = [provideTranslocoScope('documents')];
const distribute = permissionGuard('documents:distribute', { redirectTo: '/documents' });
const approve = permissionGuard('documents:approve', { redirectTo: '/documents' });

/**
 * Documents feature routes (lazy-loaded; `app.routes.ts` already wraps the module
 * in `moduleGuard('documents')` + `permissionGuard('documents:read')`). The
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
        path: '',
        loadComponent: () => import('./documents-list').then((m) => m.DocumentsList),
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
      // U10: types, templates and retention rules are configuration (/settings/modules/documents).
      moduleConfigRedirect('types', 'documents'),
      moduleConfigRedirect('templates', 'documents'),
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
