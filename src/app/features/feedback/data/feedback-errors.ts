import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the feedback endpoints return in a 4xx `detail: {code}`; each has `feedback.errors.<code>`. */
export const FEEDBACK_ERROR_CODES = [
  'feedback_closed',
  'field_required',
  'invalid_owner',
  'invalid_department',
  'invalid_kind',
  'invalid_channel',
  'invalid_severity',
  'invalid_sentiment',
  'invalid_tags',
  'too_many_tags',
  'invalid_satisfaction_score',
  'invalid_dates',
  'invalid_transition',
  'complaint_not_resolved',
  'resolution_required',
  'link_exists',
  'link_not_found',
  'unknown_action',
  'invalid_questions',
  'invalid_answers',
  'survey_locked',
  'survey_has_no_questions',
  'survey_not_available',
  'response_not_found',
  'too_many_attempts',
  'no_feedback',
  'entity_required',
  'module_disabled',
] as const;

export type FeedbackErrorCode = (typeof FEEDBACK_ERROR_CODES)[number];

/** The coded error of a failed request when it is one of ours, else null. */
export function feedbackErrorCode(error: unknown): FeedbackErrorCode | null {
  const detail = codedErrorDetail(error);
  return detail && (FEEDBACK_ERROR_CODES as readonly string[]).includes(detail.code)
    ? (detail.code as FeedbackErrorCode)
    : null;
}

/**
 * The translation key for a failed feedback request: the coded message when known,
 * `feedback.errors.forbidden` for a 403, `feedback.errors.notFound` for a 404, a
 * rate-limit message for a 429, otherwise the neutral status message. The
 * backend's English `message` and `problems` are never shown.
 */
export function feedbackErrorKey(error: unknown): string {
  const code = feedbackErrorCode(error);
  if (code) {
    return `feedback.errors.${code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'feedback.errors.forbidden';
    }
    if (error.status === 404) {
      return 'feedback.errors.notFound';
    }
    if (error.status === 429) {
      return 'feedback.errors.too_many_attempts';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}
