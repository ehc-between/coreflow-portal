import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toPlans = { redirectTo: '/audits/plans' };
const toProgrammes = { redirectTo: '/audits/programmes' };
const toCertifications = { redirectTo: '/audits/certifications' };
const toFindings = { redirectTo: '/audits/findings' };

/**
 * `/audits` (M06, scope `audits`): audit programme, audits (plans) with team,
 * checklist, findings and report, the auditor competence register and
 * certification cycles. `app.routes.ts` already wraps the module in
 * `moduleGuard('audits')` + `permissionGuard('audits:read')`. Creating and editing
 * needs `audits:write`; certifications and the auditor register need `audits:manage`
 * to change. Entity URLs: `/audits/programmes/<id>`, `/audits/plans/<id>`,
 * `/audits/findings/<id>`, `/audits/certifications/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('audits')],
    children: [
      {
        path: '',
        loadComponent: () => import('./overview/audits-overview').then((m) => m.AuditsOverviewPage),
      },
      {
        path: 'plans',
        loadComponent: () => import('./plans/plan-list').then((m) => m.PlanList),
      },
      {
        path: 'plans/new',
        canActivate: [permissionGuard('audits:write', toPlans)],
        loadComponent: () => import('./plans/plan-form').then((m) => m.PlanForm),
      },
      {
        path: 'plans/:id',
        loadComponent: () => import('./plans/plan-detail').then((m) => m.PlanDetailPage),
      },
      {
        path: 'plans/:id/edit',
        canActivate: [permissionGuard('audits:write', toPlans)],
        loadComponent: () => import('./plans/plan-form').then((m) => m.PlanForm),
      },
      {
        path: 'plans/:id/report',
        loadComponent: () => import('./plans/plan-report').then((m) => m.PlanReportPage),
      },
      {
        path: 'plans/:planId/findings/new',
        canActivate: [permissionGuard('audits:write', toPlans)],
        loadComponent: () => import('./findings/finding-form').then((m) => m.FindingForm),
      },
      {
        path: 'programmes',
        loadComponent: () => import('./programmes/programme-list').then((m) => m.ProgrammeList),
      },
      {
        path: 'programmes/new',
        canActivate: [permissionGuard('audits:write', toProgrammes)],
        loadComponent: () => import('./programmes/programme-form').then((m) => m.ProgrammeForm),
      },
      {
        path: 'programmes/:id',
        loadComponent: () =>
          import('./programmes/programme-detail').then((m) => m.ProgrammeDetailPage),
      },
      {
        path: 'programmes/:id/edit',
        canActivate: [permissionGuard('audits:write', toProgrammes)],
        loadComponent: () => import('./programmes/programme-form').then((m) => m.ProgrammeForm),
      },
      {
        path: 'findings',
        loadComponent: () => import('./findings/finding-list').then((m) => m.FindingList),
      },
      {
        path: 'findings/:id',
        loadComponent: () => import('./findings/finding-detail').then((m) => m.FindingDetailPage),
      },
      {
        path: 'findings/:id/edit',
        canActivate: [permissionGuard('audits:write', toFindings)],
        loadComponent: () => import('./findings/finding-form').then((m) => m.FindingForm),
      },
      {
        path: 'certifications',
        loadComponent: () =>
          import('./certifications/certification-list').then((m) => m.CertificationList),
      },
      {
        path: 'certifications/new',
        canActivate: [permissionGuard('audits:manage', toCertifications)],
        loadComponent: () =>
          import('./certifications/certification-form').then((m) => m.CertificationForm),
      },
      {
        path: 'certifications/:id',
        loadComponent: () =>
          import('./certifications/certification-detail').then((m) => m.CertificationDetailPage),
      },
      {
        path: 'certifications/:id/edit',
        canActivate: [permissionGuard('audits:manage', toCertifications)],
        loadComponent: () =>
          import('./certifications/certification-form').then((m) => m.CertificationForm),
      },
      {
        path: 'auditors',
        loadComponent: () => import('./auditors/auditor-register').then((m) => m.AuditorRegister),
      },
    ],
  },
] satisfies Routes;
