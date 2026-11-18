import { withUtcDefault } from '../../../core/i18n/locale';
import {
  ApplicationDetail,
  ApplicationSummary,
  Check,
  CheckStatus,
  CheckType,
  CLOSED_STAGES,
  InterviewStatus,
  MOVE_STAGES,
  MoveStage,
  OfferBlocker,
  Requisition,
  RequisitionStatus,
  Stage,
} from './recruitment.models';

/*
 * Pure display and rule helpers for the recruitment pages. The rules mirror the
 * backend (app/modules/recruitment) so the UI only offers actions that can succeed;
 * the server stays the authority and its coded errors are shown when they differ.
 *
 * Colours come from the shared tone map (`app-status-badge meaning="lifecycle"`):
 * the module's own values are mapped to the nearest lifecycle word below and the
 * badge keeps the module's label (`labelKey`).
 */

/** Lifecycle word for a pipeline stage (applied = new, in progress, hired = done …). */
export function stageToneValue(stage: Stage): string {
  switch (stage) {
    case 'applied':
      return 'submitted';
    case 'hired':
      return 'completed';
    case 'rejected':
      return 'rejected';
    case 'withdrawn':
      return 'withdrawn';
    default:
      return 'in_progress';
  }
}

/** Lifecycle word for a requisition status (open = in progress, filled = done). */
export function requisitionToneValue(status: RequisitionStatus): string {
  switch (status) {
    case 'open':
      return 'in_progress';
    case 'filled':
      return 'completed';
    default:
      return status;
  }
}

/** Lifecycle word for a background-check status. */
export function checkToneValue(status: CheckStatus): string {
  switch (status) {
    case 'requested':
      return 'submitted';
    case 'concerns':
      return 'blocked';
    case 'waived':
      return 'cancelled';
    default:
      return status;
  }
}

/** Lifecycle word for an interview status (a no-show needs attention). */
export function interviewToneValue(status: InterviewStatus): string {
  return status === 'no_show' ? 'blocked' : status;
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

/** The header layout of the actions: one next step, at most one secondary, the rest in "Mer". */
export interface RequisitionActionGroups {
  readonly primary: RequisitionAction | null;
  readonly secondary: RequisitionAction | null;
  readonly overflow: readonly RequisitionAction[];
}

const PRIMARY_ORDER: readonly RequisitionAction[] = ['approve', 'submit', 'open'];

export function groupRequisitionActions(
  actions: readonly RequisitionAction[],
): RequisitionActionGroups {
  const primary = PRIMARY_ORDER.find((a) => actions.includes(a)) ?? null;
  const secondary = primary === 'approve' && actions.includes('reject') ? 'reject' : null;
  const overflow = actions.filter((a) => a !== primary && a !== secondary);
  return { primary, secondary, overflow };
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

/** Stages after screening: moving there needs every criterion assessed (or a logged reason). */
export function needsScreening(target: Stage): boolean {
  return ['interview', 'assessment', 'reference_check', 'offer'].includes(target);
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

/**
 * Blockers that explain a disabled "Gi tilbud": the server's list when it sends one,
 * otherwise derived locally (screening, privacy notice, open required checks).
 */
export function offerBlockers(app: ApplicationDetail): readonly OfferBlocker[] {
  if (app.offer_blockers) {
    return app.offer_blockers.filter(
      (b) => b.code !== 'application_closed' && b.code !== 'offer_made',
    );
  }
  const out: OfferBlocker[] = [];
  if (!app.privacy_notice_given) {
    out.push({ code: 'privacy_notice_missing' });
  }
  const missing = app.screening_missing ?? [];
  if (missing.length > 0 && !app.screening_override) {
    out.push({ code: 'screening_incomplete', count: missing.length, missing });
  }
  const pending = pendingRequiredChecks(app.required_checks, app.checks);
  if (pending.length > 0) {
    out.push({ code: 'checks_open', count: pending.length, check_types: pending });
  }
  return out;
}

/** Whether the offer can be given only with a logged screening override. */
export function offerNeedsOverride(blockers: readonly OfferBlocker[]): boolean {
  return blockers.length > 0 && blockers.every((b) => b.code === 'screening_incomplete');
}

/** Screening progress of a summary row: "2/4" (null when the requisition has no criteria). */
export function screeningProgress(
  row: Pick<ApplicationSummary, 'screening_assessed' | 'screening_total'>,
): { readonly done: number; readonly total: number } | null {
  const total = row.screening_total ?? 0;
  return total > 0 ? { done: row.screening_assessed ?? 0, total } : null;
}

/** Checks progress of a summary row: "2/6" (null when nothing is required). */
export function checksProgress(
  row: Pick<ApplicationSummary, 'checks_done' | 'checks_required'>,
): { readonly done: number; readonly total: number } | null {
  const total = row.checks_required ?? 0;
  return total > 0 ? { done: row.checks_done ?? 0, total } : null;
}

/** Whether a stage count tile is worth showing (non-empty, or an active stage). */
export function visibleStageTiles(
  counts: Readonly<Partial<Record<Stage, number>>>,
  stages: readonly Stage[],
): Stage[] {
  return stages.filter((s) => (counts[s] ?? 0) > 0);
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

/**
 * Query params of a portal url the backend sends (`/recruitment/applications?stage=a,b`),
 * split into a router path and params.
 */
export function splitUrl(url: string): {
  readonly path: string;
  readonly queryParams: Record<string, string>;
} {
  const [path, query = ''] = url.split('?');
  const queryParams: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(query)) {
    queryParams[k] = v;
  }
  return { path, queryParams };
}
