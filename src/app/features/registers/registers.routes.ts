import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * Registre (`/registers`, shell v2 / U03): every register the user can open,
 * grouped by job area. No guard of its own: each register keeps its module and
 * permission guards, and the hub lists only what the user may open. U04 grows it
 * into the full locations-backed hub (counts, "sist oppdatert", folded registers).
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('shell')],
    loadComponent: () => import('./registers-hub').then((m) => m.RegistersHub),
  },
] satisfies Routes;
