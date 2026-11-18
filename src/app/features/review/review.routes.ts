import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { authGuard } from '../../core/auth/auth.guard';
import { permissionGuard } from '../../core/auth/permission.guard';

/** Review feature routes (scoped to the current org). `/review` itself is My Work's
 *  "Til gjennomgang" tab (U08: one inbox, one count); the per-proposal editor only
 *  requires `documents:read` (Save/Approve/Reject are gated per-action inside the page). */
const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: () =>
      inject(Router).createUrlTree(['/my-work'], { queryParams: { tab: 'review' } }),
  },
  {
    providers: [provideTranslocoScope('documents')],
    path: ':id',
    canActivate: [authGuard, permissionGuard('documents:read')],
    loadComponent: () => import('./proposal-review').then((m) => m.ProposalReview),
  },
];

export default routes;
