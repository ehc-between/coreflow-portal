import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * Håndbok `/handbook` (IA v2 §5.8; scope `handbook`). `app.routes` gates the area on
 * the `processes` module and `processes:read` (fallback `/documents`).
 *
 * - `''`: the process map, with the tabs "Alle prosedyrer" (`?tab=procedures`) and
 *   "Venter på deg" (`?tab=waiting`);
 * - `:id`: a process: its steps, procedures, roles, risks and how it is going.
 *
 * The process register itself stays at `/processes/**` (`/processes` redirects here;
 * the full list is `/processes/all`).
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('handbook')],
    children: [
      {
        path: '',
        loadComponent: () => import('./handbook-page').then((m) => m.HandbookPage),
      },
      {
        path: ':id',
        loadComponent: () => import('./process-page').then((m) => m.HandbookProcessPage),
      },
    ],
  },
] satisfies Routes;
