import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { moduleConfigRedirect } from '../../core/modules/module-config';

const toList = { redirectTo: '/inspections' };

/**
 * `/inspections` (scope `inspections`, M05): inspections (list, plan, detail, run),
 * findings and recurring schedules. Checklist templates (list, library, detail,
 * builder) are configuration under `/settings/modules/inspections/templates` (U10,
 * `inspections-config.routes.ts`); their old URLs here redirect. `app.routes` already gates the area on the `inspections` module and
 * `inspections:read`; planning and editing need `inspections:write`, designing
 * templates `inspections:templates`. The backend's entity URLs are
 * `/inspections/<id>`, `/inspections/<id>?finding=<id>` and
 * `/inspections/templates/<id>`; `/inspections/<id>/findings/<finding>` is the same
 * finding panel as a path (list rows link there).
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
      // U10: checklist templates are configuration (/settings/modules/inspections).
      moduleConfigRedirect('templates', 'inspections'),
      moduleConfigRedirect('templates/library', 'inspections'),
      moduleConfigRedirect('templates/new', 'inspections'),
      moduleConfigRedirect('templates/:id', 'inspections'),
      moduleConfigRedirect('templates/:id/edit', 'inspections'),
      {
        path: ':id',
        loadComponent: () =>
          import('./inspections/inspection-detail').then((m) => m.InspectionDetailPage),
      },
      {
        // A finding's own address: its inspection with the finding panel open.
        path: ':id/findings/:finding',
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
