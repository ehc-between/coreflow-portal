import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
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

function setup(params: Record<string, string> = {}) {
  const query = new BehaviorSubject(convertToParamMap(params));
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
      {
        provide: AuthService,
        useValue: { user: () => ({ id: 'u-1' }), isAuthenticated: () => true },
      },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(MyWork);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, api, query };
}

describe('MyWork', () => {
  it('opens the first tab with items and says what and why for each row', () => {
    const { el, api } = setup();
    expect(api.myWork).toHaveBeenCalledWith('org-1', {});
    const tab = el.querySelector('[data-testid="work-tab-overdue"]')!;
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(tab.textContent).toContain('1');
    const rows = Array.from(el.querySelectorAll('[data-testid="work-row"]'));
    expect(rows.map((r) => r.querySelector('a')?.textContent?.trim())).toEqual(['Overdue task']);
    expect(rows[0].textContent).toContain('tasks.work.kinds.task');
    expect(rows[0].querySelector('[data-testid="work-why"]')?.textContent).toContain(
      'tasks.work.why.overdue',
    );
  });

  it('shows the tab from the URL and filters by type', () => {
    const { el, fixture } = setup({ tab: 'later' });
    const titles = () =>
      Array.from(el.querySelectorAll('[data-testid="work-row"] a')).map((a) =>
        a.textContent?.trim(),
      );
    expect(titles()).toEqual(['Fix the valve', 'Blocked task']);
    const type = el.querySelector<HTMLSelectElement>('[data-testid="work-filter-type"]')!;
    type.value = 'deviation_action';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(titles()).toEqual(['Fix the valve']);
  });

  it('shows a plain empty state for an empty tab', () => {
    const { el } = setup({ tab: 'review' });
    expect(el.querySelector('[data-testid="work-row"]')).toBeNull();
    expect(el.querySelector('[data-testid="empty-state"]')?.textContent).toContain(
      'tasks.myWork.empty.review.title',
    );
  });

  it('completes a task from its tick box and reloads', () => {
    const { el, api, fixture } = setup();
    el.querySelector<HTMLInputElement>(
      '[data-testid="work-row"] input[type="checkbox"]',
    )!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.complete).toHaveBeenCalledWith('org-1', 't-1');
    expect(api.myWork).toHaveBeenCalledTimes(2);
  });

  it('groups the board by status and moves a task', () => {
    const { el, api, fixture } = setup({ view: 'board', tab: 'later' });
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

  it('lists read-and-confirm and training items in their own tabs (U08)', () => {
    const extra = [
      ...ITEMS,
      work({ id: 'd-9', source: 'document_ack', title: 'Read the policy', url: '/documents/d-9' }),
      work({
        id: 'c-1',
        source: 'training_due',
        title: 'Fire safety',
        lane: 'training',
        url: '/training/assignments/c-1',
      }),
    ];
    const { el, api, fixture } = setup({ tab: 'acknowledge' });
    api.myWork.mockReturnValue(of({ items: extra }));
    (fixture.componentInstance as unknown as { reload(): void }).reload();
    fixture.detectChanges();
    const titles = () =>
      Array.from(el.querySelectorAll('[data-testid="work-row"] a')).map((a) =>
        a.textContent?.trim(),
      );
    expect(titles()).toEqual(['Read the policy']);
    expect(el.querySelector('[data-testid="work-count-acknowledge"]')?.textContent).toBe('1');
    expect(el.querySelector('[data-testid="work-count-training"]')?.textContent).toBe('1');
  });

  it('switches to everyone’s work and flags what is not mine (U08)', () => {
    const { el, api, fixture, query } = setup({ scope: 'all', tab: 'later' });
    expect(api.myWork).toHaveBeenLastCalledWith('org-1', { scope: 'all' });
    api.myWork.mockReturnValue(
      of({ items: [work({ id: 't-9', title: 'Their task', mine: false })] }),
    );
    query.next(convertToParamMap({ scope: 'all', tab: 'later', x: '1' }));
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { reload(): void }).reload();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="work-not-mine"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="work-scope-all"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('opens the calendar as a tab', () => {
    const { el, api } = setup({ tab: 'calendar' });
    expect(
      el.querySelector('[data-testid="work-tab-calendar"]')?.getAttribute('aria-selected'),
    ).toBe('true');
    const [, q] = api.myWork.mock.calls.at(-1) as unknown as [string, { from: string }];
    expect(q.from).toMatch(/T00:00:00$/);
  });

  it('loads the calendar month window', () => {
    const { api } = setup({ view: 'calendar' });
    const [, query] = api.myWork.mock.calls.at(-1) as unknown as [
      string,
      { from: string; to: string },
    ];
    expect(query.from).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00$/);
    expect(query.to).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:59$/);
  });
});
