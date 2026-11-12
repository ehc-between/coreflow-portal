import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toEmployees = { redirectTo: '/people/employees' };
const toPositions = { redirectTo: '/people/positions' };
const toCompetences = { redirectTo: '/people/competences' };

/**
 * People, roles and competence (M09, scope `people`). `app.routes.ts` already gates
 * the area on the `people` module and `people:read`. Employees are written with
 * `people:write`; positions and competences need `people:manage`. The backend links
 * records as `/people/employees/<id>`, `/people/positions/<id>`,
 * `/people/competences/<id>` and `/people/checklists/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('people')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'employees' },
      {
        path: 'employees',
        loadComponent: () => import('./employees-list').then((m) => m.EmployeesList),
      },
      {
        path: 'employees/new',
        canActivate: [permissionGuard('people:write', toEmployees)],
        loadComponent: () => import('./employee-editor').then((m) => m.EmployeeEditor),
      },
      {
        path: 'employees/:id',
        loadComponent: () => import('./employee-detail').then((m) => m.EmployeeDetail),
      },
      {
        path: 'employees/:id/edit',
        canActivate: [permissionGuard('people:write', toEmployees)],
        loadComponent: () => import('./employee-editor').then((m) => m.EmployeeEditor),
      },
      {
        path: 'positions',
        loadComponent: () => import('./positions-list').then((m) => m.PositionsList),
      },
      {
        path: 'positions/new',
        canActivate: [permissionGuard('people:manage', toPositions)],
        loadComponent: () => import('./position-editor').then((m) => m.PositionEditor),
      },
      {
        path: 'positions/:id',
        loadComponent: () => import('./position-detail').then((m) => m.PositionDetailPage),
      },
      {
        path: 'positions/:id/edit',
        canActivate: [permissionGuard('people:manage', toPositions)],
        loadComponent: () => import('./position-editor').then((m) => m.PositionEditor),
      },
      {
        path: 'competences',
        loadComponent: () => import('./competences-list').then((m) => m.CompetencesList),
      },
      {
        path: 'competences/new',
        canActivate: [permissionGuard('people:manage', toCompetences)],
        loadComponent: () => import('./competence-editor').then((m) => m.CompetenceEditor),
      },
      {
        path: 'competences/:id',
        loadComponent: () => import('./competence-detail').then((m) => m.CompetenceDetailPage),
      },
      {
        path: 'competences/:id/edit',
        canActivate: [permissionGuard('people:manage', toCompetences)],
        loadComponent: () => import('./competence-editor').then((m) => m.CompetenceEditor),
      },
      {
        path: 'matrix',
        loadComponent: () => import('./competence-matrix').then((m) => m.CompetenceMatrix),
      },
      {
        path: 'checklists',
        loadComponent: () => import('./checklists-list').then((m) => m.ChecklistsList),
      },
      {
        path: 'checklists/:id',
        loadComponent: () => import('./checklist-detail').then((m) => m.ChecklistDetailPage),
      },
    ],
  },
] satisfies Routes;
