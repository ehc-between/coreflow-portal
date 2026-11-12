import { HttpErrorResponse } from '@angular/common/http';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the recruitment endpoints return in `detail.code`; each has `recruitment.errors.<code>`. */
export const RECRUITMENT_ERROR_CODES = [
  'already_applied',
  'application_closed',
  'approver_is_requester',
  'candidate_in_offer_or_hired',
  'candidate_required',
  'check_required',
  'checks_incomplete',
  'consent_required',
  'criteria_required',
  'duplicate_criterion',
  'entity_required',
  'invalid_department',
  'invalid_interview',
  'invalid_stage',
  'invalid_transition',
  'invalid_user',
  'module_disabled',
  'note_required',
  'offer_not_accepted',
  'offer_not_pending',
  'privacy_notice_missing',
  'recommendation_required',
  'rejection_reason_required',
  'requisition_closed',
  'requisition_has_applications',
  'requisition_locked',
  'requisition_not_open',
  'scorecard_exists',
  'scorecard_submitted',
  'source_required',
  'title_required',
  'unknown_criterion',
] as const;

export type RecruitmentErrorCode = (typeof RECRUITMENT_ERROR_CODES)[number];

export interface RecruitmentError {
  /** Translation key (scoped `recruitment.errors.*`, or a global `errors.*`). */
  readonly key: string;
  /** Extra detail fields from the response (e.g. `check_types`), for params. */
  readonly detail: Readonly<Record<string, unknown>>;
}

function detailOf(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  return detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : null;
}

/**
 * The translation key for a failed recruitment request: the coded message when
 * known, `recruitment.errors.notFound` for a 404 (missing or outside the hiring
 * team), `recruitment.errors.forbidden` for a 403, otherwise the neutral status
 * message. The backend's English `message` is never shown.
 */
export function recruitmentError(error: unknown): RecruitmentError {
  const detail = detailOf(error) ?? {};
  const code = typeof detail['code'] === 'string' ? (detail['code'] as string) : null;
  if (code && (RECRUITMENT_ERROR_CODES as readonly string[]).includes(code)) {
    return { key: `recruitment.errors.${code}`, detail };
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404) {
      return { key: 'recruitment.errors.notFound', detail };
    }
    if (error.status === 403) {
      return { key: 'recruitment.errors.forbidden', detail };
    }
    return { key: httpErrorMessageKey(error.status), detail };
  }
  return { key: 'errors.generic', detail };
}
