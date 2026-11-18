import { Route, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { mfaEnrolmentGuard } from './core/auth/mfa.guard';
import { settingsGuard } from './core/auth/org-manage.guard';
import { permissionGuard } from './core/auth/permission.guard';
import { superAdminGuard } from './core/auth/super-admin.guard';
import { moduleGuard } from './core/modules/module.service';
import { orgDeepLinkGuard } from './core/org/org-deep-link.guard';
import { MainLayout } from './layout/main-layout/main-layout';

/**
 * A module area: gated on the module being enabled for the current org, then on
 * its read permission. Sub-pages add stricter guards in the feature routes.
 * The route title is the module name (`modules.names.<key>`, the nav label), so
 * the browser tab is right even before the page header sets the exact h1.
 */
function moduleRoute(
  path: string,
  key: string,
  loadChildren: NonNullable<Route['loadChildren']>,
): Route {
  return {
    path,
    title: `modules.names.${key}`,
    canActivate: [moduleGuard(key), permissionGuard(`${key}:read`)],
    loadChildren,
  };
}

export const routes: Routes = [
  // Public login page — kept outside the protected shell.
  {
    path: 'login',
    title: 'auth.login',
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

  // Public check of a printed training certificate (M11, `/verify/certificate/<code>`,
  // opened from the certificate's QR code) — kept outside the protected shell.
  {
    path: 'verify',
    loadChildren: () => import('./features/training/training-public.routes'),
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
    // orgDeepLinkGuard handles `?org=<id>` deep links (emails, digests, calendar
    // feeds): it switches to that org, or sends a non-member to /no-access. It
    // must also run when only the query changes (an in-app `?org=` link to the
    // page already open), hence paramsOrQueryParamsChange.
    canActivate: [authGuard, orgDeepLinkGuard],
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    // An org that requires MFA keeps the member on the setup page until they enrol.
    canActivateChild: [mfaEnrolmentGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        // A deep link to an org the user doesn't belong to.
        path: 'no-access',
        title: 'orgAccess.title',
        loadComponent: () =>
          import('./features/org-access/no-org-access').then((m) => m.NoOrgAccess),
      },
      {
        path: 'dashboard',
        title: 'nav.dashboard',
        // The default landing page. A user without dashboard:view falls back
        // silently to My Work (always available) — no warning, since they may
        // simply have signed in. Must not redirect to /dashboard (loop).
        canActivate: [permissionGuard('dashboard:view', { redirectTo: '/my-work', notify: false })],
        loadChildren: () => import('./features/dashboard/dashboard.routes'),
      },
      {
        path: 'my-work',
        title: 'nav.myWork',
        loadChildren: () => import('./features/my-work/my-work.routes'),
      },
      {
        // Platform tasks (F2): all tasks, recurring series and task detail (`/tasks/<id>`).
        path: 'tasks',
        title: 'modules.names.tasks',
        canActivate: [permissionGuard('tasks:read', { redirectTo: '/my-work' })],
        loadChildren: () => import('./features/my-work/tasks.routes'),
      },
      {
        // U10: which modules are on, and each module's configuration (types, templates,
        // matrices…). Guarded per module inside, so it sits before the Settings shell.
        path: 'settings/modules',
        canActivate: [authGuard],
        loadChildren: () => import('./features/org-settings/module-config.routes'),
      },
      {
        path: 'settings',
        title: 'nav.settings',
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
        // Registre (shell v2, U03): every register the user can open, by job area.
        path: 'registers',
        loadChildren: () => import('./features/registers/registers.routes'),
      },
      {
        // "Needs your review" moves into My work (P5); the route stays so links keep working.
        path: 'review',
        title: 'nav.review',
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
      // The learning centre has a nav entry now; give it a short, guessable URL.
      { path: 'learning', pathMatch: 'full', redirectTo: 'account/learning' },
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
