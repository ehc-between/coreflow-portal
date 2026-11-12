import { Task } from '../../../core/tasks/task.models';

export interface TaskHistoryEntry {
  /** i18n key (scope `tasks`). */
  readonly key: string;
  readonly params?: Record<string, unknown>;
  /** Naive-UTC date-time. */
  readonly at: string;
}

/**
 * The milestones a task's own fields tell (created, completed or cancelled, last
 * changed), newest first. Interim until the platform timeline (`<app-timeline>`,
 * F8 over F3's event log) is on main and replaces this card with the full history.
 */
export function taskHistory(task: Task): TaskHistoryEntry[] {
  const entries: TaskHistoryEntry[] = [
    task.created_by_name
      ? {
          key: 'tasks.history.created',
          params: { name: task.created_by_name },
          at: task.created_at,
        }
      : { key: 'tasks.history.createdSystem', at: task.created_at },
  ];
  if (task.status === 'done' && task.completed_at) {
    entries.push({ key: 'tasks.history.completed', at: task.completed_at });
  } else if (task.status === 'cancelled') {
    entries.push({ key: 'tasks.history.cancelled', at: task.updated_at });
  }
  const last = entries[entries.length - 1].at;
  // Compare to the second: one save stamps several columns microseconds apart.
  if (task.updated_at && task.updated_at.slice(0, 19) > last.slice(0, 19)) {
    entries.push({ key: 'tasks.history.updated', at: task.updated_at });
  }
  return entries.reverse();
}
