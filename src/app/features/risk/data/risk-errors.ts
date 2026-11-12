import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the risk endpoints return in a 4xx `detail: {code}`; each has `risk.errors.<code>`. */
export const RISK_ERROR_CODES = [
  'module_disabled',
  'no_matrix',
  'invalid_matrix',
  'matrix_in_use',
  'register_not_empty',
  'ratings_do_not_fit',
  'rating_incomplete',
  'rating_out_of_range',
  'invalid_owner',
  'invalid_department',
  'invalid_control_ref',
  'too_many_control_refs',
  'acceptance_note_required',
  'invalid_expiry',
  'invalid_next_review',
  'invalid_due_at',
  'register_required',
  'invalid_register',
  'risk_accepted',
  'risk_closed',
  'risk_not_assessed',
  'risk_not_accepted',
  'register_archived',
  'justification_required',
  'standard_not_found',
  'no_annex_controls',
  'title_required',
] as const;

export type RiskErrorCode = (typeof RISK_ERROR_CODES)[number];

export function isRiskErrorCode(code: string): code is RiskErrorCode {
  return (RISK_ERROR_CODES as readonly string[]).includes(code);
}

/** The error code of a failed request, if the backend sent one. */
export function riskErrorCode(error: unknown): string | null {
  return codedErrorDetail(error)?.code ?? null;
}

/**
 * The translation key (in the `risk` scope, or a global `errors.*` key) for a failed
 * risk request: the coded message when known, `risk.errors.forbidden` for a 403,
 * otherwise the neutral status message. The backend's English `message` is never shown.
 */
export function riskErrorKey(error: unknown): string {
  const code = riskErrorCode(error);
  if (code && isRiskErrorCode(code)) {
    return `risk.errors.${code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'risk.errors.forbidden';
    }
    if (error.status === 404) {
      return 'risk.errors.notFound';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}
