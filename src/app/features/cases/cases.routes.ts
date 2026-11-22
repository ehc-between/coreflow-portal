import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * Saker (IA v2 §5.2): everything that was reported, in one list. Mounted at `/cases`
 * by `app.routes.ts` without a guard; `GET /cases` applies each source module's
 * permission and record visibility. Query: `?tab=open|mine|closed&type=&q=`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('speakup')],
    loadComponent: () => import('./cases-page').then((m) => m.CasesPage),
  },
] satisfies Routes;
