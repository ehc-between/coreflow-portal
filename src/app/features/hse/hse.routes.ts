import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const write = (redirectTo: string) => permissionGuard('hse:write', { redirectTo });

/**
 * Health and safety (M21, scope `hse`). `app.routes.ts` already gates the module
 * with `moduleGuard('hse')` + `permissionGuard('hse:read')`; creating and editing
 * need `hse:write`. Detail URLs match the backend's entity registry:
 * `/hse/sja/{id}`, `/hse/ppe/{id}`, `/hse/consultations/{id}`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('hse')],
    children: [
      {
        path: '',
        loadComponent: () => import('./hse-overview').then((m) => m.HseOverviewPage),
      },
      {
        path: 'sja',
        loadComponent: () => import('./sja/sja-list').then((m) => m.SjaList),
      },
      {
        path: 'sja/new',
        canActivate: [write('/hse/sja')],
        loadComponent: () => import('./sja/sja-editor').then((m) => m.SjaEditor),
      },
      {
        path: 'sja/:id',
        loadComponent: () => import('./sja/sja-detail').then((m) => m.SjaDetail),
      },
      {
        path: 'sja/:id/edit',
        canActivate: [write('/hse/sja')],
        loadComponent: () => import('./sja/sja-editor').then((m) => m.SjaEditor),
      },
      {
        path: 'ppe',
        loadComponent: () => import('./ppe/ppe-list').then((m) => m.PpeList),
      },
      {
        path: 'ppe/new',
        canActivate: [write('/hse/ppe')],
        loadComponent: () => import('./ppe/ppe-editor').then((m) => m.PpeEditor),
      },
      {
        path: 'ppe/:id',
        loadComponent: () => import('./ppe/ppe-detail').then((m) => m.PpeDetail),
      },
      {
        path: 'ppe/:id/edit',
        canActivate: [write('/hse/ppe')],
        loadComponent: () => import('./ppe/ppe-editor').then((m) => m.PpeEditor),
      },
      {
        path: 'consultations',
        loadComponent: () =>
          import('./consultations/consultation-list').then((m) => m.ConsultationList),
      },
      {
        path: 'consultations/new',
        canActivate: [write('/hse/consultations')],
        loadComponent: () =>
          import('./consultations/consultation-editor').then((m) => m.ConsultationEditor),
      },
      {
        path: 'consultations/:id',
        loadComponent: () =>
          import('./consultations/consultation-detail').then((m) => m.ConsultationDetail),
      },
      {
        path: 'consultations/:id/edit',
        canActivate: [write('/hse/consultations')],
        loadComponent: () =>
          import('./consultations/consultation-editor').then((m) => m.ConsultationEditor),
      },
      {
        path: 'safety-rounds',
        loadComponent: () => import('./safety-rounds/safety-rounds').then((m) => m.SafetyRounds),
      },
    ],
  },
] satisfies Routes;
