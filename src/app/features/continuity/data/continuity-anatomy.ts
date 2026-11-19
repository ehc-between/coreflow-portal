import type { RecordMissingItem } from '../../../shared/kit/record-page-context';
import type { StatusLineTone } from '../../../shared/kit/record-sections';
import { orderedActions } from './continuity-display';
import {
  BiaDetail,
  ControlledAction,
  ControlledDetail,
  ExerciseDetail,
  PlanDetail,
  PlanIct,
} from './continuity.models';

/**
 * Detail-page anatomy (docs/ux-guide.md §2.7) for the continuity records: the status
 * sentences of "Hovedinformasjon", where the header actions go, and the to-dos of the
 * "Oppfølging" card. Pure functions, so the pages stay thin and the rules testable.
 */

/** A status sentence: an i18n key, the values it needs and the tone. */
export interface ContinuityStatusLine {
  readonly key: string;
  readonly tone: StatusLineTone;
  /** A day (ISO) the sentence names, formatted by the page. */
  readonly date?: string | null;
  readonly name?: string | null;
  readonly version?: number;
}

const STATUS = 'continuity.detail.status';

/**
 * Where a BIA or plan stands in approval, in plain words: approved is done (green), a
 * draft or one waiting for approval is a to-do (amber, never red), retired is neutral.
 */
export function controlledStatusLine(r: ControlledDetail): ContinuityStatusLine {
  switch (r.status) {
    case 'approved':
      if (r.approved_at) {
        return {
          key: `${STATUS}.approvedOn`,
          tone: 'pass',
          date: r.approved_at,
          name: r.approved_by?.name ?? null,
          version: r.version,
        };
      }
      return r.approved_by?.name
        ? {
            key: `${STATUS}.approvedBy`,
            tone: 'pass',
            name: r.approved_by.name,
            version: r.version,
          }
        : { key: `${STATUS}.approved`, tone: 'pass', version: r.version };
    case 'in_review':
      return r.submitted_at
        ? {
            key: `${STATUS}.inReviewOn`,
            tone: 'warn',
            date: r.submitted_at,
            name: r.submitted_by?.name ?? null,
          }
        : { key: `${STATUS}.inReview`, tone: 'warn' };
    case 'retired':
      return { key: `${STATUS}.retired`, tone: 'neutral' };
    default:
      return { key: `${STATUS}.draft`, tone: 'warn' };
  }
}

/** A header action of a BIA or plan: a workflow step or "Rediger". */
export type ControlledHeaderAction = Exclude<ControlledAction, 'retire'> | 'edit';

export interface PlacedActions {
  readonly primary: ControlledHeaderAction | null;
  readonly secondary: readonly ControlledHeaderAction[];
  readonly overflow: readonly ControlledHeaderAction[];
}

/** The review is due now or soon (the one time "Merk som gjennomgått" is the next step). */
export function reviewDue(r: Pick<ControlledDetail, 'review_state'>): boolean {
  return r.review_state === 'overdue' || r.review_state === 'due_soon';
}

/**
 * One primary action (§2.7 rule 1): the next workflow step (submit, approve, restore,
 * or the review when it is due), else "Rediger". Reject sits next to approve; Rediger
 * stays visible as a secondary when a step took the primary place, except while the
 * record waits for approval (then it is in "Mer"). "Fas ut" is always in "Mer" (the
 * page adds it), and so is a review that is not due yet.
 */
export function placeControlledActions(r: ControlledDetail): PlacedActions {
  const steps = orderedActions(r.allowed_actions).filter(
    (a): a is Exclude<ControlledAction, 'retire'> => a !== 'retire',
  );
  const step =
    steps.find(
      (a) =>
        a === 'submit' || a === 'approve' || a === 'restore' || (a === 'review' && reviewDue(r)),
    ) ?? null;
  const secondary: ControlledHeaderAction[] = [];
  const overflow: ControlledHeaderAction[] = [];
  if (step === 'approve' && steps.includes('reject')) {
    secondary.push('reject');
  }
  if (step && r.can_edit) {
    (r.status === 'in_review' ? overflow : secondary).push('edit');
  }
  for (const other of steps) {
    if (other !== step && !secondary.includes(other)) {
      overflow.push(other);
    }
  }
  return { primary: step ?? (r.can_edit ? 'edit' : null), secondary, overflow };
}

/** The ICT services that cannot recover within a plan's targets. */
export function planIctGaps(plan: Pick<PlanDetail, 'ict_dependencies'>): PlanIct[] {
  return (plan.ict_dependencies ?? []).filter((s) =>
    s.issues.some((i) => i === 'plan_rto_gap' || i === 'plan_rpo_gap'),
  );
}

/** Callbacks of the to-dos; null when the user may not take that step. */
export interface ControlledMissingOptions {
  readonly editLink: readonly unknown[];
  /** "Merk som gjennomgått" (allowed), or null. */
  readonly review: (() => void) | null;
}

function reviewItem(r: ControlledDetail, opts: ControlledMissingOptions): RecordMissingItem[] {
  return r.review_state === 'overdue' && opts.review && r.status !== 'retired'
    ? [{ key: 'review', labelKey: 'continuity.detail.missing.review', action: opts.review }]
    : [];
}

/** What a business impact analysis still needs, for the "Oppfølging" card. */
export function biaMissing(
  bia: BiaDetail,
  opts: ControlledMissingOptions & {
    /** Creates a plan covering this BIA (the user may write), or null. */
    readonly createPlan: (() => void) | null;
  },
): RecordMissingItem[] {
  if (bia.status === 'retired') {
    return [];
  }
  const items = reviewItem(bia, opts);
  if (!bia.can_edit) {
    return items;
  }
  if (bia.plans.length === 0 && opts.createPlan) {
    items.push({
      key: 'plan',
      labelKey: 'continuity.detail.missing.biaPlan',
      action: opts.createPlan,
    });
  }
  if (bia.rto_minutes === null || bia.mtpd_minutes === null) {
    items.push({
      key: 'targets',
      labelKey: 'continuity.detail.missing.biaTargets',
      link: opts.editLink,
    });
  } else if (bia.suggested_mtpd_minutes && bia.mtpd_minutes > bia.suggested_mtpd_minutes) {
    items.push({
      key: 'mtpd',
      labelKey: 'continuity.detail.missing.biaMtpd',
      link: opts.editLink,
    });
  }
  const ictGaps = bia.dependencies.filter((d) => d.ict_system_id && d.ict_readiness === 'gap');
  if (ictGaps.length > 0) {
    items.push({
      key: 'ict',
      labelKey:
        ictGaps.length === 1
          ? 'continuity.detail.missing.ictGapOne'
          : 'continuity.detail.missing.ictGap',
      params: { name: ictGaps[0].name, count: ictGaps.length },
      link: ['/continuity/ict-systems', ictGaps[0].ict_system_id],
    });
  }
  if (!bia.process) {
    items.push({
      key: 'process',
      labelKey: 'continuity.detail.missing.biaProcess',
      link: opts.editLink,
    });
  }
  if (!bia.owner) {
    items.push({ key: 'owner', labelKey: 'continuity.detail.missing.owner', link: opts.editLink });
  }
  return items;
}

/** What a continuity plan still needs, for the "Oppfølging" card. */
export function planMissing(
  plan: PlanDetail,
  opts: ControlledMissingOptions & {
    /** Plans an exercise of this plan (the user may write), or null. */
    readonly planExercise: (() => void) | null;
    /** Prints the current version (the user may write), or null. */
    readonly print: (() => void) | null;
  },
): RecordMissingItem[] {
  if (plan.status === 'retired') {
    return [];
  }
  const items = reviewItem(plan, opts);
  const gaps = planIctGaps(plan);
  if (gaps.length > 0) {
    items.push({
      key: 'ict',
      labelKey:
        gaps.length === 1
          ? 'continuity.detail.missing.ictGapOne'
          : 'continuity.detail.missing.ictGap',
      params: { name: gaps[0].name, count: gaps.length },
      link: ['/continuity/ict-systems', gaps[0].id],
    });
  }
  if (plan.can_edit && plan.bias.length === 0) {
    items.push({
      key: 'bias',
      labelKey: 'continuity.detail.missing.planBias',
      link: opts.editLink,
    });
  }
  if (plan.can_edit && plan.steps.length === 0) {
    items.push({
      key: 'steps',
      labelKey: 'continuity.detail.missing.planSteps',
      link: opts.editLink,
    });
  }
  if (!plan.last_exercised_on && plan.exercises.length === 0 && opts.planExercise) {
    items.push({
      key: 'exercise',
      labelKey: 'continuity.detail.missing.planExercise',
      action: opts.planExercise,
    });
  }
  if (plan.status === 'approved' && !plan.distribution_current && opts.print) {
    items.push({
      key: 'print',
      labelKey: plan.distributed_version
        ? 'continuity.detail.missing.planReprint'
        : 'continuity.detail.missing.planPrint',
      action: opts.print,
    });
  }
  if (plan.can_edit && !plan.owner) {
    items.push({ key: 'owner', labelKey: 'continuity.detail.missing.owner', link: opts.editLink });
  }
  return items;
}

/** Marked successful although the recovery target was missed. */
export function outcomeConflict(e: Pick<ExerciseDetail, 'outcome' | 'rto_met'>): boolean {
  return e.outcome === 'successful' && e.rto_met === false;
}

/**
 * Where an exercise stands, in plain words: planned (with the date), overdue (a to-do),
 * the outcome once held (green only when successful and the target was not missed),
 * or cancelled (neutral).
 */
export function exerciseStatusLine(e: ExerciseDetail): ContinuityStatusLine {
  const EX = `${STATUS}.exercise`;
  if (e.status === 'cancelled') {
    return { key: `${EX}.cancelled`, tone: 'neutral' };
  }
  if (e.status === 'completed') {
    const date = e.conducted_on ?? e.completed_at;
    if (outcomeConflict(e)) {
      return { key: `${EX}.conflict`, tone: 'warn', date };
    }
    switch (e.outcome) {
      case 'successful':
        return { key: `${EX}.successful`, tone: 'pass', date };
      case 'partially_successful':
        return { key: `${EX}.partial`, tone: 'warn', date };
      case 'unsuccessful':
        return { key: `${EX}.unsuccessful`, tone: 'warn', date };
      default:
        return { key: `${EX}.completed`, tone: 'pass', date };
    }
  }
  if (e.overdue) {
    return { key: `${EX}.overdue`, tone: 'warn', date: e.scheduled_on };
  }
  return e.scheduled_on
    ? { key: `${EX}.planned`, tone: 'info', date: e.scheduled_on }
    : { key: `${EX}.undated`, tone: 'warn' };
}

/** What an exercise still needs, for the "Oppfølging" card. */
export function exerciseMissing(
  e: ExerciseDetail,
  opts: {
    readonly editLink: readonly unknown[];
    /** Opens "Registrer resultatet" (allowed), or null. */
    readonly complete: (() => void) | null;
    /** Scrolls to the follow-up of the lessons, or null. */
    readonly followUp: (() => void) | null;
  },
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (e.status === 'cancelled') {
    return items;
  }
  if (e.status === 'planned') {
    if (e.overdue && opts.complete) {
      items.push({
        key: 'result',
        labelKey: 'continuity.detail.missing.exerciseResult',
        action: opts.complete,
      });
    }
    if (e.can_edit && !e.scheduled_on) {
      items.push({
        key: 'date',
        labelKey: 'continuity.detail.missing.exerciseDate',
        link: opts.editLink,
      });
    }
  }
  if (e.status === 'completed' && e.lessons_need_follow_up && opts.followUp) {
    items.push({
      key: 'followUp',
      labelKey: 'continuity.detail.missing.exerciseFollowUp',
      action: opts.followUp,
    });
  }
  if (e.can_edit && !e.plan && !e.ict_system) {
    items.push({
      key: 'subject',
      labelKey: 'continuity.detail.missing.exerciseSubject',
      link: opts.editLink,
    });
  }
  if (e.can_edit && !e.owner) {
    items.push({ key: 'owner', labelKey: 'continuity.detail.missing.owner', link: opts.editLink });
  }
  return items;
}
