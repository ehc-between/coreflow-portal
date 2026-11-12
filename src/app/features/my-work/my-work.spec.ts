import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DocumentsApi } from '../../core/documents/documents-api';
import { NotificationService } from '../../core/notifications/notification.service';
import { WorkItem } from '../../core/tasks/task.models';
import { TasksApi } from '../../core/tasks/tasks-api';
import { makeTask, taskTestingProviders } from '../../shared/tasks/tasks.testing';
import { MyWork } from './my-work';

function work(overrides: Partial<WorkItem>): WorkItem {
  return {
    source: 'task',
    id: 't-1',
    title: 'Task',
    code: null,
    status: 'open',
    priority: 'normal',
    due_at: null,
    url: '/tasks/t-1',
    entity_type: 'task',
    entity_id: 't-1',
    module: 'tasks',
    overdue: false,
    ...overrides,
  };
}

const ITEMS: WorkItem[] = [
  work({ id: 't-1', title: 'Overdue task', due_at: '2026-01-02T23:59:59', overdue: true }),
  work({
    id: 'a-1',
    source: 'deviation_action',
    title: 'Fix the valve',
    code: 'DEV-3',
    status: 'in_progress',
    url: '/deviations/d-1',
  }),
  work({ id: 't-2', title: 'Blocked task', status: 'blocked', url: '/tasks/t-2' }),
];

function setup(view: string | null = null) {
  const query = new BehaviorSubject(convertToParamMap(view ? { view } : {}));
  const api = {
    myWork: vi.fn(() => of({ items: ITEMS })),
    complete: vi.fn(() => of(makeTask({ status: 'done' }))),
    update: vi.fn(() => of(makeTask({ id: 't-2', status: 'in_progress' }))),
  };
  TestBed.configureTestingModule({
    imports: [MyWork, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      ...taskTestingProviders().providers,
      { provide: ActivatedRoute, useValue: { queryParamMap: query } },
      { provide: TasksApi, useValue: api },
      { provide: DocumentsApi, useValue: { listProposals: () => of([]) } },
      { provide: AuthService, useValue: { user: () => ({ id: 'u-1' }) } },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(MyWork);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, api, query };
}

describe('MyWork', () => {
  it('lists the feed with overdue items highlighted', () => {
    const { el, api } = setup();
    expect(api.myWork).toHaveBeenCalledWith('org-1', {});
    const rows = Array.from(el.querySelectorAll('li'));
    expect(rows.map((r) => r.querySelector('a')?.textContent?.trim())).toEqual([
      'Overdue task',
      'Fix the valve',
      'Blocked task',
    ]);
    expect(rows[0].classList).toContain('bg-fail-soft');
  });

  it('filters by source', () => {
    const { el, fixture } = setup();
    const source = el.querySelector<HTMLSelectElement>('select')!;
    source.value = 'deviation_action';
    source.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('li a')).map((a) => a.textContent?.trim())).toEqual([
      'Fix the valve',
    ]);
  });

  it('completes a task from its tick box and reloads', () => {
    const { el, api, fixture } = setup();
    el.querySelector<HTMLInputElement>('li input[type="checkbox"]')!.dispatchEvent(
      new Event('change'),
    );
    fixture.detectChanges();
    expect(api.complete).toHaveBeenCalledWith('org-1', 't-1');
    expect(api.myWork).toHaveBeenCalledTimes(2);
  });

  it('groups the board by status and moves a task', () => {
    const { el, api, fixture } = setup('board');
    const columns = Array.from(el.querySelectorAll('section[aria-label]')).filter((s) =>
      s.getAttribute('aria-label')?.includes('tasks.status.'),
    );
    expect(columns).toHaveLength(3);
    expect(columns[1].textContent).toContain('Fix the valve');
    expect(columns[2].textContent).toContain('Blocked task');

    const move = columns[2].querySelector<HTMLSelectElement>('li select')!;
    move.value = 'in_progress';
    move.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.update).toHaveBeenCalledWith('org-1', 't-2', { status: 'in_progress' });
  });

  it('loads the calendar month window', () => {
    const { api } = setup('calendar');
    const [, query] = api.myWork.mock.calls.at(-1) as unknown as [
      string,
      { from: string; to: string },
    ];
    expect(query.from).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00$/);
    expect(query.to).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:59$/);
  });
});
