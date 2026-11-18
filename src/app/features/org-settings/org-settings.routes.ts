import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { orgManageGuard } from '../../core/auth/org-manage.guard';
import { permissionGuard } from '../../core/auth/permission.guard';

/** Org-settings feature routes. The shell route needs `org:manage`, `users:invite`,
 *  `records:admin` or `audit:read` (settingsGuard upstream); each page guards its own
 *  permission. Each settings page is one child route here plus one card in
 *  `settings-links/settings-links.ts` (people pages also get a tab in
 *  `settings-nav/settings-nav.ts`). */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./org-settings/org-settings').then((m) => m.OrgSettings),
  },
  {
    // A26: People and access — members, departments, invitations, roles.
    path: 'members',
    title: 'settings.members.title',
    canActivate: [orgManageGuard],
    loadComponent: () => import('./members/org-members').then((m) => m.OrgMembers),
  },
  {
    path: 'departments',
    title: 'settings.departments.title',
    canActivate: [orgManageGuard],
    loadComponent: () => import('./departments/departments-page').then((m) => m.DepartmentsPage),
  },
  {
    path: 'invitations',
    title: 'settings.invitations.title',
    canActivate: [permissionGuard('users:invite', { redirectTo: '/settings' })],
    loadComponent: () => import('./invitations/org-invitations').then((m) => m.OrgInvitations),
  },
  {
    path: 'roles',
    title: 'settings.roles.title',
    canActivate: [
      permissionGuard(['users:invite', 'org:manage', 'audit:read'], { redirectTo: '/settings' }),
    ],
    loadComponent: () => import('./roles/roles-page').then((m) => m.RolesPage),
  },
  {
    path: 'audit-log',
    title: 'settings.audit.title',
    canActivate: [permissionGuard('audit:read', { redirectTo: '/settings' })],
    loadComponent: () => import('./audit-log/audit-log-page').then((m) => m.AuditLogPage),
  },
  {
    path: 'security',
    title: 'settings.security.title',
    canActivate: [orgManageGuard],
    loadComponent: () => import('./security/security-page').then((m) => m.SecurityPage),
  },
  {
    path: 'deleted-documents',
    canActivate: [orgManageGuard],
    loadComponent: () =>
      import('./deleted-documents/deleted-documents').then((m) => m.DeletedDocuments),
  },
  {
    // S04: permanent attachment deletions (erasure, retention, quarantine).
    path: 'attachment-deletions',
    canActivate: [permissionGuard('audit:read', { redirectTo: '/settings' })],
    loadComponent: () =>
      import('./attachment-deletions/attachment-deletions').then((m) => m.AttachmentDeletions),
  },
  {
    path: 'guidance',
    loadChildren: () => import('../learning/settings/guidance-settings.routes'),
  },
  {
    path: 'notifications',
    canActivate: [orgManageGuard],
    loadComponent: () =>
      import('./notification-settings/notification-settings').then(
        (m) => m.NotificationSettingsPage,
      ),
  },
  {
    // F4: record types and workflows (gated inside on records:read / records:admin).
    path: 'record-types',
    loadChildren: () => import('../records/records.routes'),
  },
  {
    path: 'departments/:deptId',
    canActivate: [orgManageGuard],
    loadComponent: () =>
      import('./department-detail/department-detail').then((m) => m.DepartmentDetail),
  },
  {
    path: 'profile',
    canActivate: [orgManageGuard],
    providers: [provideTranslocoScope('modules')],
    loadComponent: () => import('../org-modules/profile/org-profile').then((m) => m.OrgProfilePage),
  },
  {
    path: 'terminology',
    canActivate: [orgManageGuard],
    providers: [provideTranslocoScope('modules')],
    loadComponent: () =>
      import('../org-modules/terminology/terminology-settings').then((m) => m.TerminologySettings),
  },
];

export default routes;
