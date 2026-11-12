import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../deviations/deviation-errors';
import { httpErrorMessageKey } from '../http/error.interceptor';

/** Codes the task endpoints return in a 4xx `detail: {code}`; each has `tasks.errors.<code>`. */
export const TASK_ERROR_CODES = [
  'title_required',
  'invalid_assignee',
  'invalid_assignee_filter',
  'entity_incomplete',
  'invalid_rrule',
  'unsupported_entity_type',
  'task_closed',
  'task_not_open',
  'task_not_closed',
] as const;

export type TaskErrorCode = (typeof TASK_ERROR_CODES)[number];

export function isTaskErrorCode(code: string): code is TaskErrorCode {
  return (TASK_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The translation key (in the `tasks` scope, or a global `errors.*` key) for a
 * failed task request: the coded message when known, `tasks.errors.forbidden`
 * for a 403, otherwise the neutral status message. The backend's English
 * `message` is never shown.
 */
export function taskErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && isTaskErrorCode(detail.code)) {
    return `tasks.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'tasks.errors.forbidden';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}
