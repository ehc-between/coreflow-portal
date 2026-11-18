import { Routes } from '@angular/router';

/** Current-user account routes (lazy-loaded inside the authenticated shell). */
const children: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'password' },
  {
    path: 'password',
    loadComponent: () => import('./change-password/change-password').then((m) => m.ChangePassword),
  },
  {
    path: 'security',
    title: 'auth.mfa.title',
    loadComponent: () => import('./security/account-security').then((m) => m.AccountSecurity),
  },
  {
    path: 'sessions',
    title: 'auth.sessions.title',
    loadComponent: () => import('./sessions/account-sessions').then((m) => m.AccountSessions),
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./notification-preferences/notification-preferences').then(
        (m) => m.NotificationPreferences,
      ),
  },
  {
    path: 'learning',
    loadChildren: () => import('../learning/learning.routes'),
  },
];

/** A26: every account page sits under one layout with a shared tab row. */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./account-layout').then((m) => m.AccountLayout),
    children,
  },
];

export default routes;
