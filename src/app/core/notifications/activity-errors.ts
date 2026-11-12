import { HttpErrorResponse } from '@angular/common/http';

/** Error codes the F3 endpoints return as `{"detail": {"code": …}}`. */
export const ACTIVITY_ERROR_CODES = [
  'unknown_event_kind',
  'event_kind_not_notifiable',
  'recipient_value_required',
  'invalid_recipient',
  'unknown_role',
  'unknown_category',
  'quiet_hours_incomplete',
  'not_a_member',
  'unsupported_entity_type',
  'module_disabled',
] as const;
export type ActivityErrorCode = (typeof ACTIVITY_ERROR_CODES)[number];

/** The structured `detail.code` of a failed request, or null. */
export function activityErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body: unknown = error.error;
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (detail && typeof detail === 'object' && 'code' in detail) {
      const code = (detail as { code: unknown }).code;
      return typeof code === 'string' ? code : null;
    }
  }
  return null;
}

/**
 * Translated (i18n key, `activity` scope) message for a failed F3 request:
 * the documented codes first, then neutral network / server / permission messages.
 */
export function activityErrorKey(error: unknown): string {
  const code = activityErrorCode(error);
  if (code && (ACTIVITY_ERROR_CODES as readonly string[]).includes(code)) {
    return `activity.errors.${code}`;
  }
  if (!(error instanceof HttpErrorResponse)) {
    return 'activity.errors.generic';
  }
  if (error.status === 0) return 'activity.errors.network';
  if (error.status >= 500) return 'activity.errors.server';
  if (error.status === 403) return 'activity.errors.forbidden';
  if (error.status === 422) return 'activity.errors.invalid';
  return 'activity.errors.generic';
}

/** Whether a watchers / timeline error means "this record can't be followed here". */
export function isUnsupportedEntity(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) {
    return false;
  }
  const code = activityErrorCode(error);
  return (
    code === 'unsupported_entity_type' ||
    code === 'module_disabled' ||
    error.status === 404 ||
    error.status === 403 ||
    error.status === 422
  );
}
