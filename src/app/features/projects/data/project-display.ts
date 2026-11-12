import { BadgeTone } from '../../../shared/ui/badge/badge';
import { TaskStatus } from '../../../core/tasks/task.models';

/** i18n keys and badge tones for the project vocabularies (scope `projects`). */

export function projectStatusKey(status: string): string {
  return `projects.status.${status}`;
}

export function projectStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'active':
      return 'accent';
    case 'planned':
      return 'info';
    case 'on_hold':
      return 'warn';
    case 'completed':
      return 'pass';
    default:
      return 'neutral';
  }
}

export function healthTone(health: string | null): BadgeTone {
  switch (health) {
    case 'green':
      return 'pass';
    case 'amber':
      return 'warn';
    case 'red':
      return 'fail';
    default:
      return 'neutral';
  }
}

export function priorityTone(priority: string): BadgeTone {
  switch (priority) {
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

export function milestoneStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'in_progress':
      return 'accent';
    case 'done':
      return 'pass';
    case 'cancelled':
      return 'neutral';
    default:
      return 'info';
  }
}

export function outcomeTone(outcome: string): BadgeTone {
  switch (outcome) {
    case 'passed':
      return 'pass';
    case 'passed_with_actions':
      return 'warn';
    case 'failed':
      return 'fail';
    default:
      return 'neutral';
  }
}

export function lessonCategoryTone(category: string): BadgeTone {
  switch (category) {
    case 'went_well':
      return 'pass';
    case 'improve':
      return 'info';
    case 'risk':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function riskLevelTone(level: string): BadgeTone {
  switch (level) {
    case 'high':
      return 'fail';
    case 'medium':
      return 'warn';
    default:
      return 'neutral';
  }
}

/** Plan bars: whether the item is finished (done/cancelled for every kind). */
export function isFinishedStatus(status: string): boolean {
  return status === 'done' || status === 'cancelled';
}

/** Board columns of the project task board (open task statuses plus done). */
export const BOARD_COLUMNS: readonly TaskStatus[] = ['open', 'in_progress', 'blocked', 'done'];

/** Revision snapshot field -> i18n key (project revisions tab). */
export const PROJECT_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'projects.fields.code',
  title: 'projects.fields.title',
  description: 'projects.fields.description',
  objective: 'projects.fields.objective',
  scope: 'projects.fields.scope',
  kind: 'projects.fields.kind',
  status: 'projects.fields.status',
  priority: 'projects.fields.priority',
  health: 'projects.fields.health',
  owner_user_id: 'projects.fields.owner',
  department_id: 'projects.fields.department',
  start_date: 'projects.fields.startDate',
  due_date: 'projects.fields.dueDate',
  security_relevant: 'projects.fields.securityRelevant',
  security_requirements: 'projects.fields.securityRequirements',
  closeout_summary: 'projects.fields.closeoutSummary',
  closed_at: 'projects.fields.closedAt',
};
