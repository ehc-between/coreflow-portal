import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';

/**
 * Documents feature routes (lazy-loaded from app.routes, scoped to the current
 * org). The whole module is gated on `documents:read` upstream; authoring pages
 * additionally require `documents:draft` and send a denied user back to the list.
 */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./documents-list').then((m) => m.DocumentsList),
  },
  {
    path: 'new',
    canActivate: [permissionGuard('documents:draft', { redirectTo: '/documents' })],
    loadComponent: () => import('./document-new').then((m) => m.DocumentNew),
  },
  {
    path: ':id/edit',
    canActivate: [permissionGuard('documents:draft', { redirectTo: '/documents' })],
    loadComponent: () => import('./editor/document-editor-page').then((m) => m.DocumentEditorPage),
  },
  {
    path: ':id',
    loadComponent: () => import('./document-detail').then((m) => m.DocumentDetail),
  },
];

export default routes;
