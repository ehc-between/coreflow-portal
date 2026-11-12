import { HttpErrorResponse } from '@angular/common/http';
import { httpErrorMessageKey } from '../http/error.interceptor';
import { DefinitionIssue, FieldIssue } from './record.models';

/**
 * Codes the record-type / workflow / instance / approval endpoints return in a
 * 4xx `{"detail": {"code": ...}}`. Each has a message under `records.errors.<code>`
 * in the `records` i18n scope.
 */
export const RECORDS_ERROR_CODES = [
  'module_disabled',
  'record_type_key_taken',
  'record_type_not_found',
  'record_type_version_not_found',
  'invalid_fields',
  'invalid_layout',
  'invalid_data',
  'unknown_workflow_version',
  'workflow_module_mismatch',
  'workflow_key_taken',
  'workflow_not_found',
  'workflow_version_not_found',
  'workflow_deleted',
  'invalid_definition',
  'workflow_in_use',
  'design_failed',
  'template_not_found',
  'template_installed',
  'workflow_not_started',
  'workflow_already_started',
  'unsupported_entity_type',
  'transition_not_allowed',
  'approval_pending',
  'guard_failed',
  'no_approver',
  'required_fields',
  'comment_required',
  'not_an_approver',
  'segregation_of_duties',
  'already_decided',
  'approval_not_pending',
  'approval_not_found',
  'not_requester',
] as const;

export type RecordsErrorCode = (typeof RECORDS_ERROR_CODES)[number];

/** `transition_not_allowed` reasons, each under `records.errors.reasons.<reason>`. */
export const TRANSITION_REASONS = ['unknown_transition', 'wrong_state', 'not_permitted'] as const;

/** A parsed `detail` object: the code plus every extra key the backend sent. */
export interface RecordsErrorDetail {
  readonly status: number;
  readonly code: string | null;
  readonly extra: Readonly<Record<string, unknown>>;
}

/** A toast-ready message: an i18n key plus params. */
export interface RecordsErrorMessage {
  readonly key: string;
  readonly params?: Record<string, unknown>;
}

export function recordsErrorDetail(error: unknown): RecordsErrorDetail {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: -1, code: null, extra: {} };
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return { status: error.status, code: null, extra: {} };
  }
  const { code, ...extra } = detail as Record<string, unknown>;
  return { status: error.status, code: typeof code === 'string' ? code : null, extra };
}

export function isRecordsErrorCode(code: string | null): code is RecordsErrorCode {
  return code !== null && (RECORDS_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The message for a failed records request. Coded errors map to their own text
 * (`transition_not_allowed` to its reason, `guard_failed` to the guard); a 503
 * means the assistant is off; anything else falls back to the neutral status text.
 * Null for 401 (the auth layer owns it).
 */
export function recordsErrorMessage(error: unknown): RecordsErrorMessage | null {
  const detail = recordsErrorDetail(error);
  if (detail.status === 401) {
    return null;
  }
  if (detail.status === 503) {
    return { key: 'records.errors.ai_unavailable' };
  }
  if (detail.code === 'transition_not_allowed') {
    const reason = String(detail.extra['reason'] ?? '');
    return {
      key: (TRANSITION_REASONS as readonly string[]).includes(reason)
        ? `records.errors.reasons.${reason}`
        : 'records.errors.transition_not_allowed',
    };
  }
  if (detail.code === 'guard_failed') {
    return { key: guardLabelKey(String(detail.extra['guard'] ?? '')) };
  }
  if (detail.code === 'required_fields') {
    const fields = detail.extra['fields'];
    return {
      key: 'records.errors.required_fields',
      params: { fields: Array.isArray(fields) ? fields.join(', ') : '' },
    };
  }
  if (isRecordsErrorCode(detail.code)) {
    return { key: `records.errors.${detail.code}` };
  }
  if (detail.status === 403) {
    return { key: 'errors.forbidden' };
  }
  return { key: detail.status < 0 ? 'errors.generic' : httpErrorMessageKey(detail.status) };
}

/** Built-in guard names with their own explanation (`records.guards.<name>`). */
export const KNOWN_GUARDS = ['no_open_tasks', 'deviation_closure', 'approval_pending'] as const;

/** i18n key explaining why a guard blocks a transition; unknown guards get a generic text. */
export function guardLabelKey(guard: string | null): string {
  return guard && (KNOWN_GUARDS as readonly string[]).includes(guard)
    ? `records.guards.${guard}`
    : 'records.guards.unknown';
}

/** The `errors` list of a 422 `invalid_definition`. */
export function definitionIssues(error: unknown): readonly DefinitionIssue[] {
  const detail = recordsErrorDetail(error);
  if (detail.code !== 'invalid_definition') {
    return [];
  }
  const errors = detail.extra['errors'];
  return Array.isArray(errors) ? (errors as DefinitionIssue[]) : [];
}

/** The `errors` list of a 422 `invalid_fields` / `invalid_layout`. */
export function fieldIssues(error: unknown): readonly FieldIssue[] {
  const detail = recordsErrorDetail(error);
  if (detail.code !== 'invalid_fields' && detail.code !== 'invalid_layout') {
    return [];
  }
  const errors = detail.extra['errors'];
  return Array.isArray(errors) ? (errors as FieldIssue[]) : [];
}

/** Known issue codes with a translated explanation (`records.issues.<code>`). */
export const ISSUE_CODES = [
  'duplicate_state',
  'unknown_state',
  'duplicate_transition',
  'invalid_field_key',
  'invalid_role',
  'invalid_permission',
  'invalid_guard',
  'invalid_value',
  'invalid_field',
  'duplicate_key',
  'options_required',
  'duplicate_option',
  'invalid_range',
  'entity_type_required',
  'formula_required',
  'invalid_formula',
  'invalid_visible_if',
  'too_many_fields',
  'too_many_sections',
  'invalid_section',
  'duplicate_section',
  'unknown_field',
  'field_placed_twice',
  'no_states',
  'no_label',
  'invalid_key',
  'no_from',
  'approval_without_approver',
  'quorum_required',
  'assignee_value_required',
  'notify_value_required',
] as const;

export function issueKey(code: string): string {
  return (ISSUE_CODES as readonly string[]).includes(code)
    ? `records.issues.${code}`
    : 'records.issues.unknown';
}
