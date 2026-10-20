import { Routes } from '@angular/router';
import { orgManageGuard } from '../../core/auth/org-manage.guard';

/** Org-settings feature routes. The shell route needs `org:manage` OR `users:invite`
 *  (settingsGuard upstream); department pages need `org:manage`. */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./org-settings/org-settings').then((m) => m.OrgSettings),
  },
  {
    path: 'departments/:deptId',
    canActivate: [orgManageGuard],
    loadComponent: () =>
      import('./department-detail/department-detail').then((m) => m.DepartmentDetail),
  },
];

export default routes;
