import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the contract endpoints return in a 4xx `detail: {code}`; each has `contracts.errors.<code>`. */
export const CONTRACT_ERROR_CODES = [
  'contract_closed',
  'field_required',
  'invalid_action',
  'invalid_attachment',
  'invalid_contract_type',
  'invalid_currency',
  'invalid_dates',
  'invalid_department',
  'invalid_owner',
  'invalid_transition',
  'note_required',
  'renewal_term_missing',
  'too_many_parties',
  'module_disabled',
] as const;

export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

/**
 * The translation key for a failed contract request: the coded message when known,
 * `contracts.errors.forbidden` for a 403, `contracts.errors.notFound` for a 404,
 * otherwise the neutral status message. The backend's English `message` is never shown.
 */
export function contractErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && (CONTRACT_ERROR_CODES as readonly string[]).includes(detail.code)) {
    return `contracts.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'contracts.errors.forbidden';
    }
    if (error.status === 404) {
      return 'contracts.errors.notFound';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}
