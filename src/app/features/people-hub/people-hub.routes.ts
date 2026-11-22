import { Routes } from '@angular/router';

/**
 * The Folk hub (`/people` exactly, docs/ia-v2.md §5.5 / §9.2). `app.routes.ts` (SHELL)
 * mounts it unguarded with `pathMatch: 'full'` before the guarded people module
 * routes (`features/people/people.routes.ts`).
 */
export default [
  {
    path: '',
    loadComponent: () => import('./people-hub').then((m) => m.PeopleHub),
  },
] satisfies Routes;
