import { TaskStatus } from '../../../core/tasks/task.models';
import { Tone, ToneMeaning, toneFor } from '../../../shared/ui/tones';

/**
 * How the project vocabularies map onto the shared tone map (docs/ux-guide.md §5):
 * each value becomes a `{ meaning, value }` pair for `app-status-badge` plus the
 * module's own label key (scope `projects`). No local colour rules.
 */
export interface BadgeSpec {
  readonly meaning: ToneMeaning;
  readonly value: string;
  readonly labelKey: string;
}

export function projectStatusKey(status: string): string {
  return `projects.status.${status}`;
}

/** proposed → neutral, planned → info, active → accent, on hold → warn, completed → pass. */
export function projectStatusBadge(status: string): BadgeSpec {
  const value = status === 'proposed' ? 'draft' : status;
  return { meaning: 'lifecycle', value, labelKey: projectStatusKey(status) };
}

/** Project health (traffic light): green → pass, amber → warn, red → fail. */
const HEALTH_VALUES: Readonly<Record<string, string>> = {
  green: 'compliant',
  amber: 'partial',
  red: 'non_compliant',
};

export function healthBadge(health: string): BadgeSpec {
  return {
    meaning: 'compliance',
    value: HEALTH_VALUES[health] ?? 'unknown',
    labelKey: `projects.healths.${health}`,
  };
}

/** The colour of a health value outside a badge (timeline bars). */
export function healthColour(health: string | null | undefined): Tone {
  return health ? toneFor('compliance', HEALTH_VALUES[health] ?? 'unknown') : 'neutral';
}

/** Priority as severity: urgent → critical, high → high, normal → medium, low → low. */
export function priorityBadge(priority: string): BadgeSpec {
  const value = priority === 'urgent' ? 'critical' : priority === 'normal' ? 'medium' : priority;
  return { meaning: 'severity', value, labelKey: `projects.priorities.${priority}` };
}

export function milestoneStatusBadge(status: string): BadgeSpec {
  return { meaning: 'lifecycle', value: status, labelKey: `projects.milestoneStatus.${status}` };
}

/** Review outcome: pending → accent, passed → pass, with actions → warn, failed → fail. */
export function outcomeBadge(outcome: string): BadgeSpec {
  const values: Readonly<Record<string, [ToneMeaning, string]>> = {
    pending: ['lifecycle', 'pending'],
    passed: ['lifecycle', 'passed'],
    passed_with_actions: ['compliance', 'partial'],
    failed: ['lifecycle', 'failed'],
  };
  const [meaning, value] = values[outcome] ?? ['lifecycle', outcome];
  return { meaning, value, labelKey: `projects.outcomes.${outcome}` };
}

export function lessonCategoryBadge(category: string): BadgeSpec {
  const values: Readonly<Record<string, [ToneMeaning, string]>> = {
    went_well: ['lifecycle', 'done'],
    improve: ['lifecycle', 'planned'],
    risk: ['severity', 'medium'],
  };
  const [meaning, value] = values[category] ?? ['lifecycle', 'archived'];
  return { meaning, value, labelKey: `projects.lessonCategories.${category}` };
}

export function riskLevelBadge(level: string, labelKey: string): BadgeSpec {
  return { meaning: 'severity', value: level, labelKey };
}

/** Objective met at close-out: yes → pass, partial → warn, no → fail. */
export function objectiveMetBadge(value: string): BadgeSpec {
  const map: Readonly<Record<string, string>> = {
    yes: 'compliant',
    partial: 'partial',
    no: 'non_compliant',
  };
  return {
    meaning: 'compliance',
    value: map[value] ?? 'unknown',
    labelKey: `projects.closeout.objectiveMet.${value}`,
  };
}

/** Plan bars: whether the item is finished (done/cancelled for every kind). */
export function isFinishedStatus(status: string): boolean {
  return status === 'done' || status === 'cancelled' || status === 'completed';
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
  change_consequences: 'projects.fields.changeConsequences',
  change_resources: 'projects.fields.changeResources',
  closeout_summary: 'projects.fields.closeoutSummary',
  objective_met: 'projects.fields.objectiveMet',
  objective_evidence: 'projects.fields.objectiveEvidence',
  closeout_approved_by: 'projects.fields.closeoutApprovedBy',
  closed_at: 'projects.fields.closedAt',
};
