import { TaskDetail } from '../../../core/tasks/task.models';
import { RecordMissingItem } from '../../../shared/kit/record-detail-layout';
import { StatusLineTone } from '../../../shared/kit/record-sections';
import { isClosedStatus } from '../../../shared/tasks/task-display';

/** The status sentence of a task ("Pågår – arbeidet er i gang."), docs/ux-guide.md §2.7. */
export interface TaskStatusLine {
  /** i18n key (scope `tasks`). */
  readonly key: string;
  readonly tone: StatusLineTone;
}

/**
 * Status word, a dash, then what it means. Done is green, open work is a to-do
 * (never red), a cancelled task is neutral. A passed deadline is part of the
 * sentence for work that is still open.
 */
export function taskStatusLine(task: TaskDetail): TaskStatusLine {
  switch (task.status) {
    case 'done':
      return {
        key: task.completed_at ? 'tasks.detail.statusLine.doneOn' : 'tasks.detail.statusLine.done',
        tone: 'pass',
      };
    case 'cancelled':
      return { key: 'tasks.detail.statusLine.cancelled', tone: 'neutral' };
    case 'blocked':
      return { key: 'tasks.detail.statusLine.blocked', tone: 'warn' };
    case 'in_progress':
      return {
        key: task.overdue
          ? 'tasks.detail.statusLine.inProgressOverdue'
          : 'tasks.detail.statusLine.inProgress',
        tone: 'warn',
      };
    default:
      return {
        key: task.overdue ? 'tasks.detail.statusLine.openOverdue' : 'tasks.detail.statusLine.open',
        tone: 'warn',
      };
  }
}

/**
 * What a task still needs ("Oppfølging"): only for work that is open and that the
 * caller may change. Each line leads to the place that fixes it.
 */
export function taskMissing(task: TaskDetail): RecordMissingItem[] {
  if (!task.can_edit || isClosedStatus(task.status)) {
    return [];
  }
  const edit = ['/tasks', task.id, 'edit'];
  const items: RecordMissingItem[] = [];
  if (task.overdue) {
    items.push({ key: 'overdue', labelKey: 'tasks.detail.missing.overdue', link: edit });
  }
  if (task.status === 'blocked') {
    items.push({
      key: 'blocked',
      labelKey: 'tasks.detail.missing.blocked',
      link: ['/tasks', task.id],
      queryParams: { tab: 'comments' },
    });
  }
  if (!task.assignee) {
    items.push({ key: 'assignee', labelKey: 'tasks.detail.missing.assignee', link: edit });
  }
  if (!task.due_at) {
    items.push({ key: 'due', labelKey: 'tasks.detail.missing.due', link: edit });
  }
  return items;
}
