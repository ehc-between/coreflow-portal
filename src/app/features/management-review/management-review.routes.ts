import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';

const writeGuard = (redirectTo: string) =>
  permissionGuard('management_review:write', { redirectTo });

/**
 * Management review and meetings (M07), lazy-loaded from app.routes where the
 * whole area is gated on module `management_review` and `management_review:read`.
 * Creating and editing need `management_review:write`; a denied user goes back
 * to the list. The backend links records as `/management-review/reviews/<id>`
 * and `/management-review/meetings/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('management-review')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'reviews' },
      {
        path: 'reviews',
        loadComponent: () => import('./reviews-list').then((m) => m.ReviewsList),
      },
      {
        path: 'reviews/new',
        canActivate: [writeGuard('/management-review/reviews')],
        loadComponent: () => import('./review-editor').then((m) => m.ReviewEditor),
      },
      {
        path: 'reviews/:id',
        loadComponent: () => import('./review-detail').then((m) => m.ReviewDetailPage),
      },
      {
        path: 'reviews/:id/edit',
        canActivate: [writeGuard('/management-review/reviews')],
        loadComponent: () => import('./review-editor').then((m) => m.ReviewEditor),
      },
      {
        path: 'reviews/:id/report',
        loadComponent: () => import('./review-report').then((m) => m.ReviewReportPage),
      },
      {
        path: 'meetings',
        loadComponent: () => import('./meetings-list').then((m) => m.MeetingsList),
      },
      {
        path: 'meetings/new',
        canActivate: [writeGuard('/management-review/meetings')],
        loadComponent: () => import('./meeting-editor').then((m) => m.MeetingEditor),
      },
      {
        path: 'meetings/:id',
        loadComponent: () => import('./meeting-detail').then((m) => m.MeetingDetailPage),
      },
      {
        path: 'meetings/:id/edit',
        canActivate: [writeGuard('/management-review/meetings')],
        loadComponent: () => import('./meeting-editor').then((m) => m.MeetingEditor),
      },
    ],
  },
] satisfies Routes;
