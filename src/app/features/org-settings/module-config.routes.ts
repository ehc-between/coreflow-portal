import { Route, Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { orgManageGuard, settingsGuard } from '../../core/auth/org-manage.guard';
import { permissionGuard } from '../../core/auth/permission.guard';
import { moduleGuard } from '../../core/modules/module.service';

/**
 * `/settings/modules`: which modules the organisation uses (`''`), and each module's
 * configuration (U10, `/settings/modules/<slug>/…`). A module area is guarded like
 * the module itself (enabled + `<key>:read`), not by the Settings guard, so a
 * module manager without `org:manage` still reaches it through the gear on the
 * module's pages; each page keeps its own stricter guard. The module's routes file
 * redirects its old configuration URLs here.
 */
function configArea(
  slug: string,
  key: string,
  loadChildren: NonNullable<Route['loadChildren']>,
): Route {
  return {
    path: slug,
    title: `modules.names.${key}`,
    canActivate: [moduleGuard(key), permissionGuard(`${key}:read`)],
    loadChildren,
  };
}

export default [
  {
    path: '',
    pathMatch: 'full',
    title: 'nav.settings',
    canActivate: [settingsGuard, orgManageGuard],
    providers: [provideTranslocoScope('modules')],
    loadComponent: () =>
      import('../org-modules/modules-settings/modules-settings').then((m) => m.ModulesSettings),
  },
  configArea('documents', 'documents', () => import('../documents/documents-config.routes')),
  configArea('deviations', 'deviations', () => import('../deviations/deviations-config.routes')),
  configArea(
    'inspections',
    'inspections',
    () => import('../inspections/inspections-config.routes'),
  ),
  configArea('risk', 'risk', () => import('../risk/risk-config.routes')),
  configArea(
    'management-review',
    'management_review',
    () => import('../management-review/management-review-config.routes'),
  ),
  configArea('contracts', 'contracts', () => import('../contracts/contracts-config.routes')),
  configArea(
    'environment',
    'environment',
    () => import('../environment/environment-config.routes'),
  ),
  configArea('suppliers', 'suppliers', () => import('../suppliers/suppliers-config.routes')),
  configArea('people', 'people', () => import('../people/people-config.routes')),
  configArea(
    'recruitment',
    'recruitment',
    () => import('../recruitment/recruitment-config.routes'),
  ),
  configArea('feedback', 'feedback', () => import('../feedback/feedback-config.routes')),
  configArea(
    'ai-governance',
    'ai_governance',
    () => import('../ai-governance/ai-governance-config.routes'),
  ),
  configArea('privacy', 'privacy', () => import('../privacy/privacy-config.routes')),
  { path: '**', redirectTo: '' },
] satisfies Routes;
