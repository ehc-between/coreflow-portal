import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toList = { redirectTo: '/suppliers' };

/**
 * M13 suppliers and third parties (`/suppliers`, gated on the `suppliers` module and
 * `suppliers:read` in app.routes): the supplier register, evaluations with their
 * questionnaires and decisions, questionnaire templates and the performance log.
 * The backend links records as `/suppliers/<id>` and
 * `/suppliers/<id>/evaluations/<evaluation id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('suppliers')],
    children: [
      {
        path: '',
        loadComponent: () => import('./suppliers-list').then((m) => m.SuppliersList),
      },
      {
        path: 'new',
        canActivate: [permissionGuard('suppliers:write', toList)],
        loadComponent: () => import('./supplier-new').then((m) => m.SupplierNew),
      },
      {
        path: 'evaluations',
        loadComponent: () =>
          import('./evaluations/evaluations-list').then((m) => m.EvaluationsList),
      },
      {
        path: 'questionnaires',
        loadComponent: () =>
          import('./questionnaires/questionnaires-list').then((m) => m.QuestionnairesList),
      },
      {
        path: 'questionnaires/new',
        canActivate: [permissionGuard('suppliers:manage', toList)],
        loadComponent: () =>
          import('./questionnaires/questionnaire-editor').then((m) => m.QuestionnaireEditor),
      },
      {
        path: 'questionnaires/:qid/edit',
        canActivate: [permissionGuard('suppliers:manage', toList)],
        loadComponent: () =>
          import('./questionnaires/questionnaire-editor').then((m) => m.QuestionnaireEditor),
      },
      {
        path: ':id',
        loadComponent: () => import('./supplier-detail').then((m) => m.SupplierDetailPage),
      },
      {
        path: ':id/edit',
        canActivate: [permissionGuard('suppliers:write', toList)],
        loadComponent: () => import('./supplier-edit').then((m) => m.SupplierEdit),
      },
      {
        path: ':id/evaluations/:eid',
        loadComponent: () =>
          import('./evaluations/evaluation-detail').then((m) => m.EvaluationDetailPage),
      },
    ],
  },
] satisfies Routes;
