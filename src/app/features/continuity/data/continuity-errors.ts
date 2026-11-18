import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the continuity endpoints return in `detail: {code}`; each has `continuity.errors.<code>`. */
export const CONTINUITY_ERROR_CODES = [
  'bia_required',
  'contact_unreachable',
  'exercise_cancelled',
  'field_locked',
  'field_required',
  'impact_timeline_decreasing',
  'invalid_action',
  'invalid_bia',
  'invalid_dates',
  'invalid_department',
  'invalid_dependencies',
  'invalid_dependency_link',
  'invalid_ict_system',
  'invalid_impact_timeline',
  'invalid_impacts',
  'invalid_link',
  'invalid_order',
  'invalid_plan',
  'invalid_reason',
  'invalid_steps',
  'invalid_transition',
  'module_disabled',
  'note_required',
  'plan_required',
  'record_retired',
  'rto_exceeds_mtpd',
  'text_required',
  'too_many_contacts',
  'too_many_dependencies',
  'too_many_steps',
] as const;

export type ContinuityErrorCode = (typeof CONTINUITY_ERROR_CODES)[number];

export function isContinuityErrorCode(code: string): code is ContinuityErrorCode {
  return (CONTINUITY_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The translation key for a failed continuity request: the coded message when known,
 * `continuity.errors.forbidden` for a 403, `continuity.errors.invalid` for other 422s,
 * otherwise the neutral status message. The backend's English text is never shown.
 */
export function continuityErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && isContinuityErrorCode(detail.code)) {
    return `continuity.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'continuity.errors.forbidden';
    }
    if (error.status === 422) {
      return 'continuity.errors.invalid';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'continuity.errors.generic';
}
