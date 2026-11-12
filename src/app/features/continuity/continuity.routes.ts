import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toOverview = { redirectTo: '/continuity' };
const canWrite = permissionGuard('continuity:write', toOverview);

/**
 * M20 business continuity and emergency (`/continuity`, gated on the `continuity`
 * module and `continuity:read` in app.routes): the overview, business impact
 * analyses, continuity plans (with their crisis contacts and exercise schedule),
 * exercises and tests, ICT readiness and the org-wide crisis contact list. The
 * backend links records as `/continuity/bias/<id>`, `/continuity/plans/<id>`,
 * `/continuity/exercises/<id>`, `/continuity/ict-systems/<id>` and
 * `/continuity/contacts` (or `/continuity/plans/<id>?tab=contacts`).
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('continuity')],
    children: [
      {
        path: '',
        loadComponent: () => import('./continuity-overview').then((m) => m.ContinuityOverview),
      },
      {
        path: 'bias',
        loadComponent: () => import('./bias/bia-list').then((m) => m.BiaList),
      },
      {
        path: 'bias/new',
        canActivate: [canWrite],
        loadComponent: () => import('./bias/bia-editor').then((m) => m.BiaEditor),
      },
      {
        path: 'bias/:id',
        loadComponent: () => import('./bias/bia-detail').then((m) => m.BiaDetailPage),
      },
      {
        path: 'bias/:id/edit',
        canActivate: [canWrite],
        loadComponent: () => import('./bias/bia-editor').then((m) => m.BiaEditor),
      },
      {
        path: 'plans',
        loadComponent: () => import('./plans/plan-list').then((m) => m.PlanList),
      },
      {
        path: 'plans/new',
        canActivate: [canWrite],
        loadComponent: () => import('./plans/plan-editor').then((m) => m.PlanEditor),
      },
      {
        path: 'plans/:id',
        loadComponent: () => import('./plans/plan-detail').then((m) => m.PlanDetailPage),
      },
      {
        path: 'plans/:id/edit',
        canActivate: [canWrite],
        loadComponent: () => import('./plans/plan-editor').then((m) => m.PlanEditor),
      },
      {
        path: 'exercises',
        loadComponent: () => import('./exercises/exercise-list').then((m) => m.ExerciseList),
      },
      {
        path: 'exercises/new',
        canActivate: [canWrite],
        loadComponent: () => import('./exercises/exercise-editor').then((m) => m.ExerciseEditor),
      },
      {
        path: 'exercises/:id',
        loadComponent: () =>
          import('./exercises/exercise-detail').then((m) => m.ExerciseDetailPage),
      },
      {
        path: 'exercises/:id/edit',
        canActivate: [canWrite],
        loadComponent: () => import('./exercises/exercise-editor').then((m) => m.ExerciseEditor),
      },
      {
        path: 'ict-systems',
        loadComponent: () => import('./ict/ict-list').then((m) => m.IctList),
      },
      {
        path: 'ict-systems/new',
        canActivate: [canWrite],
        loadComponent: () => import('./ict/ict-editor').then((m) => m.IctEditor),
      },
      {
        path: 'ict-systems/:id',
        loadComponent: () => import('./ict/ict-detail').then((m) => m.IctDetailPage),
      },
      {
        path: 'ict-systems/:id/edit',
        canActivate: [canWrite],
        loadComponent: () => import('./ict/ict-editor').then((m) => m.IctEditor),
      },
      {
        path: 'contacts',
        loadComponent: () =>
          import('./contacts/contacts-page').then((m) => m.ContinuityContactsPage),
      },
    ],
  },
] satisfies Routes;
