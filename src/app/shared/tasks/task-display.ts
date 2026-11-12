import { AssigneeIn, AssigneeOut, TaskPriority, TaskStatus } from '../../core/tasks/task.models';
import { BadgeTone } from '../ui/badge/badge';

/** i18n key (scope `tasks`) of a task status. */
export function taskStatusKey(status: string | null | undefined): string {
  return `tasks.status.${status ?? 'open'}`;
}

export function taskStatusTone(status: string | null | undefined): BadgeTone {
  switch (status as TaskStatus) {
    case 'done':
      return 'pass';
    case 'in_progress':
      return 'info';
    case 'blocked':
      return 'warn';
    case 'cancelled':
      return 'neutral';
    default:
      return 'accent';
  }
}

/** i18n key (scope `tasks`) of a task priority. */
export function taskPriorityKey(priority: string | null | undefined): string {
  return `tasks.priority.${priority ?? 'normal'}`;
}

export function taskPriorityTone(priority: string | null | undefined): BadgeTone {
  switch (priority as TaskPriority) {
    case 'urgent':
      return 'fail';
    case 'high':
      return 'warn';
    case 'low':
      return 'neutral';
    default:
      return 'info';
  }
}

/** Whether a status is closed (done / cancelled): the task is read-only until reopened. */
export function isClosedStatus(status: string | null | undefined): boolean {
  return status === 'done' || status === 'cancelled';
}

/**
 * The wire value of a date-only due date picked in the UI: the end of that day
 * (naive UTC), so a task due "today" is not overdue until the day is over. The
 * calendar day survives the round trip (`dayOf`).
 */
export function dueAtFromDay(day: string | null | undefined): string | null {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T23:59:59` : null;
}

/** The start of a calendar day as a naive-UTC wire value (for `start_at` and filters). */
export function startOfDay(day: string): string {
  return `${day}T00:00:00`;
}

/** The leading `YYYY-MM-DD` of a wire date-time, or '' (for `<input type="date">`). */
export function dayOf(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

/** Today's calendar day in the viewer's timezone, `YYYY-MM-DD`. */
export function todayDay(now: Date = new Date()): string {
  return localDay(now);
}

/** A local `Date` as `YYYY-MM-DD`. */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add `days` to a `YYYY-MM-DD` day. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + days));
}

/** Encode an assignee for a `<select>` / the list filter: `user:<id>`, `role:<key>`, … */
export function encodeAssignee(assignee: AssigneeIn | null | undefined): string {
  return assignee ? `${assignee.type}:${assignee.value}` : '';
}

/** Decode `encodeAssignee`; null for '' or a malformed value. */
export function decodeAssignee(value: string | null | undefined): AssigneeIn | null {
  if (!value) {
    return null;
  }
  const index = value.indexOf(':');
  if (index <= 0 || index === value.length - 1) {
    return null;
  }
  const type = value.slice(0, index);
  if (type !== 'user' && type !== 'role' && type !== 'department') {
    return null;
  }
  return { type, value: value.slice(index + 1) };
}

/** i18n key of an assignee kind (scope `tasks`), used as a prefix label. */
export function assigneeTypeKey(assignee: AssigneeOut | AssigneeIn): string {
  return `tasks.assignee.types.${assignee.type}`;
}
