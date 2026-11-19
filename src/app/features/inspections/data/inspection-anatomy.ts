import { RecordMissingItem } from '../../../shared/kit/record-page-context';
import { StatusLineTone } from '../../../shared/kit/record-sections';
import { isSerious } from './inspection-display';
import { Finding, InspectionDetail, TemplateDetail } from './inspection.models';

/**
 * The detail-page anatomy (docs/ux-guide.md §2.7) for inspections, findings and
 * checklist templates: the plain status sentence at the top of "Hovedinformasjon"
 * and the actionable lines of the "Oppfølging" card. Pure, so the pages and their
 * tests share one definition.
 */

/** "Ikke godkjent – 63 % av poengene, grensen er 80 %." as an i18n key + params. */
export interface StatusSentence {
  readonly key: string;
  readonly tone: StatusLineTone;
  readonly params?: Record<string, unknown>;
}

/** Formats the page needs for the sentences (the active UI locale). */
export interface SentenceFormat {
  /** 63.3 -> "63 %". */
  percent(value: number): string;
  /** A date-only / date-time value -> "9. nov. 2026". */
  day(value: string): string;
}

const DETAIL = 'inspections.detail.status';

/** How the inspection is doing, in words: planned / overdue / in progress / result / cancelled. */
export function inspectionStatusSentence(
  ins: InspectionDetail,
  fmt: SentenceFormat,
): StatusSentence {
  switch (ins.status) {
    case 'planned':
      if (ins.is_overdue && ins.due_at) {
        return { key: `${DETAIL}.overdue`, tone: 'warn', params: { date: fmt.day(ins.due_at) } };
      }
      return ins.due_at
        ? { key: `${DETAIL}.plannedDue`, tone: 'info', params: { date: fmt.day(ins.due_at) } }
        : { key: `${DETAIL}.planned`, tone: 'info' };
    case 'in_progress':
      return {
        key: `${DETAIL}.inProgress`,
        tone: ins.is_overdue ? 'warn' : 'info',
        params: { answered: ins.answered_count, total: ins.question_count },
      };
    case 'cancelled':
      return ins.cancel_reason?.trim()
        ? {
            key: `${DETAIL}.cancelledReason`,
            tone: 'neutral',
            params: { reason: ins.cancel_reason.trim() },
          }
        : { key: `${DETAIL}.cancelled`, tone: 'neutral' };
    default: {
      const passed = ins.result === 'passed';
      const word = passed ? 'passed' : 'failed';
      if (!ins.result) {
        return { key: `${DETAIL}.completed`, tone: 'neutral' };
      }
      if (ins.score_pct !== null && ins.pass_threshold !== null) {
        return {
          key: `${DETAIL}.${word}Score`,
          tone: passed ? 'pass' : 'fail',
          params: { score: fmt.percent(ins.score_pct), threshold: fmt.percent(ins.pass_threshold) },
        };
      }
      return passed
        ? { key: `${DETAIL}.passedAll`, tone: 'pass' }
        : {
            key: ins.failed_count === 1 ? `${DETAIL}.failedOne` : `${DETAIL}.failedAny`,
            tone: 'fail',
            params: { count: ins.failed_count },
          };
    }
  }
}

/** What the "Oppfølging" card of an inspection lists. */
export interface InspectionMissingOptions {
  /** The edit page, or null when the plan cannot be changed now. */
  readonly editLink: readonly unknown[] | null;
  /** The run page, or null when the caller cannot perform it. */
  readonly runLink: readonly unknown[] | null;
  /** Opens a finding in the side panel. */
  readonly openFinding: (id: string) => void;
}

/**
 * The inspection's to-dos: who does it, an overdue start, unanswered questions,
 * serious findings without a deviation and findings that are still open.
 */
export function inspectionMissing(
  ins: InspectionDetail,
  opts: InspectionMissingOptions,
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  const open = ins.status === 'planned' || ins.status === 'in_progress';
  if (open && opts.runLink && ins.is_overdue) {
    items.push({
      key: 'overdue',
      labelKey: 'inspections.detail.missing.overdue',
      link: opts.runLink,
    });
  }
  if (open && !ins.inspector && opts.editLink) {
    items.push({
      key: 'inspector',
      labelKey: 'inspections.detail.missing.inspector',
      link: opts.editLink,
    });
  }
  if (ins.status === 'in_progress' && opts.runLink) {
    const left = ins.question_count - ins.answered_count;
    if (left > 0) {
      items.push({
        key: 'unanswered',
        labelKey:
          left === 1
            ? 'inspections.detail.missing.unansweredOne'
            : 'inspections.detail.missing.unanswered',
        params: { count: left },
        link: opts.runLink,
      });
    }
  }
  const serious = ins.findings.find(
    (f) => f.status === 'open' && !f.deviation && isSerious(f.severity),
  );
  if (serious) {
    items.push({
      key: 'deviation',
      labelKey: 'inspections.detail.missing.deviation',
      params: { code: serious.code },
      action: () => opts.openFinding(serious.id),
    });
  }
  const openFindings = ins.findings.filter((f) => f.status === 'open');
  if (openFindings.length > 0) {
    items.push({
      key: 'findings',
      labelKey:
        openFindings.length === 1
          ? 'inspections.detail.missing.openFindingOne'
          : 'inspections.detail.missing.openFindings',
      params: { count: openFindings.length, code: openFindings[0].code },
      action: () => opts.openFinding(openFindings[0].id),
    });
  }
  if (open && !ins.owner && opts.editLink) {
    items.push({ key: 'owner', labelKey: 'inspections.detail.missing.owner', link: opts.editLink });
  }
  return items;
}

const FINDING = 'inspections.findings.status';

/** How a finding is doing: open (due / overdue), closed, and whether the fix was checked. */
export function findingStatusSentence(
  f: Finding,
  fmt: Pick<SentenceFormat, 'day'>,
): StatusSentence {
  if (f.status === 'open') {
    if (f.is_overdue && f.due_at) {
      return { key: `${FINDING}.overdue`, tone: 'warn', params: { date: fmt.day(f.due_at) } };
    }
    return f.due_at
      ? { key: `${FINDING}.openDue`, tone: 'warn', params: { date: fmt.day(f.due_at) } }
      : { key: `${FINDING}.open`, tone: 'warn' };
  }
  return f.effectiveness_checked_at
    ? { key: `${FINDING}.closedChecked`, tone: 'pass' }
    : { key: `${FINDING}.closedUnchecked`, tone: 'warn' };
}

/** What the finding's "Oppfølging" lists (actions are the panel's own buttons). */
export interface FindingMissingOptions {
  readonly canEdit: boolean;
  readonly canEscalate: boolean;
  readonly edit: () => void;
  readonly escalate: () => void;
  readonly checkEffect: () => void;
}

export function findingMissing(f: Finding, opts: FindingMissingOptions): RecordMissingItem[] {
  if (!opts.canEdit) {
    return [];
  }
  const items: RecordMissingItem[] = [];
  if (f.status === 'open') {
    if (!f.deviation && isSerious(f.severity) && opts.canEscalate) {
      items.push({
        key: 'deviation',
        labelKey: 'inspections.findings.missing.deviation',
        action: opts.escalate,
      });
    }
    if (!f.owner) {
      items.push({
        key: 'owner',
        labelKey: 'inspections.findings.missing.owner',
        action: opts.edit,
      });
    }
    if (!f.due_at) {
      items.push({ key: 'due', labelKey: 'inspections.findings.missing.due', action: opts.edit });
    }
    if (!f.root_cause?.trim()) {
      items.push({
        key: 'cause',
        labelKey: 'inspections.findings.missing.cause',
        action: opts.edit,
      });
    }
  } else if (!f.effectiveness_checked_at) {
    items.push({
      key: 'effect',
      labelKey: 'inspections.findings.missing.effect',
      action: opts.checkEffect,
    });
  }
  return items;
}

const TEMPLATE = 'inspections.templates.status';

/** Whether the checklist can be used: active, draft (publish first) or archived. */
export function templateStatusSentence(t: TemplateDetail): StatusSentence {
  switch (t.status) {
    case 'active':
      return { key: `${TEMPLATE}.active`, tone: 'pass', params: { version: t.version } };
    case 'draft':
      return { key: `${TEMPLATE}.draft`, tone: 'warn' };
    default:
      return { key: `${TEMPLATE}.archived`, tone: 'neutral' };
  }
}

export interface TemplateMissingOptions {
  readonly editLink: readonly unknown[] | null;
  readonly publish: (() => void) | null;
}

/** A checklist's to-dos: questions, a description, publishing a draft. */
export function templateMissing(
  t: TemplateDetail,
  opts: TemplateMissingOptions,
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (t.status === 'archived') {
    return items;
  }
  if (t.question_count === 0 && opts.editLink) {
    items.push({
      key: 'questions',
      labelKey: 'inspections.templates.missing.questions',
      link: opts.editLink,
    });
  }
  if (t.status === 'draft' && t.question_count > 0 && opts.publish) {
    items.push({
      key: 'publish',
      labelKey: 'inspections.templates.missing.publish',
      action: opts.publish,
    });
  }
  if (!t.description?.trim() && opts.editLink) {
    items.push({
      key: 'description',
      labelKey: 'inspections.templates.missing.description',
      link: opts.editLink,
    });
  }
  return items;
}
