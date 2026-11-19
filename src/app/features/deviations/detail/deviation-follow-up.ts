import {
  ClosureCheckKey,
  DeviationDetail as DeviationDetailModel,
} from '../../../core/deviations/deviation.models';
import { RecordMissingItem } from '../../../shared/kit/record-detail-layout';
import { StatusLineTone } from '../../../shared/kit/record-sections';

/** Where a case stands, for the status sentence of "Hovedinformasjon". */
export type DeviationState = 'open' | 'in_progress' | 'overdue' | 'ready' | 'done' | 'cancelled';

/** Done is green, open work is a to-do (never red), a cancelled case is neutral. */
export const STATE_TONE: Readonly<Record<DeviationState, StatusLineTone>> = {
  open: 'warn',
  in_progress: 'info',
  overdue: 'warn',
  ready: 'pass',
  done: 'pass',
  cancelled: 'neutral',
};

/** The state of a case: its status category, overdue, or ready to close. */
export function deviationState(dev: DeviationDetailModel, now: Date = new Date()): DeviationState {
  const category =
    dev.status_category ??
    (dev.status === 'closed' ? 'done' : dev.status === 'cancelled' ? 'cancelled' : 'open');
  if (category === 'done' || category === 'cancelled') {
    return category;
  }
  const checklist = dev.closure_checklist ?? [];
  if (checklist.length && checklist.every((c) => c.done || !c.required)) {
    return 'ready';
  }
  const overdue = dev.overdue ?? (!!dev.due_at && dev.due_at.slice(0, 10) < isoDay(now));
  if (overdue) {
    return 'overdue';
  }
  return category === 'in_progress' ? 'in_progress' : 'open';
}

function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Closing-checklist item -> the section of the page where it is done. */
const CHECK_TARGET: Readonly<Partial<Record<ClosureCheckKey, string>>> = {
  root_cause: 'dev-why',
  corrective_action_planned: 'dev-actions',
  actions_done: 'dev-actions',
  effectiveness_reviewed: 'dev-actions',
  authorities_notified: 'dev-reporting',
};

export interface DeviationMissingOptions {
  readonly editLink: readonly unknown[];
  readonly overdue: boolean;
  /** Whether the owner can be set on this page (the access panel). */
  readonly canManage: boolean;
  readonly scrollTo: (id: string) => void;
}

/**
 * What an open case still needs ("Oppfølging", docs/ux-guide.md §2.7): a missing
 * description, an overdue or missing deadline, no owner, then the closing
 * checklist (ISO 10.2) items that are not done, required ones first. Each line
 * leads to where it is done. Linking requirements is left to the card's own
 * requirements part. A closed or cancelled case needs nothing.
 */
export function deviationMissing(
  dev: DeviationDetailModel,
  options: DeviationMissingOptions,
): RecordMissingItem[] {
  const state = deviationState(dev);
  if (state === 'done' || state === 'cancelled') {
    return [];
  }
  const items: RecordMissingItem[] = [];
  const key = (name: string) => `deviations.page.missing.${name}`;
  if (!dev.description?.trim()) {
    items.push({ key: 'description', labelKey: key('description'), link: options.editLink });
  }
  if (options.overdue) {
    items.push({ key: 'overdue', labelKey: key('overdue'), link: options.editLink });
  } else if (!dev.due_at) {
    items.push({ key: 'due', labelKey: key('due'), link: options.editLink });
  }
  if (!dev.owner_user_id && options.canManage) {
    items.push({
      key: 'owner',
      labelKey: key('owner'),
      action: () => options.scrollTo('dev-access'),
    });
  }
  const open = (dev.closure_checklist ?? []).filter(
    (c) => !c.done && CHECK_TARGET[c.key] !== undefined,
  );
  for (const check of [...open.filter((c) => c.required), ...open.filter((c) => !c.required)]) {
    const target = CHECK_TARGET[check.key]!;
    if (target === 'dev-reporting' && !(dev.reporting_obligations ?? []).length) {
      continue;
    }
    items.push({
      key: `check:${check.key}`,
      labelKey: key(`checks.${check.key}`),
      action: () => options.scrollTo(target),
    });
  }
  return items;
}
