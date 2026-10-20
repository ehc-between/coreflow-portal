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
  'deviation_closed',
];

/** Max length of a status-change reason (backend `status_reason` limit). */
export const STATUS_REASON_MAX = 2000;

const TERMINAL: readonly DeviationStatus[] = ['closed', 'cancelled'];

/** Closed / cancelled: the deviation must be reopened before it can be changed. */
export function isTerminalStatus(status: DeviationStatus): boolean {
  return TERMINAL.includes(status);
}

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
export function workflowReasonKey(
  code: string | null | undefined,
  context?: {
    readonly from: DeviationStatus;
    readonly to: DeviationStatus;
    readonly canManage: boolean;
  },
): string {
  // Reopening a closed/cancelled deviation is manage-only; the backend reports
  // it as invalid_transition, which we phrase as a permission message.
  if (
    code === 'invalid_transition' &&
    context &&
    !context.canManage &&
    isTerminalStatus(context.from) &&
    !isTerminalStatus(context.to)
  ) {
    return 'deviations.workflow.reasons.reopen_requires_manage';
  }
  return isWorkflowCode(code)
    ? `deviations.workflow.reasons.${code}`
    : 'deviations.workflow.reasons.unknown';
}

/**
 * The API sent an explicit, empty transition list on a deviation that is not
 * closed/cancelled. Every open status has at least one move for an editor, so
 * this means the user has org write but no edit reach on this (restricted)
 * deviation.
 */
export function lacksEditReach(dev: DeviationDetail): boolean {
  return (
    dev.allowed_transitions !== undefined &&
    dev.allowed_transitions.length === 0 &&
    !isTerminalStatus(dev.status)
  );
}

/** Why editing is locked (closed/cancelled, or no edit reach), or null when editable. */
export function editLockKey(dev: DeviationDetail): string | null {
  if (isTerminalStatus(dev.status)) {
    return 'deviations.workflow.closedNote';
  }
  return lacksEditReach(dev) ? 'deviations.workflow.noEditAccess' : null;
}

/** Why the status menu is disabled (no transitions offered), or null when usable. */
export function statusLockedKey(dev: DeviationDetail): string | null {
  if (dev.allowed_transitions === undefined || dev.allowed_transitions.length > 0) {
    return null;
  }
  return lacksEditReach(dev)
    ? 'deviations.workflow.noEditAccess'
    : 'deviations.workflow.noTransitions';
}

/**
 * Whether a move to `status` is still blocked per the deviation's current
 * transitions. Without transitions (older API) we can't tell, so it stays blocked.
 */
export function isStillBlocked(dev: DeviationDetail, status: DeviationStatus): boolean {
  const transition = dev.allowed_transitions?.find((t) => t.to === status);
  return transition === undefined || !!transition.blocked_by;
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
