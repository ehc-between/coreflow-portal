import { Routes } from '@angular/router';

/** Org-settings feature routes (guarded + scoped to the current org upstream). */
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./org-settings/org-settings').then((m) => m.OrgSettings),
  },
  {
    path: 'departments/:deptId',
    loadComponent: () =>
      import('./department-detail/department-detail').then((m) => m.DepartmentDetail),
  },
];

export default routes;
