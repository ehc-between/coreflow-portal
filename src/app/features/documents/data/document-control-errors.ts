import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/**
 * Codes the M24 endpoints return in a 4xx `detail: {code}`; each has
 * `documents.control.errors.<code>` in the `documents` scope.
 */
export const DOCUMENT_CONTROL_ERROR_CODES = [
  'module_disabled',
  'type_key_exists',
  'invalid_type_key',
  'invalid_numbering_pattern',
  'invalid_retention_rule',
  'retention_rule_in_use',
  'invalid_document_type',
  'invalid_template',
  'invalid_user',
  'invalid_id',
  'invalid_status',
  'invalid_requirement',
  'field_required',
  'no_approved_revision',
  'obsolete',
  'campaign_status',
  'empty_audience',
  'invalid_audience',
  'nothing_to_compare',
  'draft_input_required',
] as const;

export type DocumentControlErrorCode = (typeof DOCUMENT_CONTROL_ERROR_CODES)[number];

/** The error code of a failed request, if the backend sent one. */
export function documentControlErrorCode(error: unknown): string | null {
  return codedErrorDetail(error)?.code ?? null;
}

/**
 * The translation key for a failed M24 request: the coded message when known,
 * a 403 / 404 / 409-specific message, otherwise the neutral status message. The
 * backend's English `message` is never shown.
 */
export function documentControlErrorKey(error: unknown): string {
  const code = documentControlErrorCode(error);
  if (code && (DOCUMENT_CONTROL_ERROR_CODES as readonly string[]).includes(code)) {
    return `documents.control.errors.${code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'documents.control.errors.forbidden';
    }
    if (error.status === 404) {
      return 'documents.control.errors.notFound';
    }
    if (error.status === 422) {
      return 'documents.control.errors.invalid';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}
