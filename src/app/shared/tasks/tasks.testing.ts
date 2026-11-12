import { Provider, signal } from '@angular/core';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TaskDetail } from '../../core/tasks/task.models';
import { TasksGuidance } from '../../core/tasks/tasks-guidance';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { AssigneeOptionsService } from './assignee-options';

/** A task detail with sensible defaults, for specs. */
export function makeTask(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: 't-1',
    org_id: 'org-1',
    title: 'Check extinguishers',
    description: null,
    status: 'open',
    priority: 'normal',
    kind: 'generic',
    module: null,
    entity_type: null,
    entity_id: null,
    entity: null,
    assignee: null,
    due_at: null,
    start_at: null,
    completed_at: null,
    completed_by: null,
    recurrence_id: null,
    occurrence_due_at: null,
    escalation_level: 0,
    checklist_total: 0,
    checklist_done: 0,
    overdue: false,
    created_by: 'u-1',
    created_by_name: 'Ada',
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    checklist: [],
    can_edit: true,
    can_delete: true,
    ...overrides,
  };
}

/** Records the prompts sent to the assistant. */
export interface AskStub {
  readonly prompts: string[];
  showWith(prompt: string): void;
}

/** Stubs for the root services task components touch, for specs (no vitest globals here). */
export function taskTestingProviders(
  permissions: readonly string[] = ['tasks:read', 'tasks:write'],
): { providers: Provider[]; ask: AskStub } {
  const prompts: string[] = [];
  const ask: AskStub = { prompts, showWith: (prompt) => prompts.push(prompt) };
  return {
    ask,
    providers: [
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions }),
        },
      },
      { provide: TasksGuidance, useValue: { file: signal(null) } },
      { provide: AskPanelService, useValue: ask },
      {
        provide: AssigneeOptionsService,
        useValue: {
          options: signal({
            users: [{ value: 'user:u-1', label: 'Ada', labelIsKey: false }],
            roles: [{ value: 'role:member', label: 'roles.member.name', labelIsKey: true }],
            departments: [],
          }),
          ensureLoaded: () => undefined,
        },
      },
    ],
  };
}
