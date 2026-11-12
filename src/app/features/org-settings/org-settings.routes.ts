import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { orgManageGuard } from '../../core/auth/org-manage.guard';

/** Org-settings feature routes. The shell route needs `org:manage` OR `users:invite`
 *  (settingsGuard upstream); department, module, profile and terminology pages
 *  need `org:manage`. Each settings page is one child route here plus one link
 *  in `settings-links/settings-links.ts`. */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./org-settings/org-settings').then((m) => m.OrgSettings),
  },
  {
    path: 'deleted-documents',
    canActivate: [orgManageGuard],
    loadComponent: () =>
      import('./deleted-documents/deleted-documents').then((m) => m.DeletedDocuments),
  },
  {
    path: 'guidance',
    loadChildren: () => import('../learning/settings/guidance-settings.routes'),
  },
  {
    path: 'departments/:deptId',
    canActivate: [orgManageGuard],
    loadComponent: () =>
      import('./department-detail/department-detail').then((m) => m.DepartmentDetail),
  },
  {
    path: 'modules',
    canActivate: [orgManageGuard],
    providers: [provideTranslocoScope('modules')],
    loadComponent: () =>
      import('../org-modules/modules-settings/modules-settings').then((m) => m.ModulesSettings),
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
