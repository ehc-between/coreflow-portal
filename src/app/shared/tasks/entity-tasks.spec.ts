import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { TasksApi } from '../../core/tasks/tasks-api';
import { EntityTasks, sortTasks } from './entity-tasks';
import { makeTask, taskTestingProviders } from './tasks.testing';

function setup(canCreate = true) {
  const api = {
    list: vi.fn(() =>
      of({
        items: [
          makeTask({ id: 'a', title: 'Later', due_at: '2026-12-01T23:59:59' }),
          makeTask({ id: 'b', title: 'Sooner', due_at: '2026-11-15T23:59:59', overdue: true }),
          makeTask({ id: 'c', title: 'Closed', status: 'done' }),
        ],
        total: 3,
      }),
    ),
    create: vi.fn(() => of(makeTask({ id: 'n', title: 'New one' }))),
    complete: vi.fn(() => of(makeTask({ id: 'b', title: 'Sooner', status: 'done' }))),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [EntityTasks, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      ...taskTestingProviders().providers,
      { provide: TasksApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
    ],
  });
  const fixture = TestBed.createComponent(EntityTasks);
  fixture.componentRef.setInput('entityType', 'deviation');
  fixture.componentRef.setInput('entityId', 'd-1');
  fixture.componentRef.setInput('canCreate', canCreate);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const titles = () =>
    Array.from(el.querySelectorAll('ul:first-of-type a')).map((a) => a.textContent?.trim());
  return { fixture, el, api, toasts, titles };
}

describe('EntityTasks', () => {
  it('lists the open tasks of the record, soonest first', () => {
    const { api, titles } = setup();
    expect(api.list).toHaveBeenCalledWith('org-1', {
      entity_type: 'deviation',
      entity_id: 'd-1',
      sort: 'due_at',
      limit: 200,
    });
    expect(titles()).toEqual(['Sooner', 'Later']);
  });

  it('quick-adds a task linked to the record', () => {
    const { el, api, fixture } = setup();
    const input = el.querySelector<HTMLInputElement>('form input')!;
    input.value = 'New one';
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.create).toHaveBeenCalledWith('org-1', {
      title: 'New one',
      entity_type: 'deviation',
      entity_id: 'd-1',
      assignee: null,
    });
    expect(el.textContent).toContain('New one');
  });

  it('completes a task from its tick box', () => {
    const { el, api, toasts, fixture, titles } = setup();
    el.querySelector<HTMLInputElement>('input[type="checkbox"]')!.dispatchEvent(
      new Event('change'),
    );
    fixture.detectChanges();
    expect(api.complete).toHaveBeenCalledWith('org-1', 'b');
    expect(toasts.success).toHaveBeenCalledWith('tasks.notices.completed');
    expect(titles()).toEqual(['Later']);
  });

  it('hides the quick add without create rights', () => {
    const { el } = setup(false);
    expect(el.querySelector('form')).toBeNull();
  });

  it('sorts undated tasks last', () => {
    const sorted = sortTasks([
      makeTask({ id: 'x', title: 'B' }),
      makeTask({ id: 'y', title: 'A', due_at: '2026-11-01T00:00:00' }),
      makeTask({ id: 'z', title: 'A' }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['y', 'z', 'x']);
  });
});
