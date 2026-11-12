import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the obligation endpoints return in a 4xx `detail: {code}`; each has `obligations.errors.<code>`. */
export const OBLIGATION_ERROR_CODES = [
  'field_required',
  'invalid_attachment',
  'invalid_dates',
  'invalid_department',
  'invalid_framework',
  'invalid_lead_days',
  'invalid_owner',
  'invalid_rrule',
  'invalid_assignee',
  'module_disabled',
  'obligation_retired',
  'requirement_too_long',
  'text_required',
  'too_many_attachments',
  'too_many_requirements',
] as const;

export type ObligationErrorCode = (typeof OBLIGATION_ERROR_CODES)[number];

/**
 * The translation key for a failed obligation request: the coded message when known,
 * `obligations.errors.forbidden` for a 403, `obligations.errors.notFound` for a 404,
 * otherwise the neutral status message. The backend's English `message` is never shown.
 */
export function obligationErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && (OBLIGATION_ERROR_CODES as readonly string[]).includes(detail.code)) {
    return `obligations.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'obligations.errors.forbidden';
    }
    if (error.status === 404) {
      return 'obligations.errors.notFound';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}
