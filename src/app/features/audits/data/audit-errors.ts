import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the audit endpoints return in a 4xx `detail: {code}`; each has `audits.errors.<code>`. */
export const AUDIT_ERROR_CODES = [
  'module_disabled',
  'not_found',
  'title_required',
  'reason_required',
  'owner_required',
  'plan_required',
  'auditor_required',
  'certification_body_required',
  'clause_refs_required',
  'report_summary_required',
  'response_incomplete',
  'lead_auditor_required',
  'lead_must_be_user',
  'segregation_of_duties',
  'verification_required',
  'transition_not_allowed',
  'invalid_action',
  'plan_locked',
  'report_locked',
  'finding_locked',
  'programme_closed',
  'programme_has_audits',
  'auditor_check_failed',
  'auditor_exists',
  'link_exists',
  'invalid_programme',
  'invalid_certification',
  'invalid_checklist_item',
  'invalid_clause_ref',
  'invalid_date',
  'invalid_dates',
  'invalid_department',
  'invalid_framework',
  'invalid_user',
  'invalid_kind',
  'invalid_role',
  'invalid_status',
  'invalid_party_type',
  'invalid_finding_type',
  'invalid_risk_level',
] as const;

export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[number];

export function isAuditErrorCode(code: string): code is AuditErrorCode {
  return (AUDIT_ERROR_CODES as readonly string[]).includes(code);
}

/** The backend error code of a failed request, if it sent one. */
export function auditErrorCode(error: unknown): string | null {
  return codedErrorDetail(error)?.code ?? null;
}

/**
 * The translation key (in the `audits` scope, or a global `errors.*` key) for a
 * failed audit request: the coded message when known, `audits.errors.forbidden` for
 * a 403, otherwise the neutral status message. The backend's English text is never shown.
 */
export function auditErrorKey(error: unknown): string {
  const code = auditErrorCode(error);
  if (code && isAuditErrorCode(code)) {
    return `audits.errors.${code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'audits.errors.forbidden';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}

/** The competence / independence issue codes of a 409 `auditor_check_failed`. */
export function auditorCheckIssues(error: unknown): readonly string[] {
  if (!(error instanceof HttpErrorResponse)) {
    return [];
  }
  const detail = (error.error as { detail?: { code?: unknown; issues?: unknown } } | null)?.detail;
  if (detail?.code !== 'auditor_check_failed' || !Array.isArray(detail.issues)) {
    return [];
  }
  return detail.issues.filter((i): i is string => typeof i === 'string');
}
