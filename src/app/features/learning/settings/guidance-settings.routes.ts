import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * `/settings/guidance` (scope `guidance`): the org default learning level (`org:manage`)
 * and members' learning progress (`learning:read`). Each section checks its own
 * permission; the settings shell guards the route itself.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('guidance')],
    children: [
      {
        path: '',
        loadComponent: () => import('./guidance-settings').then((m) => m.GuidanceSettings),
      },
      {
        path: 'members/:userId',
        loadComponent: () => import('./member-progress').then((m) => m.MemberProgress),
      },
    ],
  },
] satisfies Routes;
