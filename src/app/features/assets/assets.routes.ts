import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const toList = { redirectTo: '/assets' };

/**
 * M19 assets, access and change management (`/assets`, gated on the `assets` module
 * and `assets:read` in app.routes): the asset inventory with calibration of measuring
 * equipment, access reviews with attestation and change requests on the shared
 * workflow engine. The backend links records as `/assets/<id>`
 * (`?calibration=<id>` for a calibration), `/assets/access-reviews/<id>` and
 * `/assets/changes/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('assets')],
    children: [
      {
        path: '',
        loadComponent: () => import('./assets-list').then((m) => m.AssetsList),
      },
      {
        path: 'new',
        canActivate: [permissionGuard('assets:write', toList)],
        loadComponent: () => import('./asset-new').then((m) => m.AssetNew),
      },
      {
        path: 'calibration',
        loadComponent: () =>
          import('./calibration/calibrations-due').then((m) => m.CalibrationsDue),
      },
      {
        path: 'access-reviews',
        loadComponent: () =>
          import('./access-reviews/access-reviews-list').then((m) => m.AccessReviewsList),
      },
      {
        path: 'access-reviews/new',
        canActivate: [permissionGuard('assets:manage', { redirectTo: '/assets/access-reviews' })],
        loadComponent: () =>
          import('./access-reviews/access-review-edit').then((m) => m.AccessReviewEdit),
      },
      {
        path: 'access-reviews/:id',
        loadComponent: () =>
          import('./access-reviews/access-review-detail').then((m) => m.AccessReviewDetailPage),
      },
      {
        path: 'access-reviews/:id/edit',
        canActivate: [permissionGuard('assets:manage', { redirectTo: '/assets/access-reviews' })],
        loadComponent: () =>
          import('./access-reviews/access-review-edit').then((m) => m.AccessReviewEdit),
      },
      {
        path: 'changes',
        loadComponent: () => import('./changes/changes-list').then((m) => m.ChangesList),
      },
      {
        path: 'changes/new',
        canActivate: [permissionGuard('assets:write', { redirectTo: '/assets/changes' })],
        loadComponent: () => import('./changes/change-edit').then((m) => m.ChangeEdit),
      },
      {
        path: 'changes/:id',
        loadComponent: () => import('./changes/change-detail').then((m) => m.ChangeDetailPage),
      },
      {
        path: 'changes/:id/edit',
        canActivate: [permissionGuard('assets:write', { redirectTo: '/assets/changes' })],
        loadComponent: () => import('./changes/change-edit').then((m) => m.ChangeEdit),
      },
      {
        path: ':id',
        loadComponent: () => import('./asset-detail').then((m) => m.AssetDetailPage),
      },
      {
        path: ':id/edit',
        canActivate: [permissionGuard('assets:write', toList)],
        loadComponent: () => import('./asset-edit').then((m) => m.AssetEdit),
      },
    ],
  },
] satisfies Routes;
