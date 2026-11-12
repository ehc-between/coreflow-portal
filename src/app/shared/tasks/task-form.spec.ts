import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, throwError } from 'rxjs';
import { TaskDetail } from '../../core/tasks/task.models';
import { TasksApi } from '../../core/tasks/tasks-api';
import { TaskForm, TaskFormValue } from './task-form';
import { makeTask, taskTestingProviders } from './tasks.testing';

function setup(value: TaskFormValue | null = null) {
  const created$ = new Subject<TaskDetail>();
  const api = {
    create: vi.fn(() => created$),
    update: vi.fn(() => created$),
    updateRecurrence: vi.fn(() => created$),
  };
  TestBed.configureTestingModule({
    imports: [TaskForm, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      ...taskTestingProviders().providers,
      { provide: TasksApi, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(TaskForm);
  fixture.componentRef.setInput('value', value);
  const saved = vi.fn();
  fixture.componentInstance.saved.subscribe(saved);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = (selector: string) => el.querySelector<HTMLInputElement>(selector)!;
  const type = (selector: string, text: string, event = 'input') => {
    const control = input(selector);
    control.value = text;
    control.dispatchEvent(new Event(event));
    fixture.detectChanges();
  };
  const submit = () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  return { fixture, el, api, created$, saved, type, submit, input };
}

describe('TaskForm', () => {
  it('requires a title', () => {
    const { el, api, submit } = setup();
    submit();
    expect(api.create).not.toHaveBeenCalled();
    expect(el.textContent).toContain('tasks.errors.title_required');
  });

  it('creates a linked task with due date and checklist', () => {
    const { api, type, submit, el, created$, saved, fixture } = setup({
      entityType: 'deviation',
      entityId: 'd-1',
      assignee: { type: 'user', value: 'u-1' },
    });
    type('input[type="text"]', '  Fix the leak ');
    type('input[type="date"]', '2026-12-01', 'change');
    el.querySelectorAll<HTMLButtonElement>('app-button button')[0].click();
    fixture.detectChanges();
    type('fieldset input[type="text"]', 'Order parts');
    submit();
    expect(api.create).toHaveBeenCalledWith('org-1', {
      title: 'Fix the leak',
      description: null,
      entity_type: 'deviation',
      entity_id: 'd-1',
      assignee: { type: 'user', value: 'u-1' },
      priority: 'normal',
      due_at: '2026-12-01T23:59:59',
      start_at: null,
      checklist: ['Order parts'],
      recurrence: null,
    });
    const task = makeTask();
    created$.next(task);
    expect(saved).toHaveBeenCalledWith({ task });
  });

  it('creates a recurring task and requires its first due date', () => {
    const { api, type, submit, el } = setup({ recurring: true });
    type('input[type="text"]', 'Monthly safety round');
    submit();
    expect(api.create).not.toHaveBeenCalled();
    expect(el.textContent).toContain('tasks.form.firstDueRequired');

    type('input[type="date"]', '2026-12-01', 'change');
    submit();
    expect(api.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        title: 'Monthly safety round',
        recurrence: { rrule: 'FREQ=MONTHLY', dtstart: '2026-12-01T23:59:59', lead_days: 7 },
      }),
    );
  });

  it('patches only the changed fields of an existing task', () => {
    const task = makeTask({ title: 'Old', due_at: '2026-11-20T23:59:59', priority: 'high' });
    const { api, type, submit } = setup({ task });
    type('input[type="text"]', 'New');
    submit();
    expect(api.update).toHaveBeenCalledWith('org-1', 't-1', { title: 'New' });
  });

  it('emits without a request when nothing changed', () => {
    const task = makeTask();
    const { api, submit, saved } = setup({ task });
    submit();
    expect(api.update).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledWith({ task, recurrence: undefined });
  });

  it('shows a coded backend error', () => {
    const { api, type, submit, el, fixture } = setup();
    api.create.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({ status: 422, error: { detail: { code: 'invalid_assignee' } } }),
      ) as never,
    );
    type('input[type="text"]', 'Task');
    submit();
    fixture.detectChanges();
    expect(el.textContent).toContain('tasks.errors.invalid_assignee');
  });
});
