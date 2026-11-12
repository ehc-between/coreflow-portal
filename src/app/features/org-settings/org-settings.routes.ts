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
    path: 'deleted-documents',
    canActivate: [orgManageGuard],
    loadComponent: () =>
      import('./deleted-documents/deleted-documents').then((m) => m.DeletedDocuments),
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
];

export default routes;
