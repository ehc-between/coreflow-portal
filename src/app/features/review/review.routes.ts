import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { authGuard } from '../../core/auth/auth.guard';
import { permissionGuard } from '../../core/auth/permission.guard';

/** Review feature routes (scoped to the current org). The list is gated on
 *  `documents:approve`; the per-proposal editor only requires `documents:read`
 *  (Save/Approve/Reject are gated per-action inside the page). */
const routes: Routes = [
  {
    // The proposal feed and editor use the documents wording (`documents.proposals.*`).
    providers: [provideTranslocoScope('documents')],
    path: '',
    canActivate: [authGuard, permissionGuard('documents:approve')],
    loadComponent: () => import('./review').then((m) => m.Review),
  },
  {
    providers: [provideTranslocoScope('documents')],
    path: ':id',
    canActivate: [authGuard, permissionGuard('documents:read')],
    loadComponent: () => import('./proposal-review').then((m) => m.ProposalReview),
  },
];

export default routes;
