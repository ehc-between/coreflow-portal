import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the people endpoints return in a 4xx `detail: {code}`; each has `people.errors.<code>`. */
export const PEOPLE_ERROR_CODES = [
  'checklist_closed',
  'checklist_exists',
  'checklist_incomplete',
  'competence_exists',
  'duplicate_competence',
  'employee_former',
  'employee_user_exists',
  'full_name_required',
  'invalid_case_type',
  'invalid_category',
  'invalid_competence',
  'invalid_dates',
  'invalid_department',
  'invalid_id',
  'invalid_kind',
  'invalid_level',
  'invalid_manager',
  'invalid_position',
  'invalid_reports_to',
  'invalid_risk_level',
  'invalid_status',
  'invalid_user',
  'module_disabled',
  'name_required',
  'position_in_use',
  'text_required',
  'title_required',
  'too_many_items',
  'topic_required',
] as const;

export type PeopleErrorCode = (typeof PEOPLE_ERROR_CODES)[number];

/** The backend's error code of a failed request, or null. */
export function peopleErrorCode(error: unknown): string | null {
  return codedErrorDetail(error)?.code ?? null;
}

/**
 * The translation key for a failed people request: the coded message when known,
 * `people.errors.forbidden` for a 403, `people.errors.notFound` for a 404, otherwise
 * the neutral status message. The backend's English `message` is never shown.
 */
export function peopleErrorKey(error: unknown): string {
  const code = peopleErrorCode(error);
  if (code && (PEOPLE_ERROR_CODES as readonly string[]).includes(code)) {
    return `people.errors.${code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'people.errors.forbidden';
    }
    if (error.status === 404) {
      return 'people.errors.notFound';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}

/** An extra field of a coded error detail (e.g. `open_required` of `checklist_incomplete`). */
export function peopleErrorExtra(error: unknown, key: string): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return undefined;
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  return detail && typeof detail === 'object'
    ? (detail as Record<string, unknown>)[key]
    : undefined;
}
