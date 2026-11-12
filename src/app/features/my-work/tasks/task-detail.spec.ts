import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { TasksApi } from '../../../core/tasks/tasks-api';
import { makeTask, taskTestingProviders } from '../../../shared/tasks/tasks.testing';
import { TaskDetailPage } from './task-detail';
import { taskHistory } from './task-history';

function setup(task = makeTask()) {
  const api = {
    get: vi.fn(() => of(task)),
    complete: vi.fn(() => of({ ...task, status: 'done' as const })),
    update: vi.fn(() => of({ ...task, status: 'in_progress' as const })),
    updateChecklistItem: vi.fn(() => of({ ...task.checklist[0], done: true })),
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
      ...testing.providers,
      { provide: TasksApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
    ],
  });
  const fixture = TestBed.createComponent(TaskDetailPage);
  fixture.componentRef.setInput('id', task.id);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  return { fixture, el, api, toasts, ask: testing.ask, button };
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
  it('renders the task and completes it', () => {
    const { el, api, toasts, fixture, button } = setup();
    expect(el.textContent).toContain('Check extinguishers');
    button('tasks.actions.complete').click();
    fixture.detectChanges();
    expect(api.complete).toHaveBeenCalledWith('org-1', 't-1');
    expect(toasts.success).toHaveBeenCalledWith('tasks.notices.completed');
    // Closed now: the reopen action replaces the edit actions.
    expect(el.textContent).toContain('tasks.actions.reopen');
    expect(el.textContent).not.toContain('tasks.actions.complete');
  });

  it('changes the status from the select', () => {
    const { el, api, fixture } = setup();
    const select = el.querySelector<HTMLSelectElement>('header select')!;
    select.value = 'in_progress';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.update).toHaveBeenCalledWith('org-1', 't-1', { status: 'in_progress' });
  });

  it('ticks and adds checklist items', () => {
    const { el, api, fixture } = setup(makeTask({ checklist: CHECKLIST, checklist_total: 1 }));
    el.querySelector<HTMLInputElement>('#check-c-1')!.click();
    fixture.detectChanges();
    expect(api.updateChecklistItem).toHaveBeenCalledWith('org-1', 't-1', 'c-1', { done: true });

    const input = el.querySelector<HTMLInputElement>('form input[type="text"]')!;
    input.value = 'New step';
    input.dispatchEvent(new Event('input'));
    input.closest('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.addChecklistItem).toHaveBeenCalledWith('org-1', 't-1', 'New step');
    expect(el.textContent).toContain('New step');
  });

  it('is read-only without edit rights', () => {
    const { el } = setup(makeTask({ can_edit: false, can_delete: false, checklist: CHECKLIST }));
    expect(el.querySelector('header select')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('#check-c-1')!.disabled).toBe(true);
    expect(el.textContent).not.toContain('tasks.actions.delete');
  });

  it('asks the assistant about the task', () => {
    const { ask, button } = setup();
    button('tasks.ai.summarise').click();
    expect(ask.prompts).toEqual([expect.stringContaining('tasks.ai.prompts.summarise')]);
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
