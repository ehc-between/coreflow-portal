import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the HSE endpoints return in a 4xx `detail: {code}`; each has `hse.errors.<code>`. */
export const HSE_ERROR_CODES = [
  'title_required',
  'invalid_user',
  'invalid_department',
  'invalid_period',
  'invalid_category',
  'sja_locked',
  'sja_incomplete',
  'invalid_transition',
  'reason_required',
  'ppe_not_available',
  'ppe_not_issued',
  'ppe_retired',
  'holder_required',
  'consultation_cancelled',
  'invalid_rrule',
  'task_required',
  'module_disabled',
] as const;

export type HseErrorCode = (typeof HSE_ERROR_CODES)[number];

export function isHseErrorCode(code: string): code is HseErrorCode {
  return (HSE_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The translation key for a failed HSE request: the coded message (`hse.errors.<code>`)
 * when known, `hse.errors.forbidden` for a 403, `hse.errors.validation` for another
 * 422, otherwise the neutral global status message. The backend's English text is
 * never shown.
 */
export function hseErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && isHseErrorCode(detail.code)) {
    return `hse.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'hse.errors.forbidden';
    }
    if (error.status === 422) {
      return 'hse.errors.validation';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}
