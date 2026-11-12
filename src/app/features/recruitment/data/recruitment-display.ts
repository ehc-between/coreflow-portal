import { withUtcDefault } from '../../../core/i18n/locale';
import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  ApplicationDetail,
  Check,
  CheckStatus,
  CheckType,
  CLOSED_STAGES,
  MOVE_STAGES,
  MoveStage,
  Requisition,
  RequisitionStatus,
  Stage,
} from './recruitment.models';

/*
 * Pure display and rule helpers for the recruitment pages. The rules mirror the
 * backend (app/modules/recruitment) so the UI only offers actions that can succeed;
 * the server stays the authority and its coded errors are shown when they differ.
 */

export function requisitionStatusTone(status: RequisitionStatus): BadgeTone {
  switch (status) {
    case 'open':
      return 'pass';
    case 'approved':
      return 'info';
    case 'pending_approval':
    case 'on_hold':
      return 'warn';
    case 'rejected':
      return 'fail';
    case 'filled':
      return 'accent';
    default:
      return 'neutral';
  }
}

export function stageTone(stage: Stage): BadgeTone {
  switch (stage) {
    case 'hired':
      return 'pass';
    case 'offer':
      return 'accent';
    case 'rejected':
      return 'fail';
    case 'withdrawn':
      return 'neutral';
    case 'reference_check':
      return 'warn';
    default:
      return 'info';
  }
}

export function checkStatusTone(status: CheckStatus): BadgeTone {
  switch (status) {
    case 'passed':
      return 'pass';
    case 'waived':
      return 'neutral';
    case 'concerns':
      return 'warn';
    case 'failed':
      return 'fail';
    default:
      return 'info';
  }
}

export function riskTone(risk: string): BadgeTone {
  return risk === 'high' ? 'fail' : risk === 'medium' ? 'warn' : 'pass';
}

/** Statuses in which a requisition no longer changes. */
export function isRequisitionClosed(status: RequisitionStatus): boolean {
  return status === 'filled' || status === 'cancelled';
}

/**
 * Headcount, department, employment type, risk level and justification lock once
 * the requisition has been submitted (only draft and rejected requisitions can change them).
 */
export function isRequisitionLocked(status: RequisitionStatus): boolean {
  return status !== 'draft' && status !== 'rejected';
}

export const LOCKED_REQUISITION_FIELDS = [
  'department_id',
  'employment_type',
  'headcount',
  'role_risk',
  'justification',
] as const;

export type RequisitionAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'open'
  | 'hold'
  | 'fill'
  | 'cancel'
  | 'delete';

/** The workflow actions the caller can take on a requisition, in display order. */
export function requisitionActions(
  req: Pick<Requisition, 'status' | 'can_edit' | 'can_approve'>,
  perms: { readonly write: boolean; readonly manage: boolean },
): RequisitionAction[] {
  const actions: RequisitionAction[] = [];
  const s = req.status;
  if (perms.write && req.can_edit && (s === 'draft' || s === 'rejected')) {
    actions.push('submit');
  }
  if (req.can_approve) {
    actions.push('approve', 'reject');
  }
  if (perms.write && (s === 'approved' || s === 'on_hold')) {
    actions.push('open');
  }
  if (perms.write && s === 'open') {
    actions.push('hold');
  }
  if (perms.write && (s === 'approved' || s === 'open' || s === 'on_hold')) {
    actions.push('fill');
  }
  if (perms.write && !isRequisitionClosed(s)) {
    actions.push('cancel');
  }
  if (perms.manage) {
    actions.push('delete');
  }
  return actions;
}

/** Sum of a requisition's applications in active (not closed) stages. */
export function activeApplicationCount(req: Pick<Requisition, 'stage_counts'>): number {
  return Object.entries(req.stage_counts)
    .filter(([stage]) => !CLOSED_STAGES.includes(stage as Stage))
    .reduce((sum, [, n]) => sum + (n ?? 0), 0);
}

/** Stages an application can be moved to from `stage` (never the current one; hired is final). */
export function moveTargets(stage: Stage): MoveStage[] {
  if (stage === 'hired') {
    return [];
  }
  return MOVE_STAGES.filter((s) => s !== stage);
}

/** Whether moving to `target` needs the candidate's privacy notice (GDPR Art. 13/14). */
export function needsPrivacyNotice(target: Stage): boolean {
  return !['applied', 'screening', 'rejected', 'withdrawn'].includes(target);
}

const SETTLED_CHECK: readonly CheckStatus[] = ['passed', 'waived', 'concerns'];

/** Required check types that are not yet settled (passed, waived or marked with concerns). */
export function pendingRequiredChecks(
  required: readonly CheckType[],
  checks: readonly Pick<Check, 'check_type' | 'required' | 'status'>[],
): CheckType[] {
  const settled = new Set(
    checks.filter((c) => SETTLED_CHECK.includes(c.status)).map((c) => c.check_type),
  );
  const types = new Set<CheckType>([
    ...required,
    ...checks.filter((c) => c.required).map((c) => c.check_type),
  ]);
  return [...types].filter((t) => !settled.has(t));
}

export type ApplicationAction = 'offer' | 'accept' | 'decline' | 'hire';

/** Offer / hire actions available on an application. */
export function applicationActions(
  app: Pick<ApplicationDetail, 'stage' | 'offer_status' | 'can_edit'>,
  requisitionOpen: boolean,
): ApplicationAction[] {
  if (!app.can_edit) {
    return [];
  }
  if (app.stage === 'offer') {
    if (app.offer_status === 'extended') {
      return ['accept', 'decline'];
    }
    if (app.offer_status === 'accepted') {
      return ['hire'];
    }
    return [];
  }
  if ((MOVE_STAGES as readonly string[]).includes(app.stage) && requisitionOpen) {
    return CLOSED_STAGES.includes(app.stage) ? [] : ['offer'];
  }
  return [];
}

/** A naive-UTC backend date-time -> the `datetime-local` input value in local time. */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(withUtcDefault(value));
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** A `datetime-local` value (local time) -> an ISO UTC string for the API; null when empty. */
export function fromLocalInput(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Whether a retention date has passed (or falls within `days` from now). */
export function retentionDue(value: string | null, days = 0, now = Date.now()): boolean {
  if (!value) {
    return false;
  }
  const at = new Date(withUtcDefault(value)).getTime();
  return at - now <= days * 86_400_000;
}

/** Empty / whitespace strings become null (for optional text fields). */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}
