import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { PERM_MANAGE, PERM_WRITE } from './data/feedback.models';

const toList = { redirectTo: '/feedback' };
const toSurveys = { redirectTo: '/feedback/surveys' };

/**
 * Customer feedback and satisfaction (M22, scope `feedback`). `app.routes.ts`
 * already gates the area on the `feedback` module and `feedback:read`; recording
 * feedback needs `feedback:write`, designing surveys `feedback:manage`. The
 * backend links records as `/feedback/items/<id>` and `/feedback/surveys/<id>`.
 * The public answer page (`/survey/<token>`) lives in `feedback-public.routes.ts`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('feedback')],
    children: [
      {
        path: '',
        loadComponent: () => import('./items/feedback-list').then((m) => m.FeedbackList),
      },
      { path: 'items', pathMatch: 'full', redirectTo: '' },
      {
        path: 'items/new',
        canActivate: [permissionGuard(PERM_WRITE, toList)],
        loadComponent: () => import('./items/feedback-new').then((m) => m.FeedbackNew),
      },
      {
        path: 'items/:id',
        loadComponent: () => import('./items/feedback-detail').then((m) => m.FeedbackDetail),
      },
      {
        path: 'items/:id/edit',
        canActivate: [permissionGuard(PERM_WRITE, toList)],
        loadComponent: () => import('./items/feedback-edit').then((m) => m.FeedbackEdit),
      },
      {
        path: 'insights',
        loadComponent: () => import('./insights/feedback-insights').then((m) => m.FeedbackInsights),
      },
      {
        path: 'surveys',
        loadComponent: () => import('./surveys/surveys-list').then((m) => m.SurveysList),
      },
      {
        path: 'surveys/new',
        canActivate: [permissionGuard(PERM_MANAGE, toSurveys)],
        loadComponent: () => import('./surveys/survey-new').then((m) => m.SurveyNew),
      },
      {
        path: 'surveys/:id',
        loadComponent: () => import('./surveys/survey-detail').then((m) => m.SurveyDetail),
      },
      {
        path: 'surveys/:id/edit',
        canActivate: [permissionGuard(PERM_MANAGE, toSurveys)],
        loadComponent: () => import('./surveys/survey-edit').then((m) => m.SurveyEdit),
      },
    ],
  },
] satisfies Routes;
