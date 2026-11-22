import { Route, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { mfaEnrolmentGuard } from './core/auth/mfa.guard';
import { settingsGuard } from './core/auth/org-manage.guard';
import { permissionGuard } from './core/auth/permission.guard';
import { superAdminGuard } from './core/auth/super-admin.guard';
import { moduleGuard } from './core/modules/module.service';
import { orgDeepLinkGuard } from './core/org/org-deep-link.guard';
import { LEGACY_REDIRECTS } from './layout/legacy-redirects';
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

/**
 * An area whose overview sits at a module's root (IA v2 §9.2): `/<path>` shows the
 * area overview (open to every member), and the module's own pages below it keep
 * their module + read-permission gate.
 */
function hubRoute(
  path: string,
  key: string,
  title: string,
  loadHub: NonNullable<Route['loadChildren']>,
  loadModule: NonNullable<Route['loadChildren']>,
): Route {
  return {
    path,
    title,
    children: [
      { path: '', pathMatch: 'full', loadChildren: loadHub },
      {
        path: '',
        title: `modules.names.${key}`,
        canActivate: [moduleGuard(key), permissionGuard(`${key}:read`)],
        loadChildren: loadModule,
      },
    ],
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
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      // Old landing pages (IA v2 §7); query strings are kept.
      ...LEGACY_REDIRECTS,
      {
        // A deep link to an org the user doesn't belong to.
        path: 'no-access',
        title: 'orgAccess.title',
        loadComponent: () =>
          import('./features/org-access/no-org-access').then((m) => m.NoOrgAccess),
      },
      // IA v2 (docs/ia-v2.md §2, §9.2): the nine area overview pages. Overviews are
      // open to every member (they show the sections the user can see); only Håndbok is
      // gated, since it is entirely the processes module (D15).
      {
        path: 'home',
        title: 'nav.areas.home.label',
        loadChildren: () => import('./features/home/home.routes'),
      },
      {
        path: 'speak-up',
        title: 'nav.areas.speakUp.label',
        loadChildren: () => import('./features/speak-up/speak-up.routes'),
      },
      {
        path: 'cases',
        title: 'nav.areas.speakUp.items.cases.label',
        loadChildren: () => import('./features/cases/cases.routes'),
      },
      {
        path: 'annual-cycle',
        title: 'nav.areas.annual.label',
        loadChildren: () => import('./features/annual-cycle/annual-cycle.routes'),
      },
      {
        path: 'company',
        title: 'nav.areas.company.label',
        loadChildren: () => import('./features/company/company.routes'),
      },
      {
        path: 'contacts',
        title: 'nav.areas.contacts.label',
        loadChildren: () => import('./features/contacts/contacts.routes'),
      },
      {
        path: 'handbook',
        title: 'nav.areas.handbook.label',
        canActivate: [
          moduleGuard('processes'),
          permissionGuard('processes:read', { redirectTo: '/documents' }),
        ],
        loadChildren: () => import('./features/handbook/handbook.routes'),
      },
      // Folk, Dokumenter and Rapporter: the area overview at the module root, the
      // module's own pages (gated as before) below it.
      hubRoute(
        'people',
        'people',
        'nav.areas.people.label',
        () => import('./features/people-hub/people-hub.routes'),
        () => import('./features/people/people.routes'),
      ),
      hubRoute(
        'documents',
        'documents',
        'nav.areas.documents.label',
        () => import('./features/documents-hub/documents-hub.routes'),
        () => import('./features/documents/documents.routes'),
      ),
      hubRoute(
        'reports',
        'reports',
        'nav.areas.reports.label',
        () => import('./features/reports/reports-hub.routes'),
        () => import('./features/reports/reports.routes'),
      ),
      {
        path: 'my-work',
        title: 'nav.myWork',
        loadChildren: () => import('./features/my-work/my-work.routes'),
      },
      {
        // Chat (docs/chat-design.md §4.3): DMs, groups, team and topic channels.
        path: 'chat',
        title: 'modules.names.chat',
        canActivate: [moduleGuard('chat'), permissionGuard('chat:use')],
        loadChildren: () => import('./features/chat/chat.routes'),
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
        // Registre (shell v2 U03, hub U04): every register the user can open, by job area.
        path: 'registers',
        title: 'nav.registers',
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
      // U11: "Dokumenter og rapporter" — every output, grouped by audience, plus the
      // register exports, saved reports and audit packs moved from Reports. Open to
      // members; each output is gated by its own module and permission.
      {
        path: 'library',
        title: 'nav.library',
        loadChildren: () => import('./features/library/library.routes'),
      },
      // Operations
      moduleRoute('processes', 'processes', () => import('./features/processes/processes.routes')),
      moduleRoute('customers', 'customers', () => import('./features/customers/customers.routes')),
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
