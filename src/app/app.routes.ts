import { Route, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { settingsGuard } from './core/auth/org-manage.guard';
import { permissionGuard } from './core/auth/permission.guard';
import { superAdminGuard } from './core/auth/super-admin.guard';
import { moduleGuard } from './core/modules/module.service';
import { MainLayout } from './layout/main-layout/main-layout';

/**
 * A module area: gated on the module being enabled for the current org, then on
 * its read permission. Sub-pages add stricter guards in the feature routes.
 */
function moduleRoute(
  path: string,
  key: string,
  loadChildren: NonNullable<Route['loadChildren']>,
): Route {
  return {
    path,
    canActivate: [moduleGuard(key), permissionGuard(`${key}:read`)],
    loadChildren,
  };
}

export const routes: Routes = [
  // Public login page — kept outside the protected shell.
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },

  // Public accept-invitation page — kept outside the protected shell.
  {
    path: 'invite/accept',
    loadComponent: () =>
      import('./features/auth/accept-invite/accept-invite').then((m) => m.AcceptInvite),
  },

  // Public password-reset flow — kept outside the protected shell.
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },

  // Public customer survey (M22, `/survey/<token>`) — kept outside the protected shell.
  {
    path: 'survey',
    loadChildren: () => import('./features/feedback/feedback-public.routes'),
  },

  // Public anonymous / whistleblowing report form (M03), reached through an org's
  // intake link; no account needed. Kept outside the protected shell.
  {
    path: 'report/:token',
    loadComponent: () =>
      import('./features/deviations/intake/public-report').then((m) => m.PublicReportPage),
  },

  // Authenticated application shell. Feature areas are lazy-loaded children.
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        // The default landing page. A user without dashboard:view falls back
        // silently to My Work (always available) — no warning, since they may
        // simply have signed in. Must not redirect to /dashboard (loop).
        canActivate: [permissionGuard('dashboard:view', { redirectTo: '/my-work', notify: false })],
        loadChildren: () => import('./features/dashboard/dashboard.routes'),
      },
      {
        path: 'my-work',
        loadChildren: () => import('./features/my-work/my-work.routes'),
      },
      {
        // Platform tasks (F2): all tasks, recurring series and task detail (`/tasks/<id>`).
        path: 'tasks',
        canActivate: [permissionGuard('tasks:read', { redirectTo: '/my-work' })],
        loadChildren: () => import('./features/my-work/tasks.routes'),
      },
      {
        path: 'settings',
        canActivate: [authGuard, settingsGuard],
        loadChildren: () => import('./features/org-settings/org-settings.routes'),
      },
      {
        // The organisation setup wizard (re-runnable from Settings).
        path: 'setup',
        canActivate: [permissionGuard('org:manage')],
        loadChildren: () => import('./features/org-modules/setup.routes'),
      },
      {
        path: 'account',
        loadChildren: () => import('./features/account/account.routes'),
      },
      {
        path: 'review',
        loadChildren: () => import('./features/review/review.routes'),
      },

      // Module areas (contracts §1.1). Each is gated on the module and on
      // `<key>:read`; a module without a feature yet loads its placeholder stub.
      // Governance
      moduleRoute('context', 'context', () => import('./features/context/context.routes')),
      moduleRoute(
        'objectives',
        'objectives',
        () => import('./features/objectives/objectives.routes'),
      ),
      moduleRoute(
        'management-review',
        'management_review',
        () => import('./features/management-review/management-review.routes'),
      ),
      moduleRoute(
        'obligations',
        'obligations',
        () => import('./features/obligations/obligations.routes'),
      ),
      moduleRoute('reports', 'reports', () => import('./features/reports/reports.routes')),
      // Operations
      moduleRoute('processes', 'processes', () => import('./features/processes/processes.routes')),
      moduleRoute('documents', 'documents', () => import('./features/documents/documents.routes')),
      moduleRoute('projects', 'projects', () => import('./features/projects/projects.routes')),
      moduleRoute('suppliers', 'suppliers', () => import('./features/suppliers/suppliers.routes')),
      moduleRoute('contracts', 'contracts', () => import('./features/contracts/contracts.routes')),
      moduleRoute('assets', 'assets', () => import('./features/assets/assets.routes')),
      moduleRoute(
        'continuity',
        'continuity',
        () => import('./features/continuity/continuity.routes'),
      ),
      // Improvement
      moduleRoute(
        'deviations',
        'deviations',
        () => import('./features/deviations/deviations.routes'),
      ),
      moduleRoute(
        'inspections',
        'inspections',
        () => import('./features/inspections/inspections.routes'),
      ),
      moduleRoute('audits', 'audits', () => import('./features/audits/audits.routes')),
      moduleRoute('risk', 'risk', () => import('./features/risk/risk.routes')),
      moduleRoute('feedback', 'feedback', () => import('./features/feedback/feedback.routes')),
      // People
      moduleRoute('people', 'people', () => import('./features/people/people.routes')),
      moduleRoute(
        'recruitment',
        'recruitment',
        () => import('./features/recruitment/recruitment.routes'),
      ),
      moduleRoute('training', 'training', () => import('./features/training/training.routes')),
      // Compliance
      moduleRoute('standards', 'standards', () => import('./features/standards/standards.routes')),
      moduleRoute('privacy', 'privacy', () => import('./features/privacy/privacy.routes')),
      moduleRoute(
        'ai-governance',
        'ai_governance',
        () => import('./features/ai-governance/ai-governance.routes'),
      ),
      moduleRoute(
        'environment',
        'environment',
        () => import('./features/environment/environment.routes'),
      ),
      moduleRoute('hse', 'hse', () => import('./features/hse/hse.routes')),

      // The module used to live at /iso (placeholder) — keep old links working.
      { path: 'iso', pathMatch: 'full', redirectTo: 'standards' },
      // Procedures became the process register.
      { path: 'procedures', pathMatch: 'full', redirectTo: 'processes' },
      {
        path: 'admin/organizations',
        canActivate: [authGuard, superAdminGuard],
        loadComponent: () =>
          import('./features/admin/organizations/organizations').then((m) => m.Organizations),
      },
      {
        path: 'admin/organizations/:id',
        canActivate: [authGuard, superAdminGuard],
        loadComponent: () =>
          import('./features/admin/organization-detail/organization-detail').then(
            (m) => m.OrganizationDetail,
          ),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
