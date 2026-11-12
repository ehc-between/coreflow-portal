import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the environment endpoints return in a 4xx `detail: {code}`; each has `environment.errors.<code>`. */
export const ENVIRONMENT_ERROR_CODES = [
  'activity_required',
  'aspect_not_found',
  'drill_in_future',
  'drill_not_found',
  'emergency_plan_not_found',
  'field_required',
  'invalid_bucket',
  'invalid_department',
  'invalid_owner',
  'invalid_owner_filter',
  'invalid_period',
  'invalid_review_date',
  'invalid_rrule',
  'invalid_scores',
  'invalid_scoring',
  'invalid_value',
  'measurement_not_found',
  'metric_not_found',
  'metric_retired',
  'module_disabled',
  'override_reason_required',
  'period_too_long',
  'scenario_required',
] as const;

export type EnvironmentErrorCode = (typeof ENVIRONMENT_ERROR_CODES)[number];

/**
 * The translation key for a failed environment request: the coded message when
 * known, `environment.errors.forbidden` for a 403, `environment.errors.notFound`
 * for a 404, otherwise the neutral status message. Backend English text is never shown.
 */
export function environmentErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && (ENVIRONMENT_ERROR_CODES as readonly string[]).includes(detail.code)) {
    return `environment.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'environment.errors.forbidden';
    }
    if (error.status === 404) {
      return 'environment.errors.notFound';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}

/** The `errors` map of an `invalid_scores` / `invalid_scoring` response (field -> problem code). */
export function fieldErrors(error: unknown): Readonly<Record<string, string>> {
  if (!(error instanceof HttpErrorResponse)) {
    return {};
  }
  const detail = (error.error as { detail?: { errors?: unknown } } | null)?.detail;
  const errors = detail && typeof detail === 'object' ? detail.errors : null;
  if (!errors || typeof errors !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(errors as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
