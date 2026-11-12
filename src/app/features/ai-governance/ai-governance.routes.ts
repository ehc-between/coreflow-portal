import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const write = (redirectTo: string) => permissionGuard('ai_governance:write', { redirectTo });

/**
 * `/ai-governance` (scope `ai-governance`, alias `aiGovernance`): AI
 * governance for ISO/IEC 42001 and the EU AI Act. `app.routes.ts` already
 * wraps the module in `moduleGuard('ai_governance')` and
 * `permissionGuard('ai_governance:read')`; pages that change records also
 * need `ai_governance:write`. Entity URLs registered by the backend:
 * `/ai-governance/systems/<id>` and `/ai-governance/assessments/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('ai-governance')],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./overview/ai-governance-overview').then((m) => m.AiGovernanceOverviewPage),
      },
      {
        path: 'systems',
        loadComponent: () => import('./systems/systems-list').then((m) => m.AiSystemsList),
      },
      {
        path: 'systems/new',
        canActivate: [write('/ai-governance/systems')],
        loadComponent: () => import('./systems/system-form').then((m) => m.AiSystemForm),
      },
      {
        path: 'systems/:id',
        loadComponent: () => import('./systems/system-detail').then((m) => m.AiSystemDetail),
      },
      {
        path: 'systems/:id/edit',
        canActivate: [write('/ai-governance/systems')],
        loadComponent: () => import('./systems/system-form').then((m) => m.AiSystemForm),
      },
      {
        path: 'systems/:id/classify',
        canActivate: [write('/ai-governance/systems')],
        loadComponent: () =>
          import('./classification/classification-wizard').then((m) => m.ClassificationWizard),
      },
      {
        path: 'systems/:id/documentation',
        loadComponent: () =>
          import('./systems/technical-documentation').then((m) => m.AiTechnicalDocumentation),
      },
      {
        path: 'assessments',
        loadComponent: () =>
          import('./assessments/assessments-list').then((m) => m.AiAssessmentsList),
      },
      {
        path: 'assessments/new',
        canActivate: [write('/ai-governance/assessments')],
        loadComponent: () => import('./assessments/assessment-new').then((m) => m.AiAssessmentNew),
      },
      {
        path: 'assessments/:id',
        loadComponent: () =>
          import('./assessments/assessment-detail').then((m) => m.AiAssessmentDetail),
      },
      {
        path: 'assessments/:id/edit',
        canActivate: [write('/ai-governance/assessments')],
        loadComponent: () =>
          import('./assessments/assessment-edit').then((m) => m.AiAssessmentEdit),
      },
      {
        path: 'literacy',
        loadComponent: () => import('./literacy/literacy-page').then((m) => m.AiLiteracyPage),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/ai-governance-settings').then((m) => m.AiGovernanceSettingsPage),
      },
    ],
  },
] satisfies Routes;
