import { Routes } from '@angular/router';

/** Documents feature routes (lazy-loaded from app.routes, scoped to the current org). */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./documents-list').then((m) => m.DocumentsList),
  },
  {
    path: 'new',
    loadComponent: () => import('./document-new').then((m) => m.DocumentNew),
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./editor/document-editor-page').then((m) => m.DocumentEditorPage),
  },
  {
    path: ':id',
    loadComponent: () => import('./document-detail').then((m) => m.DocumentDetail),
  },
];

export default routes;
