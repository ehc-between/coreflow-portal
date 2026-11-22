import { Routes } from '@angular/router';

/**
 * Bedriften (`/company`, docs/ia-v2.md §5.4 / §9.2): the area overview and its
 * Fagområder page. Not module-guarded: each card hides when its module is off.
 * `app.routes.ts` (SHELL) mounts this file and sets the area title.
 */
export default [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./company-page').then((m) => m.CompanyPage),
  },
  {
    path: 'topics',
    loadComponent: () => import('./company-topics-page').then((m) => m.CompanyTopicsPage),
  },
] satisfies Routes;
