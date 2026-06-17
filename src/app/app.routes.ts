import { Route, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { orgManageGuard } from './core/auth/org-manage.guard';
import { superAdminGuard } from './core/auth/super-admin.guard';
import { MainLayout } from './layout/main-layout/main-layout';
import { NAV_ITEMS } from './layout/nav';

// Nav items backed by a real feature surface — excluded from the placeholder
// generation below (they get explicit routes).
const REAL_MODULE_PATHS = new Set(['dashboard', 'documents', 'review', 'deviations']);

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

  // Authenticated application shell. Feature areas are lazy-loaded children.
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.routes'),
      },
      {
        path: 'settings',
        canActivate: [authGuard, orgManageGuard],
        loadChildren: () => import('./features/org-settings/org-settings.routes'),
      },
      {
        path: 'documents',
        loadChildren: () => import('./features/documents/documents.routes'),
      },
      {
        path: 'review',
        loadChildren: () => import('./features/review/review.routes'),
      },
      {
        path: 'deviations',
        loadChildren: () => import('./features/deviations/deviations.routes'),
      },
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
