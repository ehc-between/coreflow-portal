import { Routes } from '@angular/router';

/**
 * STUB (IA v2 §9.2, owned by OVERSIKT): until the new Oversikt page lands, `/home`
 * shows the existing dashboard. OVERSIKT replaces this file; its version wins on merge.
 */
export default [
  { path: '', loadChildren: () => import('../dashboard/dashboard.routes') },
] satisfies Routes;
