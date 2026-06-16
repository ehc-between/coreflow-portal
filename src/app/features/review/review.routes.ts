import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';
import { permissionGuard } from '../../core/auth/permission.guard';

/** Review feature routes (scoped to the current org). The list is gated on
 *  `documents:approve`; the per-proposal editor only requires `documents:read`
 *  (Save/Approve/Reject are gated per-action inside the page). */
const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard('documents:approve')],
    loadComponent: () => import('./review').then((m) => m.Review),
  },
  {
    path: ':id',
    canActivate: [authGuard, permissionGuard('documents:read')],
    loadComponent: () => import('./proposal-review').then((m) => m.ProposalReview),
  },
];

export default routes;
