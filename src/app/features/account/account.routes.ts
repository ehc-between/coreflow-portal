import { Routes } from '@angular/router';

/** Current-user account routes (lazy-loaded inside the authenticated shell). */
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'password' },
  {
    path: 'password',
    loadComponent: () => import('./change-password/change-password').then((m) => m.ChangePassword),
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./notification-preferences/notification-preferences').then(
        (m) => m.NotificationPreferences,
      ),
  },
];

export default routes;
