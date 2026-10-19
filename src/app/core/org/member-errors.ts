import { HttpErrorResponse } from '@angular/common/http';

/** Which user-management action failed — the same status means different things per action. */
export type MemberAction =
  | 'invite'
  | 'changeRole'
  | 'remove'
  | 'revoke'
  | 'deactivate'
  | 'reactivate';

/** The backend's `detail` string, when the error body carries one. */
function detailOf(error: HttpErrorResponse): string {
  const body: unknown = error.error;
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    return typeof detail === 'string' ? detail.toLowerCase() : '';
  }
  return '';
}

/**
 * Maps a failed user-management request to a translated (i18n key) message.
 * Covers the documented 400/403/404/409 outcomes per action; anything else falls
 * back to the neutral network/server/generic messages.
 */
export function memberErrorKey(error: unknown, action: MemberAction): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'errors.generic';
  }
  const { status } = error;
  if (status === 0) {
    return 'errors.network';
  }
  if (status >= 500) {
    return 'errors.server';
  }

  const detail = detailOf(error);
  switch (action) {
    case 'invite':
      if (status === 409) {
        return detail.includes('pending')
          ? 'settings.errors.invitePending'
          : 'settings.errors.alreadyMember';
      }
      if (status === 400) return 'settings.errors.unknownRole';
      if (status === 403) return 'settings.errors.escalation';
      break;
    case 'changeRole':
      if (status === 400) {
        return detail.includes('your own')
          ? 'settings.errors.selfChange'
          : 'settings.errors.unknownRole';
      }
      if (status === 403) return 'settings.errors.escalation';
      if (status === 404) return 'settings.errors.notMember';
      if (status === 409) return 'settings.errors.lastManager';
      break;
    case 'remove':
      if (status === 400) return 'settings.errors.selfChange';
      if (status === 403) return 'settings.errors.escalation';
      if (status === 404) return 'settings.errors.notMember';
      if (status === 409) return 'settings.errors.lastManager';
      break;
    case 'revoke':
      if (status === 404) return 'settings.errors.invitationNotFound';
      if (status === 403) return 'settings.errors.forbidden';
      break;
    case 'deactivate':
    case 'reactivate':
      if (status === 400) return 'settings.errors.selfDeactivate';
      if (status === 404) return 'settings.errors.userNotFound';
      if (status === 403) return 'settings.errors.forbidden';
      break;
  }
  if (status === 403) return 'settings.errors.forbidden';
  if (status === 404) return 'errors.notFound';
  return 'errors.generic';
}
