import { Routes } from '@angular/router';

/**
 * The Dokumenter hub (`/documents` exactly, docs/ia-v2.md §5.6 / §9.2). `app.routes.ts`
 * (SHELL) mounts it unguarded with `pathMatch: 'full'` before the guarded documents
 * module routes (`features/documents/documents.routes.ts`, where the full list now
 * lives at `/documents/all`).
 */
export default [
  {
    path: '',
    loadComponent: () => import('./documents-hub').then((m) => m.DocumentsHub),
  },
] satisfies Routes;
