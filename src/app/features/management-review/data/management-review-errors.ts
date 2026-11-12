import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the M07 endpoints return in `detail: {code}`; each has `managementReview.errors.<code>`. */
export const MR_ERROR_CODES = [
  'action_exists',
  'attendee_exists',
  'input_required',
  'invalid_transition',
  'meeting_in_review',
  'meeting_not_completed',
  'minutes_approved',
  'minutes_missing',
  'minutes_not_approved',
  'review_awaiting_signoff',
  'review_incomplete',
  'review_locked',
  'review_signed',
  'frameworks_required',
  'invalid_assessment',
  'invalid_attendance',
  'invalid_attendee',
  'invalid_category',
  'invalid_duration',
  'invalid_fields',
  'invalid_framework',
  'invalid_kind',
  'invalid_period',
  'invalid_role',
  'invalid_status',
  'invalid_user',
  'invalid_argument',
  'record_required',
  'text_required',
  'text_too_long',
  'title_custom_only',
  'title_required',
  'title_too_long',
  'too_many_items',
  'module_disabled',
] as const;

export type MrErrorCode = (typeof MR_ERROR_CODES)[number];

/** The coded error of a failed request, when it is one this module knows. */
export function mrErrorCode(error: unknown): MrErrorCode | null {
  const code = codedErrorDetail(error)?.code;
  return code && (MR_ERROR_CODES as readonly string[]).includes(code)
    ? (code as MrErrorCode)
    : null;
}

/** The `missing` list of a 409 `review_incomplete`, else an empty list. */
export function missingForSubmit(error: unknown): readonly string[] {
  if (!(error instanceof HttpErrorResponse)) {
    return [];
  }
  const detail = (error.error as { detail?: { missing?: unknown } } | null)?.detail;
  const missing = detail?.missing;
  return Array.isArray(missing) ? missing.filter((m): m is string => typeof m === 'string') : [];
}

/**
 * The translation key for a failed request: the coded message when known,
 * `managementReview.errors.forbidden` for a 403, otherwise the neutral status
 * message. The backend's English `message` is never shown.
 */
export function mrErrorKey(error: unknown): string {
  const code = mrErrorCode(error);
  if (code) {
    return `managementReview.errors.${code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'managementReview.errors.forbidden';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}
