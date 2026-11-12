/**
 * DTOs of the platform task API (`/api/v1/orgs/{org}/tasks`, `/task-recurrences`,
 * `/my-work`), mirroring coreflow-core `app/platform/tasks/schemas.py`.
 * Date-times are naive UTC strings (no `Z`).
 */

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
/** Statuses a PATCH may set; done / cancelled go through complete / cancel. */
export type EditableTaskStatus = 'open' | 'in_progress' | 'blocked';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type AssigneeType = 'user' | 'role' | 'department';
export type TaskSort = 'due_at' | '-due_at' | '-created_at' | 'priority';

export const TASK_STATUSES: readonly TaskStatus[] = [
  'open',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
];
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ['open', 'in_progress', 'blocked'];
export const EDITABLE_TASK_STATUSES: readonly EditableTaskStatus[] = [
  'open',
  'in_progress',
  'blocked',
];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'normal', 'high', 'urgent'];

export interface AssigneeIn {
  readonly type: AssigneeType;
  readonly value: string;
}

export interface AssigneeOut extends AssigneeIn {
  readonly name: string | null;
}

/** The linked record, resolved by the backend's entity registry. */
export interface TaskEntityRef {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly url: string | null;
  readonly module: string | null;
}

export interface ChecklistItem {
  readonly id: string;
  readonly task_id: string;
  readonly position: number;
  readonly text: string;
  readonly done: boolean;
  readonly done_by: string | null;
  readonly done_at: string | null;
  readonly created_at: string;
}

export interface Task {
  readonly id: string;
  readonly org_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly kind: string;
  readonly module: string | null;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly entity: TaskEntityRef | null;
  readonly assignee: AssigneeOut | null;
  readonly due_at: string | null;
  readonly start_at: string | null;
  readonly completed_at: string | null;
  readonly completed_by: string | null;
  readonly recurrence_id: string | null;
  readonly occurrence_due_at: string | null;
  readonly escalation_level: number;
  readonly checklist_total: number;
  readonly checklist_done: number;
  readonly overdue: boolean;
  readonly created_by: string | null;
  readonly created_by_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface TaskDetail extends Task {
  readonly checklist: readonly ChecklistItem[];
  readonly can_edit: boolean;
  readonly can_delete: boolean;
}

export interface TaskList {
  readonly items: readonly Task[];
  readonly total: number;
}

export interface RecurrenceSpec {
  readonly rrule: string;
  readonly dtstart: string;
  /** Days before the due date an occurrence is created (0-366, default 7). */
  readonly lead_days?: number;
}

export interface CreateTaskRequest {
  readonly title: string;
  readonly description?: string | null;
  readonly entity_type?: string | null;
  readonly entity_id?: string | null;
  readonly assignee?: AssigneeIn | null;
  readonly due_at?: string | null;
  readonly start_at?: string | null;
  readonly priority?: TaskPriority;
  readonly kind?: string;
  readonly checklist?: readonly string[];
  readonly recurrence?: RecurrenceSpec | null;
}

/** Only the keys present are applied; `assignee: null` unassigns. */
export interface UpdateTaskRequest {
  readonly title?: string;
  readonly description?: string | null;
  readonly assignee?: AssigneeIn | null;
  readonly due_at?: string | null;
  readonly start_at?: string | null;
  readonly priority?: TaskPriority;
  readonly status?: EditableTaskStatus;
}

export interface TaskListQuery {
  readonly entity_type?: string;
  readonly entity_id?: string;
  /** `me`, `user:<id>`, `role:<key>` or `department:<id>`. */
  readonly assignee?: string;
  readonly status?: readonly TaskStatus[];
  readonly kind?: string;
  readonly module?: string;
  readonly recurrence_id?: string;
  readonly due_before?: string;
  readonly due_after?: string;
  readonly q?: string;
  readonly sort?: TaskSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface Recurrence {
  readonly id: string;
  readonly org_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly priority: TaskPriority;
  readonly kind: string;
  readonly module: string | null;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly entity: TaskEntityRef | null;
  readonly assignee: AssigneeOut | null;
  readonly checklist: readonly string[];
  readonly rrule: string;
  readonly dtstart: string;
  readonly lead_days: number;
  readonly next_due_at: string | null;
  readonly active: boolean;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface RecurrenceCreated extends Recurrence {
  readonly first_task: Task;
}

export interface RecurrenceList {
  readonly items: readonly Recurrence[];
  readonly total: number;
}

export interface CreateRecurrenceRequest extends CreateTaskRequest {
  readonly recurrence: RecurrenceSpec;
}

export interface UpdateRecurrenceRequest {
  readonly title?: string;
  readonly description?: string | null;
  readonly assignee?: AssigneeIn | null;
  readonly priority?: TaskPriority;
  readonly checklist?: readonly string[];
  readonly rrule?: string;
  readonly dtstart?: string;
  readonly lead_days?: number;
  readonly active?: boolean;
}

export interface RecurrenceListQuery {
  readonly entity_type?: string;
  readonly entity_id?: string;
  readonly active?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

/** My Work sources the portal knows; modules may add more through the backend hook. */
export const KNOWN_WORK_SOURCES = [
  'task',
  'deviation_action',
  'deviation',
  'document_review',
  'document_ack',
] as const;

export type KnownWorkSource = (typeof KNOWN_WORK_SOURCES)[number];

export interface WorkItem {
  readonly source: string;
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
  readonly status: string | null;
  readonly priority: string | null;
  readonly due_at: string | null;
  readonly url: string | null;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly module: string | null;
  readonly overdue: boolean;
}

export interface MyWorkResponse {
  readonly items: readonly WorkItem[];
}

export interface MyWorkQuery {
  readonly from?: string;
  readonly to?: string;
  readonly include?: readonly string[];
}
