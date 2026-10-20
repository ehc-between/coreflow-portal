import { HttpErrorResponse } from '@angular/common/http';
import {
  DeviationDetail,
  DeviationStatus,
  WorkflowBlockingAction,
  WorkflowErrorCode,
} from '../../core/deviations/deviation.models';
import { STATUS_OPTIONS } from './deviation-enums';

/** A row in the status menu: a target status and whether/why it can be chosen. */
export interface StatusMenuEntry {
  readonly status: DeviationStatus;
  readonly requiresReason: boolean;
  /** Set when the transition is currently blocked. */
  readonly blockedBy: WorkflowErrorCode | null;
}

/** A parsed workflow rejection (409) from a status change. */
export interface WorkflowError {
  readonly code: WorkflowErrorCode;
  readonly message: string;
  readonly blocking: readonly WorkflowBlockingAction[];
}

const WORKFLOW_CODES: readonly WorkflowErrorCode[] = [
  'invalid_transition',
  'reason_required',
  'root_cause_required',
  'open_actions',
  'verification_required',
];

function isWorkflowCode(code: unknown): code is WorkflowErrorCode {
  return typeof code === 'string' && (WORKFLOW_CODES as readonly string[]).includes(code);
}

/**
 * The status menu for a deviation. Uses the backend's `allowed_transitions`
 * when present; an API without workflow rules falls back to every other status
 * (the server still has the final say via 409).
 */
export function statusMenuEntries(dev: DeviationDetail): readonly StatusMenuEntry[] {
  if (dev.allowed_transitions) {
    return dev.allowed_transitions
      .filter((t) => t.to !== dev.status)
      .map((t) => ({
        status: t.to,
        requiresReason: t.requires_reason,
        blockedBy: t.blocked_by ?? null,
      }));
  }
  return STATUS_OPTIONS.filter((s) => s !== dev.status).map((status) => ({
    status,
    requiresReason: false,
    blockedBy: null,
  }));
}

/**
 * i18n key explaining a workflow code (used both for blocked menu entries and
 * 409 messages). Unknown codes fall back to a generic explanation.
 */
export function workflowReasonKey(code: string | null | undefined): string {
  return isWorkflowCode(code)
    ? `deviations.workflow.reasons.${code}`
    : 'deviations.workflow.reasons.unknown';
}

/**
 * Parse a 409 `{detail:{code, message, blocking?}}` workflow rejection. Returns
 * null for anything else (other statuses, malformed bodies).
 */
export function parseWorkflowError(error: unknown): WorkflowError | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) {
    return null;
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  if (!detail || typeof detail !== 'object') {
    return null;
  }
  const { code, message, blocking } = detail as {
    code?: unknown;
    message?: unknown;
    blocking?: unknown;
  };
  if (typeof code !== 'string') {
    return null;
  }
  const blockingActions = Array.isArray(blocking)
    ? blocking.filter(
        (b): b is WorkflowBlockingAction =>
          !!b &&
          typeof b === 'object' &&
          typeof (b as WorkflowBlockingAction).action_id === 'string',
      )
    : [];
  return {
    code: code as WorkflowErrorCode,
    message: typeof message === 'string' ? message : '',
    blocking: blockingActions,
  };
}

/**
 * i18n key for a non-workflow failure of a status change (the generic toast is
 * suppressed upstream). Null for 401/403, which the auth layer owns.
 */
export function statusErrorKey(error: unknown): string | null {
  const status = error instanceof HttpErrorResponse ? error.status : -1;
  if (status === 401 || status === 403) {
    return null;
  }
  if (status === 0) {
    return 'errors.network';
  }
  if (status === 404) {
    return 'errors.notFound';
  }
  if (status >= 500) {
    return 'errors.server';
  }
  return 'errors.generic';
}
