import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the objectives endpoints return in `detail: {code}`; each has `objectives.errors.<code>`. */
export const OBJECTIVES_ERROR_CODES = [
  'title_required',
  'name_required',
  'invalid_owner',
  'invalid_department',
  'invalid_dates',
  'invalid_status',
  'invalid_objective',
  'warning_without_target',
  'invalid_thresholds',
  'measurement_exists',
  'kpi_retired',
  'period_in_future',
  'invalid_period',
  'invalid_date',
  'invalid_direction',
  'invalid_frequency',
  'invalid_management_system',
  'invalid_number',
  'objective_not_found',
  'kpi_not_found',
  'measurement_not_found',
  'module_disabled',
] as const;

export type ObjectivesErrorCode = (typeof OBJECTIVES_ERROR_CODES)[number];

/** The coded error of a failed request, when it is one this module knows. */
export function objectivesErrorCode(error: unknown): ObjectivesErrorCode | null {
  const code = codedErrorDetail(error)?.code;
  return code && (OBJECTIVES_ERROR_CODES as readonly string[]).includes(code)
    ? (code as ObjectivesErrorCode)
    : null;
}

/**
 * The translation key for a failed objectives request: the coded message when
 * known, `objectives.errors.forbidden` for a 403, otherwise the neutral status
 * message. The backend's English `message` is never shown.
 */
export function objectivesErrorKey(error: unknown): string {
  const code = objectivesErrorCode(error);
  if (code) {
    return `objectives.errors.${code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'objectives.errors.forbidden';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}
