import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * The Rapporter hub (`/reports`, IA v2 §5.9 / §9.2): open to every member (no module
 * gate). app.routes mounts it at `/reports` with `pathMatch: 'full'`, before the Reports
 * module pages (`reports.routes.ts`).
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('reports', 'outputs')],
    loadComponent: () => import('./hub/reports-hub').then((m) => m.ReportsHub),
  },
] satisfies Routes;
