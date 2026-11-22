import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * Meld fra (IA v2 §5.2). Mounted at `/speak-up` by `app.routes.ts` without a guard:
 * the page offers only the types the caller may file (quick create `available`).
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('speakup')],
    loadComponent: () => import('./speak-up-page').then((m) => m.SpeakUpPage),
  },
] satisfies Routes;
