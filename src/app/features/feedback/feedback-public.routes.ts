import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * The public survey page (M22), mounted at `/survey` outside the signed-in shell:
 * `/survey/<token>` (the `public_path` the backend hands out).
 */
export default [
  {
    path: ':token',
    providers: [provideTranslocoScope('feedback')],
    loadComponent: () => import('./public/public-survey').then((m) => m.PublicSurveyPage),
  },
] satisfies Routes;
