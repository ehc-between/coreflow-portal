import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the inspections endpoints return in a 4xx `detail: {code}`; each has `inspections.errors.<code>`. */
export const INSPECTION_ERROR_CODES = [
  'module_disabled',
  'already_started',
  'answers_missing',
  'deviation_exists',
  'deviations_disabled',
  'dtstart_required',
  'finding_closed',
  'inspection_closed',
  'inspection_not_started',
  'input_required',
  'invalid_answers',
  'invalid_attachments',
  'invalid_department',
  'invalid_deviation_type',
  'invalid_document_id',
  'invalid_due_at',
  'invalid_framework',
  'invalid_inspector',
  'invalid_lead_days',
  'invalid_owner',
  'invalid_pass_threshold',
  'invalid_questions',
  'invalid_rrule',
  'invalid_severity',
  'invalid_signature',
  'invalid_status',
  'library_template_not_found',
  'no_deviation_type',
  'questions_required',
  'status_unchanged',
  'template_archived',
  'template_not_active',
  'template_required',
  'unknown_question',
  'user_not_member',
  'forbidden',
] as const;

export type InspectionErrorCode = (typeof INSPECTION_ERROR_CODES)[number];

function isInspectionErrorCode(code: string): code is InspectionErrorCode {
  return (INSPECTION_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The translation key for a failed inspections request: the coded message when known,
 * `inspections.errors.forbidden` for a 403, `inspections.errors.invalid` for other 422s,
 * otherwise the neutral global status message. The backend's English `message` is
 * never shown.
 */
export function inspectionErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && isInspectionErrorCode(detail.code)) {
    return `inspections.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'inspections.errors.forbidden';
    }
    if (error.status === 422) {
      return 'inspections.errors.invalid';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'inspections.errors.generic';
}

/** The raw `detail` object of a coded error (for extras such as `problems` or `question_ids`). */
export function errorDetail(error: unknown): Readonly<Record<string, unknown>> | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  return detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : null;
}

/** Question ids named by an `answers_missing` / `invalid_answers` error. */
export function questionIdsOf(error: unknown): readonly string[] {
  const detail = errorDetail(error);
  if (!detail) {
    return [];
  }
  if (Array.isArray(detail['question_ids'])) {
    return (detail['question_ids'] as unknown[]).filter((x): x is string => typeof x === 'string');
  }
  if (Array.isArray(detail['problems'])) {
    return (detail['problems'] as { question_id?: unknown }[])
      .map((p) => p.question_id)
      .filter((x): x is string => typeof x === 'string');
  }
  return [];
}

/** Row indexes named by an `invalid_questions` error (`problems: [{index, message}]`). */
export function problemIndexesOf(error: unknown): readonly number[] {
  const detail = errorDetail(error);
  if (!detail || !Array.isArray(detail['problems'])) {
    return [];
  }
  return (detail['problems'] as { index?: unknown }[])
    .map((p) => p.index)
    .filter((x): x is number => typeof x === 'number');
}
