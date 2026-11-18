import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toList = { redirectTo: '/settings/modules/suppliers/questionnaires' };

/**
 * `/settings/modules/suppliers` (U10): questionnaire templates for supplier
 * evaluations, the suppliers module's configuration. `module-config.routes` gates
 * the area on the module and `suppliers:read`; editing needs `suppliers:manage`.
 * The old `/suppliers/questionnaires*` URLs redirect here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('suppliers')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'questionnaires' },
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
    ],
  },
] satisfies Routes;
