import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the AI governance endpoints return in `detail.code`; each has `aiGovernance.errors.<code>`. */
export const AI_GOVERNANCE_ERROR_CODES = [
  'ai_assessment_not_found',
  'ai_system_not_found',
  'literacy_record_not_found',
  'monitoring_entry_not_found',
  'assessment_already_draft',
  'assessment_approved',
  'assessment_locked',
  'assessment_not_completed',
  'assessment_not_draft',
  'self_approval_not_allowed',
  'assessment_incomplete',
  'invalid_ai_system',
  'invalid_answers',
  'invalid_department',
  'invalid_document',
  'invalid_kind',
  'invalid_user',
  'invalid_validity',
  'invalid_rrule',
  'item_too_long',
  'name_required',
  'section_too_long',
  'title_required',
  'unknown_section',
  'module_disabled',
] as const;

export type AiGovernanceErrorCode = (typeof AI_GOVERNANCE_ERROR_CODES)[number];

const KNOWN = new Set<string>(AI_GOVERNANCE_ERROR_CODES);

/**
 * Translation key for a failed request: the coded message when known,
 * `aiGovernance.errors.forbidden` for a 403, else the neutral status message.
 * The backend's own text is never shown.
 */
export function aiGovernanceErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && KNOWN.has(detail.code)) {
    return `aiGovernance.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'aiGovernance.errors.forbidden';
    }
    if (error.status === 409) {
      return 'aiGovernance.errors.conflict';
    }
    if (error.status === 422) {
      return 'aiGovernance.errors.invalid';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}

/** The section keys a 422 `assessment_incomplete` reports as missing (empty otherwise). */
export function missingSections(error: unknown): readonly string[] {
  if (!(error instanceof HttpErrorResponse)) {
    return [];
  }
  const detail = (error.error as { detail?: { code?: unknown; missing?: unknown } } | null)?.detail;
  if (detail?.code !== 'assessment_incomplete' || !Array.isArray(detail.missing)) {
    return [];
  }
  return detail.missing.filter((key): key is string => typeof key === 'string');
}
