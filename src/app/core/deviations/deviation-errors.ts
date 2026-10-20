import { HttpErrorResponse } from '@angular/common/http';
import { httpErrorMessageKey } from '../http/error.interceptor';

/**
 * Machine-readable codes the deviation / deviation-type endpoints return in a
 * 4xx `detail: {code, message, params?}`. Each has a translated message under
 * `deviations.errors.<code>` (params interpolated).
 */
export const DEVIATION_ERROR_CODES = [
  'duplicate_field_key',
  'options_required',
  'invalid_type_key',
  'type_key_exists',
  'type_in_use',
  'type_inactive',
  'invalid_clause',
  'owner_not_member',
  'department_not_in_org',
  'subject_not_member',
  'invalid_visibility',
  'invalid_access_level',
  'invalid_subject_type',
  'deviation_type_not_found',
  'deviation_not_found',
  'action_not_found',
  'grant_not_found',
  'insufficient_permissions',
] as const;

export type DeviationErrorCode = (typeof DEVIATION_ERROR_CODES)[number];

/**
 * Workflow codes the backend also returns on ordinary saves and action / access
 * changes (e.g. `deviation_closed` when someone closed the deviation meanwhile).
 * They reuse the status menu's `deviations.workflow.reasons.<code>` texts.
 */
export const WORKFLOW_ERROR_CODES = [
  'deviation_closed',
  'invalid_transition',
  'reason_required',
  'root_cause_required',
  'open_actions',
  'verification_required',
] as const;

/** Translated generic text for a coded error the UI doesn't know yet. */
export const UNKNOWN_ERROR_KEY = 'errors.generic';

/** A coded error detail: `code` + params are the contract, `message` an English fallback. */
export interface CodedErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** A message for NotificationService: an i18n key (or literal fallback text) + params. */
export interface ErrorMessage {
  readonly message: string;
  readonly params?: Record<string, unknown>;
}

/** The `{code, message, params?}` detail of an HTTP error, or null for any other shape. */
export function codedErrorDetail(error: unknown): CodedErrorDetail | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  if (!detail || typeof detail !== 'object') {
    return null;
  }
  const { code, message, params } = detail as {
    code?: unknown;
    message?: unknown;
    params?: unknown;
  };
  if (typeof code !== 'string') {
    return null;
  }
  return {
    code,
    message: typeof message === 'string' ? message : '',
    params: params && typeof params === 'object' ? (params as Record<string, unknown>) : {},
  };
}

/** Whether `code` is a deviation error code with a translated message. */
export function isDeviationErrorCode(code: string): code is DeviationErrorCode {
  return (DEVIATION_ERROR_CODES as readonly string[]).includes(code);
}

/** i18n key for a deviation error code. */
export function deviationErrorKey(code: DeviationErrorCode): string {
  return `deviations.errors.${code}`;
}

/**
 * The user-facing message for a coded deviation error: the translated code
 * (with its params), or the workflow reason. An unknown code gets a translated
 * generic message: the backend's `message` is English and is never shown.
 * Null when the error carries no code — the caller decides.
 */
export function codedErrorMessage(error: unknown): ErrorMessage | null {
  const detail = codedErrorDetail(error);
  if (!detail) {
    return null;
  }
  if (isDeviationErrorCode(detail.code)) {
    return { message: deviationErrorKey(detail.code), params: { ...detail.params } };
  }
  if ((WORKFLOW_ERROR_CODES as readonly string[]).includes(detail.code)) {
    return { message: `deviations.workflow.reasons.${detail.code}` };
  }
  return { message: UNKNOWN_ERROR_KEY };
}

/** Whether a failed save was rejected because the deviation is (now) closed. */
export function isDeviationClosedError(error: unknown): boolean {
  return codedErrorDetail(error)?.code === 'deviation_closed';
}

/**
 * A message for any failed deviation request whose generic toast is suppressed
 * (SKIP_ERROR_TOAST): the coded message, else `fallbackKey`, else the neutral
 * status-based message. Null for 401 (the auth layer owns it) and an uncoded
 * 403; a coded 403 (`insufficient_permissions`) is explained.
 */
export function deviationErrorMessage(error: unknown, fallbackKey?: string): ErrorMessage | null {
  const status = error instanceof HttpErrorResponse ? error.status : -1;
  if (status === 401) {
    return null;
  }
  const coded = codedErrorMessage(error);
  if (status === 403 && !coded) {
    return null;
  }
  if (coded) {
    return coded;
  }
  if (fallbackKey && status >= 400 && status < 500) {
    return { message: fallbackKey };
  }
  return { message: httpErrorMessageKey(status) };
}

/** Anything with NotificationService's `error(message, params)` shape. */
interface ErrorNotifier {
  error(message: string, params?: Record<string, unknown>): void;
}

/** Toast a failed deviation request (see {@link deviationErrorMessage}). */
export function notifyDeviationError(
  notifications: ErrorNotifier,
  error: unknown,
  fallbackKey?: string,
): void {
  const msg = deviationErrorMessage(error, fallbackKey);
  if (msg) {
    notifications.error(msg.message, msg.params);
  }
}

/**
 * Per-field errors from a 422 on deviation data: `detail.data` in both the
 * coded (`{code: "invalid_data", data: {key: {code, params, message}}}`) and the
 * legacy (`{data: {key: "English message"}}`) shape. Null for anything else.
 */
export function invalidDataErrors(error: unknown): Readonly<Record<string, unknown>> | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 422) {
    return null;
  }
  const data = (error.error as { detail?: { data?: unknown } } | null)?.detail?.data;
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

/**
 * Toast a failed create / edit of a deviation: a legacy uncoded 400 was always
 * a bad owner / department reference.
 */
export function notifyDeviationSaveError(notifications: ErrorNotifier, error: unknown): void {
  const status = error instanceof HttpErrorResponse ? error.status : -1;
  notifyDeviationError(
    notifications,
    error,
    status === 400 ? 'deviations.create.badReferenceToast' : undefined,
  );
}
