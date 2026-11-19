import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toCourses = { redirectTo: '/training/courses' };
const OVERSEE = ['training:report', 'training:assign', 'training:manage'];

/**
 * `/training` (module `training`, scope `training`): training and courses (M11).
 * `app.routes.ts` already wraps this in `moduleGuard('training')` and
 * `permissionGuard('training:read')`. Entity URLs registered by the backend:
 * `/training/courses/<id>`, `/training/assignments/<id>`, `/training/records/<id>`,
 * `/training/people/<user id>` (matrix `users[].url`), `/training/plan`.
 * The register lands on Kurs (U08); the learner's own overview is `/training/mine`
 * and their open courses are in My Work ("Min opplæring").
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('training')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'courses' },
      {
        path: 'mine',
        loadComponent: () => import('./home/training-home').then((m) => m.TrainingHome),
      },
      {
        path: 'courses',
        loadComponent: () => import('./courses/course-list').then((m) => m.CourseList),
      },
      {
        path: 'courses/new',
        canActivate: [permissionGuard('training:write', toCourses)],
        loadComponent: () => import('./courses/course-editor').then((m) => m.CourseEditor),
      },
      {
        path: 'courses/:id',
        loadComponent: () => import('./courses/course-detail').then((m) => m.CourseDetailPage),
      },
      {
        path: 'courses/:id/edit',
        canActivate: [permissionGuard('training:write', toCourses)],
        loadComponent: () => import('./courses/course-editor').then((m) => m.CourseEditor),
      },
      {
        path: 'courses/:id/learn',
        loadComponent: () => import('./player/course-player').then((m) => m.CoursePlayer),
      },
      {
        path: 'assignments',
        loadComponent: () => import('./assignments/assignment-list').then((m) => m.AssignmentList),
      },
      {
        path: 'assignments/new',
        canActivate: [permissionGuard('training:assign', { redirectTo: '/training/assignments' })],
        loadComponent: () => import('./assignments/assignment-new').then((m) => m.AssignmentNew),
      },
      {
        path: 'assignments/:id',
        loadComponent: () =>
          import('./assignments/assignment-detail').then((m) => m.AssignmentDetail),
      },
      {
        path: 'records',
        loadComponent: () => import('./records/record-list').then((m) => m.RecordListPage),
      },
      {
        path: 'records/:id',
        loadComponent: () => import('./records/record-detail').then((m) => m.RecordDetail),
      },
      {
        path: 'records/:id/certificate',
        loadComponent: () => import('./records/certificate-page').then((m) => m.CertificatePage),
      },
      {
        path: 'matrix',
        canActivate: [permissionGuard(OVERSEE, { redirectTo: '/training' })],
        loadComponent: () => import('./matrix/training-matrix').then((m) => m.TrainingMatrix),
      },
      {
        path: 'plan',
        loadComponent: () => import('./plan/training-plan').then((m) => m.TrainingPlanPage),
      },
      {
        // A person's training profile: yourself, or anyone for people who oversee
        // training (the API answers 403 otherwise and the page says so).
        path: 'people/:userId',
        loadComponent: () => import('./people/person-training').then((m) => m.PersonTrainingPage),
      },
    ],
  },
] satisfies Routes;
