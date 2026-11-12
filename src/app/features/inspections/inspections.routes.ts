import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toList = { redirectTo: '/inspections' };
const toTemplates = { redirectTo: '/inspections/templates' };

/**
 * `/inspections` (scope `inspections`, M05): inspections (list, plan, detail, run),
 * findings, checklist templates (list, library, detail, builder) and recurring
 * schedules. `app.routes` already gates the area on the `inspections` module and
 * `inspections:read`; planning and editing need `inspections:write`, designing
 * templates `inspections:templates`. The backend's entity URLs are
 * `/inspections/<id>`, `/inspections/<id>?finding=<id>` and
 * `/inspections/templates/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('inspections')],
    children: [
      {
        path: '',
        loadComponent: () => import('./list/inspections-list').then((m) => m.InspectionsList),
      },
      {
        path: 'new',
        canActivate: [permissionGuard('inspections:write', toList)],
        loadComponent: () =>
          import('./inspections/inspection-form').then((m) => m.InspectionFormPage),
      },
      {
        path: 'findings',
        loadComponent: () => import('./findings/findings-list').then((m) => m.FindingsList),
      },
      {
        path: 'schedules',
        loadComponent: () => import('./schedules/schedules-list').then((m) => m.SchedulesList),
      },
      {
        path: 'templates',
        loadComponent: () => import('./templates/templates-list').then((m) => m.TemplatesList),
      },
      {
        path: 'templates/library',
        loadComponent: () => import('./templates/template-library').then((m) => m.TemplateLibrary),
      },
      {
        path: 'templates/new',
        canActivate: [permissionGuard('inspections:templates', toTemplates)],
        loadComponent: () => import('./templates/template-builder').then((m) => m.TemplateBuilder),
      },
      {
        path: 'templates/:id',
        loadComponent: () =>
          import('./templates/template-detail').then((m) => m.TemplateDetailPage),
      },
      {
        path: 'templates/:id/edit',
        canActivate: [permissionGuard('inspections:templates', toTemplates)],
        loadComponent: () => import('./templates/template-builder').then((m) => m.TemplateBuilder),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./inspections/inspection-detail').then((m) => m.InspectionDetailPage),
      },
      {
        path: ':id/edit',
        canActivate: [permissionGuard('inspections:write', toList)],
        loadComponent: () =>
          import('./inspections/inspection-form').then((m) => m.InspectionFormPage),
      },
      {
        path: ':id/run',
        canActivate: [permissionGuard('inspections:write', toList)],
        loadComponent: () => import('./inspections/inspection-run').then((m) => m.InspectionRun),
      },
    ],
  },
] satisfies Routes;
