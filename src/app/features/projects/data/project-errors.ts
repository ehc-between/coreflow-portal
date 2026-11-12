import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';
import { OpenItemsDetail } from './project.models';

/** Codes the project endpoints return in a 4xx `detail: {code}`; each has `projects.errors.<code>`. */
export const PROJECT_ERROR_CODES = [
  'closeout_summary_required',
  'invalid_category',
  'invalid_dates',
  'invalid_department',
  'invalid_fields',
  'invalid_filter',
  'invalid_kind',
  'invalid_member_role',
  'invalid_outcome',
  'invalid_phase',
  'invalid_sort',
  'invalid_status',
  'module_disabled',
  'owner_is_manager',
  'owner_required',
  'project_closed',
  'project_has_open_items',
  'project_not_closed',
  'title_required',
  'user_not_member',
] as const;

export type ProjectErrorCode = (typeof PROJECT_ERROR_CODES)[number];

/**
 * The translation key for a failed project request: the coded message when known,
 * `projects.errors.forbidden` for a 403, `projects.errors.notFound` for a 404,
 * otherwise the neutral status message. The backend's English `message` is never shown.
 */
export function projectErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && (PROJECT_ERROR_CODES as readonly string[]).includes(detail.code)) {
    return `projects.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'projects.errors.forbidden';
    }
    if (error.status === 404) {
      return 'projects.errors.notFound';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}

/** The open-item counts of a `409 project_has_open_items` close-out refusal, else null. */
export function openItemsOf(error: unknown): OpenItemsDetail | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail as
    | Record<string, unknown>
    | undefined;
  if (!detail || detail['code'] !== 'project_has_open_items') {
    return null;
  }
  const count = (key: string) => (typeof detail[key] === 'number' ? (detail[key] as number) : 0);
  return {
    open_milestones: count('open_milestones'),
    pending_design_reviews: count('pending_design_reviews'),
    open_tasks: count('open_tasks'),
  };
}
