import type { RecordMissingItem } from '../../../shared/kit/record-page-context';
import type { StatusLineTone } from '../../../shared/kit/record-sections';
import { isOpenAssignment } from './training-display';
import { Assignment, CourseDetail } from './training.models';

/**
 * Detail-page anatomy (docs/ux-guide.md §2.7) for the training records: the
 * status sentences of "Hovedinformasjon" and the to-dos of the "Oppfølging" card.
 */

/** A status sentence: an i18n key, its params and the tone. */
export interface StatusSentence {
  readonly key: string;
  readonly params?: Record<string, unknown>;
  readonly tone: StatusLineTone;
}

/** "Publisert – kurset kan tas og tildeles." Draft is a to-do (amber), archived is neutral. */
export function courseStatusSentence(
  course: Pick<CourseDetail, 'status' | 'kind'>,
): StatusSentence {
  if (course.status === 'published') {
    return {
      key:
        course.kind === 'external'
          ? 'training.detail.statusLine.publishedExternal'
          : 'training.detail.statusLine.published',
      tone: 'pass',
    };
  }
  if (course.status === 'archived') {
    return { key: 'training.detail.statusLine.archived', tone: 'neutral' };
  }
  return { key: 'training.detail.statusLine.draft', tone: 'warn' };
}

/** What the course still needs, as actionable lines (who may act decides what is shown). */
export function courseMissing(
  course: CourseDetail,
  options: {
    readonly editLink: readonly unknown[];
    /** Opens the publish dialog (draft, may edit), or null. */
    readonly publish: (() => void) | null;
    /** Scrolls to the rules ("Hvem må ta kurset"), or null when the user cannot manage them. */
    readonly rules: (() => void) | null;
    /** The user oversees training (sees everyone's assignments). */
    readonly oversee: boolean;
  },
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  const { editLink } = options;
  const draft = course.status === 'draft';
  if (course.can_edit && draft && course.source === 'ai') {
    items.push({ key: 'aiDraft', labelKey: 'training.detail.missing.aiDraft', link: editLink });
  }
  if (course.can_edit && draft && course.kind === 'course' && course.lessons.length === 0) {
    items.push({ key: 'lessons', labelKey: 'training.detail.missing.lessons', link: editLink });
  }
  if (
    course.can_edit &&
    course.kind === 'read_and_understood' &&
    !course.document &&
    !course.document_id
  ) {
    items.push({ key: 'document', labelKey: 'training.detail.missing.document', link: editLink });
  }
  if (draft && options.publish) {
    items.push({
      key: 'publish',
      labelKey: 'training.detail.missing.publish',
      action: options.publish,
    });
  }
  if (course.status === 'published' && course.rule_count === 0 && options.rules) {
    items.push({ key: 'rules', labelKey: 'training.detail.missing.rules', action: options.rules });
  }
  if (options.oversee && course.status !== 'archived' && course.counts.overdue > 0) {
    items.push({
      key: 'overdue',
      labelKey:
        course.counts.overdue === 1
          ? 'training.detail.missing.overdueOne'
          : 'training.detail.missing.overdue',
      params: { count: course.counts.overdue },
      link: ['/training/assignments'],
      queryParams: { course: course.id, overdue: 'true' },
    });
  }
  if (course.can_edit && course.status !== 'archived' && !course.owner) {
    items.push({ key: 'owner', labelKey: 'training.detail.missing.owner', link: editLink });
  }
  return items;
}

/**
 * "Forfalt – fristen var 9. nov. 2026, og kurset er ikke fullført." `day` formats a
 * date for the sentence: `day` a date-only field (the due date), `date` a date-time.
 */
export function assignmentStatusSentence(
  a: Pick<Assignment, 'status' | 'overdue' | 'due_at' | 'started_at' | 'completed_at'>,
  fmt: { readonly day: (value: string) => string; readonly date: (value: string) => string },
): StatusSentence {
  const base = 'training.assignmentDetail.statusLine.';
  if (a.status === 'completed') {
    return a.completed_at
      ? { key: base + 'completedOn', params: { date: fmt.date(a.completed_at) }, tone: 'pass' }
      : { key: base + 'completed', tone: 'pass' };
  }
  if (a.status === 'cancelled') {
    return { key: base + 'cancelled', tone: 'neutral' };
  }
  if (a.overdue && a.due_at) {
    return { key: base + 'overdue', params: { date: fmt.day(a.due_at) }, tone: 'warn' };
  }
  if (a.status === 'in_progress' || a.started_at) {
    return a.due_at
      ? { key: base + 'inProgressDue', params: { date: fmt.day(a.due_at) }, tone: 'info' }
      : { key: base + 'inProgress', tone: 'info' };
  }
  return a.due_at
    ? { key: base + 'assignedDue', params: { date: fmt.day(a.due_at) }, tone: 'info' }
    : { key: base + 'assigned', tone: 'info' };
}

/** What an open assignment still needs from the person managing it. */
export function assignmentMissing(
  a: Pick<Assignment, 'status' | 'overdue' | 'due_at' | 'can_manage'>,
  options: {
    /** Sends a reminder, or null (own assignment, or reminded within the last 20 hours). */
    readonly remind: (() => void) | null;
    /** Opens the due-date editor. */
    readonly setDue: () => void;
  },
): RecordMissingItem[] {
  if (!isOpenAssignment(a) || !a.can_manage) {
    return [];
  }
  const items: RecordMissingItem[] = [];
  if (a.overdue && options.remind) {
    items.push({
      key: 'remind',
      labelKey: 'training.assignmentDetail.missing.remind',
      action: options.remind,
    });
  }
  if (!a.due_at) {
    items.push({
      key: 'due',
      labelKey: 'training.assignmentDetail.missing.due',
      action: options.setDue,
    });
  }
  return items;
}
