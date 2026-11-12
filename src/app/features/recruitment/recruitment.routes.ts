import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toList = { redirectTo: '/recruitment' };

/**
 * `/recruitment` (scope `recruitment`, M10): job requisitions with approval, the
 * candidate pipeline, interviews, scorecards, background checks, offers and GDPR
 * retention. `app.routes.ts` already wraps the module in `moduleGuard('recruitment')`
 * and `permissionGuard('recruitment:read')`; creating and editing need
 * `recruitment:write`, the GDPR settings `recruitment:manage`. Entity URLs the
 * backend registers: `/recruitment/requisitions/<id>`, `/recruitment/candidates/<id>`
 * and `/recruitment/applications/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('recruitment')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'requisitions' },
      {
        path: 'requisitions',
        loadComponent: () =>
          import('./requisitions/requisitions-list').then((m) => m.RequisitionsList),
      },
      {
        path: 'requisitions/new',
        canActivate: [permissionGuard('recruitment:write', toList)],
        loadComponent: () =>
          import('./requisitions/requisition-form').then((m) => m.RequisitionForm),
      },
      {
        path: 'requisitions/:id',
        loadComponent: () =>
          import('./requisitions/requisition-detail').then((m) => m.RequisitionDetailPage),
      },
      {
        path: 'requisitions/:id/edit',
        canActivate: [permissionGuard('recruitment:write', toList)],
        loadComponent: () =>
          import('./requisitions/requisition-form').then((m) => m.RequisitionForm),
      },
      {
        path: 'requisitions/:id/pipeline',
        loadComponent: () => import('./requisitions/pipeline-board').then((m) => m.PipelineBoard),
      },
      {
        path: 'candidates',
        loadComponent: () => import('./candidates/candidates-list').then((m) => m.CandidatesList),
      },
      {
        path: 'candidates/new',
        canActivate: [permissionGuard('recruitment:write', toList)],
        loadComponent: () => import('./candidates/candidate-form').then((m) => m.CandidateForm),
      },
      {
        path: 'candidates/:id',
        loadComponent: () =>
          import('./candidates/candidate-detail').then((m) => m.CandidateDetailPage),
      },
      {
        path: 'candidates/:id/edit',
        canActivate: [permissionGuard('recruitment:write', toList)],
        loadComponent: () => import('./candidates/candidate-form').then((m) => m.CandidateForm),
      },
      {
        path: 'applications',
        loadComponent: () =>
          import('./applications/applications-list').then((m) => m.ApplicationsList),
      },
      {
        path: 'applications/new',
        canActivate: [permissionGuard('recruitment:write', toList)],
        loadComponent: () => import('./applications/application-new').then((m) => m.ApplicationNew),
      },
      {
        path: 'applications/:id',
        loadComponent: () =>
          import('./applications/application-detail').then((m) => m.ApplicationDetailPage),
      },
      {
        path: 'settings',
        canActivate: [permissionGuard('recruitment:manage', toList)],
        loadComponent: () =>
          import('./settings/recruitment-settings').then((m) => m.RecruitmentSettingsPage),
      },
    ],
  },
] satisfies Routes;
