import { Route, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { settingsGuard } from './core/auth/org-manage.guard';
import { permissionGuard } from './core/auth/permission.guard';
import { superAdminGuard } from './core/auth/super-admin.guard';
import { MainLayout } from './layout/main-layout/main-layout';
import { NAV_ITEMS } from './layout/nav';

// Nav items backed by a real feature surface — excluded from the placeholder
// generation below (they get explicit routes).
const REAL_MODULE_PATHS = new Set([
  'dashboard',
  'my-work',
  'documents',
  'review',
  'deviations',
  'standards',
]);

// Every other nav item resolves to the shared module placeholder, carrying its
// title + agent context via route data.
const placeholderRoutes: Route[] = NAV_ITEMS.filter(
  (item) => !REAL_MODULE_PATHS.has(item.path),
).map((item) => ({
  path: item.path,
  loadComponent: () =>
    import('./features/module-placeholder/module-placeholder').then((m) => m.ModulePlaceholder),
  data: { titleKey: item.labelKey, agentName: item.agentName, agentRole: item.agentRole },
}));

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
        path: 'settings',
        canActivate: [authGuard, settingsGuard],
        loadChildren: () => import('./features/org-settings/org-settings.routes'),
      },
      {
        path: 'account',
        loadChildren: () => import('./features/account/account.routes'),
      },
      {
        path: 'documents',
        // Module-level read gate; sub-pages add stricter guards in the feature routes.
        canActivate: [permissionGuard('documents:read')],
        loadChildren: () => import('./features/documents/documents.routes'),
      },
      {
        path: 'review',
        loadChildren: () => import('./features/review/review.routes'),
      },
      {
        path: 'deviations',
        // Module-level read gate; sub-pages add stricter guards in the feature routes.
        canActivate: [permissionGuard('deviations:read')],
        loadChildren: () => import('./features/deviations/deviations.routes'),
      },
      {
        path: 'standards',
        // Module-level read gate; manage actions are gated inside the pages.
        canActivate: [permissionGuard('standards:read')],
        loadChildren: () => import('./features/standards/standards.routes'),
      },
      // The module used to live at /iso (placeholder) — keep old links working.
      { path: 'iso', pathMatch: 'full', redirectTo: 'standards' },
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
      ...placeholderRoutes,
    ],
  },

  { path: '**', redirectTo: '' },
];
