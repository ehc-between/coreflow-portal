import { HttpErrorResponse } from '@angular/common/http';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the privacy endpoints return in a 4xx `detail: {code}`; each has `privacy.errors.<code>`. */
export const PRIVACY_ERROR_CODES = [
  'not_found',
  'module_disabled',
  'invalid_owner',
  'invalid_reference',
  'field_required',
  'invalid_fields',
  'invalid_sort',
  'invalid_filter',
  'invalid_dates',
  'invalid_status',
  'ropa_incomplete',
  'dpia_required',
  'dpia_incomplete',
  'outcome_required',
  'already_extended',
  'request_closed',
  'extension_too_late',
  'delay_reason_required',
  'decision_reason_required',
  'subjects_exemption_required',
  'authority_not_required',
  'breach_decisions_pending',
  'dpa_required',
  'dpa_signed_at_required',
  'transfer_incomplete',
  'tia_incomplete',
  'transfer_not_adequate',
  'tia_conclusion_required',
  'supplementary_measures_required',
  'lia_incomplete',
  'justification_required',
  'input_required',
] as const;

export type PrivacyErrorCode = (typeof PRIVACY_ERROR_CODES)[number];

/** A translated error: the key plus the field names the backend named (raw API keys). */
export interface PrivacyErrorMessage {
  readonly key: string;
  readonly fields: readonly string[];
}

function detailOf(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  return detail && typeof detail === 'object' && !Array.isArray(detail)
    ? (detail as Record<string, unknown>)
    : null;
}

/**
 * The message for a failed privacy request: the coded message when known (with
 * the `field` / `fields` the backend named), `privacy.errors.forbidden` for a 403,
 * `privacy.errors.notFound` for a 404, otherwise the neutral status message.
 * The backend's English `message` is never shown.
 */
export function privacyError(error: unknown): PrivacyErrorMessage {
  const detail = detailOf(error);
  const code = typeof detail?.['code'] === 'string' ? (detail['code'] as string) : null;
  if (code && (PRIVACY_ERROR_CODES as readonly string[]).includes(code)) {
    const fields: string[] = [];
    if (typeof detail?.['field'] === 'string') {
      fields.push(detail['field'] as string);
    }
    if (Array.isArray(detail?.['fields'])) {
      fields.push(
        ...(detail['fields'] as unknown[]).filter((f): f is string => typeof f === 'string'),
      );
    }
    return { key: `privacy.errors.${code}`, fields };
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return { key: 'privacy.errors.forbidden', fields: [] };
    }
    if (error.status === 404) {
      return { key: 'privacy.errors.notFound', fields: [] };
    }
    return { key: httpErrorMessageKey(error.status), fields: [] };
  }
  return { key: 'errors.generic', fields: [] };
}
