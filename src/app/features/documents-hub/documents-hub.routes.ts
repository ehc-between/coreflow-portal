import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';

/**
 * A filtered list link to the old list URL (`/documents?status=…`, `?review=due`,
 * `?customer_id=…` from the customer card, requirement-location links, `?kind=` / `?type=`)
 * still opens the list, now at `/documents/all`, with its filters. The hub itself takes
 * no query parameters.
 */
export const filteredListToAll: CanActivateFn = (route) =>
  Object.keys(route.queryParams).length
    ? inject(Router).createUrlTree(['/documents/all'], {
        queryParams: route.queryParams,
        fragment: route.fragment ?? undefined,
      })
    : true;

/**
 * The Dokumenter hub (`/documents` exactly, docs/ia-v2.md §5.6 / §9.2). `app.routes.ts`
 * (SHELL) mounts it unguarded with `pathMatch: 'full'` before the guarded documents
 * module routes (`features/documents/documents.routes.ts`, where the full list now
 * lives at `/documents/all`).
 */
export default [
  {
    path: '',
    canActivate: [filteredListToAll],
    loadComponent: () => import('./documents-hub').then((m) => m.DocumentsHub),
  },
] satisfies Routes;
