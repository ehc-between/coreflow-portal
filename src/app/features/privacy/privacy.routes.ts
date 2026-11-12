import { Route, Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { permissionGuard } from '../../core/auth/permission.guard';
import { PERM_READ } from './data/privacy.models';
import { REGISTER_LIST, RegisterDef } from './data/privacy-registers';

const toOverview = { redirectTo: '/privacy' };

const list = () => import('./register-list').then((m) => m.PrivacyRegisterList);
const edit = () => import('./register-edit').then((m) => m.PrivacyRegisterEdit);
const detail = () => import('./register-detail').then((m) => m.PrivacyRegisterDetail);

/** `/privacy/<segment>/...` of one register; the register key reaches the pages as route data. */
function registerRoutes(r: RegisterDef): Route {
  const data = { register: r.key };
  const write = [permissionGuard(r.writePermission, toOverview)];
  return {
    path: r.segment,
    // Requests and consents hold personal data: reading them needs `privacy:requests`.
    canActivate:
      r.readPermission === PERM_READ ? [] : [permissionGuard(r.readPermission, toOverview)],
    children: [
      { path: '', data, loadComponent: list },
      { path: 'new', data, canActivate: write, loadComponent: edit },
      { path: ':id', data, loadComponent: detail },
      { path: ':id/edit', data, canActivate: write, loadComponent: edit },
    ],
  };
}

/**
 * GDPR and privacy (M15, scope `privacy`). `app.routes.ts` already gates the area
 * on the `privacy` module and `privacy:read`. The backend links records as
 * `/privacy/<segment>/<id>`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('privacy')],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./privacy-overview').then((m) => m.PrivacyOverview),
      },
      ...REGISTER_LIST.map(registerRoutes),
      { path: '**', redirectTo: '' },
    ],
  },
] satisfies Routes;
