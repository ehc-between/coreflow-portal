import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { APP_CONFIG } from '../../../core/config/app-config';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { KitApi } from '../../../core/kit/kit-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { Recurrence, TaskDetail } from '../../../core/tasks/task.models';
import { TasksApi } from '../../../core/tasks/tasks-api';
import { makeTask, taskTestingProviders } from '../../../shared/tasks/tasks.testing';
import { taskMissing, taskStatusLine } from './task-anatomy';
import { TaskDetailPage } from './task-detail';
import { taskHistory } from './task-history';

const RECORD = {
  entity_type: 'deviation',
  entity_id: 'd-1',
  title: 'Broken extinguisher',
  code: 'DEV-0007',
  url: '/deviations/d-1',
  module: 'deviations',
};

async function setup(task = makeTask(), series: Recurrence[] = []) {
  const api = {
    get: vi.fn(() => of(task)),
    complete: vi.fn(() => of({ ...task, status: 'done' as const })),
    update: vi.fn(() => of({ ...task, status: 'in_progress' as const })),
    updateChecklistItem: vi.fn(() => of({ ...task.checklist[0], done: true })),
    listRecurrences: vi.fn(() => of({ items: series, total: series.length })),
    addChecklistItem: vi.fn(() =>
      of({
        id: 'c-new',
        task_id: task.id,
        position: 9,
        text: 'New step',
        done: false,
        done_by: null,
        done_at: null,
        created_at: '2026-11-02T10:00:00',
      }),
    ),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  const testing = taskTestingProviders();
  TestBed.configureTestingModule({
    imports: [TaskDetailPage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...provideFakeGuidance().providers,
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
      ...testing.providers,
      { provide: TasksApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
    ],
  });
  const kit = {
    entity: vi
      .spyOn(TestBed.inject(KitApi), 'entity')
      .mockImplementation(() =>
        task.entity
          ? of({ ...task.entity, status: 'open', label_key: null })
          : throwError(() => new Error('none')),
      ),
  };
  const fixture = TestBed.createComponent(TaskDetailPage);
  fixture.componentRef.setInput('id', task.id);
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await render();
  const el = fixture.nativeElement as HTMLElement;
  const byTestId = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const button = (text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  return { fixture, el, api, kit, toasts, ask: testing.ask, button, byTestId, render };
}

const CHECKLIST = [
  {
    id: 'c-1',
    task_id: 't-1',
    position: 0,
    text: 'Order parts',
    done: false,
    done_by: null,
    done_at: null,
    created_at: '2026-11-01T10:00:00',
  },
];

describe('TaskDetailPage', () => {
  it('renders the task and completes it', async () => {
    const { el, api, toasts, render, byTestId } = await setup();
    expect(el.textContent).toContain('Check extinguishers');
    byTestId('task-complete')!.querySelector('button')!.click();
    await render();
    expect(api.complete).toHaveBeenCalledWith('org-1', 't-1');
    expect(toasts.success).toHaveBeenCalledWith('tasks.notices.completed');
    // Closed now: the reopen action replaces the edit actions.
    expect(byTestId('task-reopen')).not.toBeNull();
    expect(byTestId('task-complete')).toBeNull();
    expect(byTestId('task-edit')).toBeNull();
  });

  it('changes the status from the "Mer" menu', async () => {
    const { api, byTestId } = await setup();
    // The current status is not offered.
    expect(byTestId('task-status-open')).toBeNull();
    byTestId('task-status-in_progress')!.click();
    expect(api.update).toHaveBeenCalledWith('org-1', 't-1', { status: 'in_progress' });
  });

  it('shows the record it belongs to with its status, and the series it repeats in', async () => {
    const rec = {
      id: 'r-1',
      rrule: 'FREQ=WEEKLY',
      active: true,
      next_due_at: '2026-12-01T23:59:59',
    } as Recurrence;
    const { byTestId, kit, api } = await setup(
      makeTask({
        entity: RECORD,
        entity_type: 'deviation',
        entity_id: 'd-1',
        recurrence_id: 'r-1',
      }),
      [rec],
    );
    expect(kit.entity).toHaveBeenCalledWith('org-1', 'deviation', 'd-1');
    const record = byTestId('task-record')!;
    expect(record.textContent).toContain('DEV-0007');
    expect(record.textContent).toContain('Broken extinguisher');
    expect(record.querySelector('[data-testid="entity-chip-status"]')).not.toBeNull();
    expect(api.listRecurrences).toHaveBeenCalledWith('org-1', {
      entity_type: 'deviation',
      entity_id: 'd-1',
      limit: 200,
    });
    expect(byTestId('task-repeats')).not.toBeNull();
    expect(byTestId('task-series')!.textContent).toContain('tasks.detail.series.next');
  });

  it('ticks and adds checklist items', async () => {
    const { el, api, render } = await setup(makeTask({ checklist: CHECKLIST, checklist_total: 1 }));
    el.querySelector<HTMLInputElement>('#check-c-1')!.click();
    await render();
    expect(api.updateChecklistItem).toHaveBeenCalledWith('org-1', 't-1', 'c-1', { done: true });

    const input = el.querySelector<HTMLInputElement>('[data-testid="task-checklist"] form input')!;
    input.value = 'New step';
    input.dispatchEvent(new Event('input'));
    input.closest('form')!.dispatchEvent(new Event('submit'));
    await render();
    expect(api.addChecklistItem).toHaveBeenCalledWith('org-1', 't-1', 'New step');
    expect(el.textContent).toContain('New step');
  });

  it('is read-only without edit rights', async () => {
    const { el, byTestId } = await setup(
      makeTask({ can_edit: false, can_delete: false, checklist: CHECKLIST }),
    );
    expect(byTestId('task-status-in_progress')).toBeNull();
    expect(byTestId('task-edit')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('#check-c-1')!.disabled).toBe(true);
    expect(byTestId('task-delete')).toBeNull();
    expect(byTestId('record-missing')).toBeNull();
  });

  it('asks the assistant about the task from the "Spør KI" menu', async () => {
    const { ask, button } = await setup();
    button('tasks.ai.summarise').click();
    expect(ask.prompts).toEqual([expect.stringContaining('tasks.ai.prompts.summarise')]);
  });
});

describe('task detail anatomy', () => {
  const task = (overrides: Partial<TaskDetail> = {}) => makeTask(overrides);

  it('says how the task is doing in a sentence', () => {
    expect(taskStatusLine(task())).toEqual({ key: 'tasks.detail.statusLine.open', tone: 'warn' });
    expect(taskStatusLine(task({ overdue: true })).key).toBe('tasks.detail.statusLine.openOverdue');
    expect(taskStatusLine(task({ status: 'in_progress', overdue: true })).key).toBe(
      'tasks.detail.statusLine.inProgressOverdue',
    );
    expect(taskStatusLine(task({ status: 'done', completed_at: '2026-11-03T09:00:00' }))).toEqual({
      key: 'tasks.detail.statusLine.doneOn',
      tone: 'pass',
    });
    expect(taskStatusLine(task({ status: 'cancelled' })).tone).toBe('neutral');
  });

  it('lists what is missing for open work the caller may change', () => {
    expect(taskMissing(task()).map((i) => i.key)).toEqual(['assignee', 'due']);
    const items = taskMissing(
      task({
        status: 'blocked',
        overdue: true,
        due_at: '2026-11-01T23:59:59',
        assignee: { type: 'user', value: 'u-1', name: 'Ada' },
      }),
    );
    expect(items.map((i) => i.key)).toEqual(['overdue', 'blocked']);
    expect(items[1].queryParams).toEqual({ tab: 'comments' });
    expect(taskMissing(task({ status: 'done' }))).toEqual([]);
    expect(taskMissing(task({ can_edit: false }))).toEqual([]);
  });
});

describe('taskHistory', () => {
  it('lists creation, completion and later changes, newest first', () => {
    const entries = taskHistory(
      makeTask({
        status: 'done',
        completed_at: '2026-11-03T09:00:00.123',
        updated_at: '2026-11-04T09:00:00',
      }),
    );
    expect(entries.map((e) => e.key)).toEqual([
      'tasks.history.updated',
      'tasks.history.completed',
      'tasks.history.created',
    ]);
  });

  it('ignores an update stamped in the same second as completion', () => {
    const entries = taskHistory(
      makeTask({
        status: 'done',
        completed_at: '2026-11-03T09:00:00.100',
        updated_at: '2026-11-03T09:00:00.900',
        created_by_name: null,
      }),
    );
    expect(entries.map((e) => e.key)).toEqual([
      'tasks.history.completed',
      'tasks.history.createdSystem',
    ]);
  });
});
