import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/** Learning centre routes, mounted at `/account/learning` (scope `guidance`). */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('guidance')],
    children: [
      {
        path: '',
        loadComponent: () => import('./learning-centre').then((m) => m.LearningCentre),
      },
      {
        path: ':scope/:lesson',
        loadComponent: () => import('./lesson-page').then((m) => m.LessonPage),
      },
    ],
  },
] satisfies Routes;
