import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the supplier endpoints return in a 4xx `detail: {code}`; each has `suppliers.errors.<code>`. */
export const SUPPLIER_ERROR_CODES = [
  'approval_required',
  'conditions_required',
  'duplicate_question_id',
  'evaluation_not_draft',
  'evaluation_not_editable',
  'evaluation_not_open',
  'evaluation_not_submitted',
  'field_required',
  'invalid_answer',
  'invalid_category',
  'invalid_criticality',
  'invalid_decision',
  'invalid_department',
  'invalid_kind',
  'invalid_question',
  'invalid_rating',
  'invalid_status',
  'invalid_user',
  'name_required',
  'questionnaire_not_found',
  'questions_required',
  'reason_required',
  'status_unchanged',
  'title_required',
  'too_many_questions',
  'unanswered_questions',
  'unknown_question',
] as const;

export type SupplierErrorCode = (typeof SUPPLIER_ERROR_CODES)[number];

export function isSupplierErrorCode(code: string): code is SupplierErrorCode {
  return (SUPPLIER_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The translation key for a failed supplier request: the coded message when known,
 * `suppliers.errors.forbidden` for a 403, `suppliers.errors.invalid` for other 422s,
 * otherwise the neutral status message. The backend's English text is never shown.
 */
export function supplierErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && isSupplierErrorCode(detail.code)) {
    return `suppliers.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'suppliers.errors.forbidden';
    }
    if (error.status === 422) {
      return 'suppliers.errors.invalid';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'suppliers.errors.generic';
}

/** Question ids named by a 422 `unanswered_questions` error (empty otherwise). */
export function unansweredIds(error: unknown): readonly string[] {
  if (!(error instanceof HttpErrorResponse)) {
    return [];
  }
  const detail = (error.error as { detail?: { code?: unknown; ids?: unknown } } | null)?.detail;
  if (detail?.code !== 'unanswered_questions' || !Array.isArray(detail.ids)) {
    return [];
  }
  return detail.ids.filter((id): id is string => typeof id === 'string');
}
