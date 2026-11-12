import { CanActivateFn } from '@angular/router';
import { permissionGuard } from './permission.guard';

/**
 * Org-settings management surfaces (departments, members): requires `org:manage`.
 * A user who reached Settings via `users:invite` alone is sent back to the
 * Settings page (their Invitations view) rather than the dashboard.
 */
export const orgManageGuard: CanActivateFn = permissionGuard('org:manage', {
  redirectTo: '/settings',
});

/** The Settings area: reachable with `org:manage` OR `users:invite` (invitations only)
 *  OR `records:admin` (the record type and workflow designer). */
export const settingsGuard: CanActivateFn = permissionGuard([
  'org:manage',
  'users:invite',
  'records:admin',
]);
