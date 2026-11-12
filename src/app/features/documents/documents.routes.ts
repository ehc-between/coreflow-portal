import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const draft = permissionGuard('documents:draft', { redirectTo: '/documents' });
const manage = permissionGuard('documents:manage', { redirectTo: '/documents' });
/** Every documents route provides the `documents` i18n scope (kept flat for route specs). */
const scope = [provideTranslocoScope('documents')];
const distribute = permissionGuard('documents:distribute', { redirectTo: '/documents' });

/**
 * Documents feature routes (lazy-loaded; `app.routes.ts` already wraps the module
 * in `moduleGuard('documents')` + `permissionGuard('documents:read')`). The
 * section pages (list, master list, campaigns, external documents, types,
 * templates, retention) share the section navigation; a document's own pages
 * (new, detail, editor, history) do not. Entity URLs from the backend:
 * `/documents/<id>`, `/documents/types/<id>`, `/documents/templates/<id>`,
 * `/documents/retention/<id>`, `/documents/external/<id>`, `/documents/campaigns/<id>`.
 */
export default [
  {
    providers: scope,
    path: '',
    loadComponent: () => import('./shared/documents-shell').then((m) => m.DocumentsShell),
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
      {
        path: 'types',
        loadComponent: () =>
          import('./types/document-type-list').then((m) => m.DocumentTypeListPage),
      },
      {
        path: 'templates',
        loadComponent: () => import('./templates/template-list').then((m) => m.TemplateListPage),
      },
      {
        path: 'retention',
        loadComponent: () => import('./retention/retention-list').then((m) => m.RetentionListPage),
      },
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
  {
    providers: scope,
    path: 'types/new',
    canActivate: [manage],
    loadComponent: () => import('./types/document-type-form').then((m) => m.DocumentTypeFormPage),
  },
  {
    providers: scope,
    path: 'types/:id',
    loadComponent: () => import('./types/document-type-form').then((m) => m.DocumentTypeFormPage),
  },
  {
    providers: scope,
    path: 'templates/new',
    canActivate: [manage],
    loadComponent: () => import('./templates/template-form').then((m) => m.TemplateFormPage),
  },
  {
    providers: scope,
    path: 'templates/:id',
    loadComponent: () => import('./templates/template-form').then((m) => m.TemplateFormPage),
  },
  {
    providers: scope,
    path: 'retention/new',
    canActivate: [manage],
    loadComponent: () => import('./retention/retention-form').then((m) => m.RetentionFormPage),
  },
  {
    providers: scope,
    path: 'retention/:id',
    loadComponent: () => import('./retention/retention-form').then((m) => m.RetentionFormPage),
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
