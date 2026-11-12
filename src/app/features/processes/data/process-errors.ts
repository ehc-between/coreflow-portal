import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the process endpoints return in a 4xx `detail: {code}`; each has `processes.errors.<code>`. */
export const PROCESS_ERROR_CODES = [
  'code_taken',
  'code_required',
  'title_required',
  'invalid_owner',
  'invalid_department',
  'invalid_parent',
  'invalid_category',
  'invalid_status',
  'invalid_map_reference',
  'invalid_fields',
  'process_not_found',
  'process_retired',
  'status_unchanged',
  'interaction_exists',
  'interaction_not_found',
  'self_interaction',
  'documents_draft_required',
  'input_required',
  'forbidden',
] as const;

export type ProcessErrorCode = (typeof PROCESS_ERROR_CODES)[number];

function isProcessErrorCode(code: string): code is ProcessErrorCode {
  return (PROCESS_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The translation key for a failed process request: the coded message when known,
 * `processes.errors.forbidden` for a 403, `processes.errors.invalid` for other 422s,
 * otherwise the neutral global status message. The backend's English `message` is
 * never shown.
 */
export function processErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && isProcessErrorCode(detail.code)) {
    return `processes.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'processes.errors.forbidden';
    }
    if (error.status === 422) {
      return 'processes.errors.invalid';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'processes.errors.generic';
}
