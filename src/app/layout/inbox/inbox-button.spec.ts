import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of } from 'rxjs';
import { ChatStore } from '../../core/chat/chat-store';
import { LanguageService } from '../../core/i18n/language.service';
import { InboxService } from '../../core/notifications/inbox.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UserNotificationsApi } from '../../core/notifications/user-notifications-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { MyWorkResponse, WorkItem } from '../../core/tasks/task.models';
import { TasksApi } from '../../core/tasks/tasks-api';
import { InboxButton, defaultInboxTab, inboxBadge, inboxTasks } from './inbox-button';

function work(id: string, extra: Partial<WorkItem> = {}): WorkItem {
  return {
    source: 'task',
    id,
    title: `Task ${id}`,
    code: null,
    status: 'open',
    priority: null,
    due_at: null,
    url: `/tasks/${id}`,
    entity_type: 'task',
    entity_id: id,
    module: null,
    overdue: false,
    group: 'later',
    ...extra,
  };
}

describe('inbox helpers', () => {
  it('puts overdue first, then this week, earliest due first', () => {
    const items = [
      work('later', { due_at: '2026-12-30' }),
      work('week', { group: 'this_week', due_at: '2026-11-25' }),
      work('late', { overdue: true, group: 'overdue', due_at: '2026-11-01' }),
      work('week-early', { group: 'this_week', due_at: '2026-11-23' }),
    ];
    expect(inboxTasks(items).map((i) => i.id)).toEqual(['late', 'week-early', 'week', 'later']);
    expect(inboxTasks(items, 2)).toHaveLength(2);
  });

  it('caps the badge at 9+', () => {
    expect(inboxBadge(0)).toBe('');
    expect(inboxBadge(4)).toBe('4');
    expect(inboxBadge(12)).toBe('9+');
  });

  it('opens on the first tab with something new', () => {
    expect(defaultInboxTab(2, 1, 1, true)).toBe('tasks');
    expect(defaultInboxTab(0, 1, 1, true)).toBe('messages');
    expect(defaultInboxTab(0, 1, 1, false)).toBe('notifications');
    expect(defaultInboxTab(0, 0, 0, true)).toBe('tasks');
  });
});

describe('InboxButton', () => {
  function setup(response: MyWorkResponse) {
    const myWork = vi.fn(() => of(response));
    const unread = signal(3);
    TestBed.configureTestingModule({
      imports: [
        InboxButton,
        TranslocoTestingModule.forRoot({
          langs: { en: {}, 'shell/en': {}, 'tasks/en': {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: TasksApi, useValue: { myWork } },
        {
          provide: InboxService,
          useValue: {
            unreadCount: unread.asReadonly(),
            setUnreadCount: vi.fn(),
            markRead: vi.fn(),
            markAllRead: vi.fn(),
          },
        },
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrgId: signal('org-1').asReadonly(),
            currentOrg: signal({ id: 'org-1', permissions: ['tasks:read'] }).asReadonly(),
          },
        },
        { provide: UserNotificationsApi, useValue: { list: vi.fn(() => new Subject()) } },
        { provide: NotificationService, useValue: { error: vi.fn() } },
        { provide: LanguageService, useValue: { active: signal('en').asReadonly() } },
        { provide: ChatStore, useValue: { available: signal(false), unreadBadge: signal(0) } },
      ],
    });
    const fixture = TestBed.createComponent(InboxButton);
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return { fixture, el, q, myWork, unread };
  }

  it('adds due tasks and unread notifications in the badge and opens on Oppgaver', async () => {
    const { fixture, q, el, myWork } = setup({
      items: [
        work('a', { overdue: true, group: 'overdue' }),
        work('b', { group: 'this_week' }),
        work('c'),
      ],
      counts: { overdue: 1, this_week: 1, later: 1, awaiting_review: 0, total: 3 },
    });
    await fixture.whenStable();
    expect(myWork).toHaveBeenCalledWith('org-1');
    // 2 tasks due + 3 unread notifications; chat is off.
    expect(q('inbox-badge')?.textContent?.trim()).toBe('5');

    q('inbox-button')!.click();
    await fixture.whenStable();
    expect(q('inbox-panel')).not.toBeNull();
    expect(q('inbox-tab-tasks')?.getAttribute('aria-selected')).toBe('true');
    expect(q('inbox-tab-messages')).toBeNull();
    const tasks = Array.from(el.querySelectorAll('[data-testid="inbox-task"]'));
    expect(tasks).toHaveLength(3);
    expect(tasks[0].querySelector('a')?.getAttribute('href')).toBe('/tasks/a');
    expect(q('inbox-my-work')?.getAttribute('href')).toBe('/my-work');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(q('inbox-panel')).toBeNull();
  });

  it('opens on Varsler when only notifications are new, and says when nothing is due', async () => {
    const { fixture, q } = setup({ items: [] });
    await fixture.whenStable();
    q('inbox-button')!.click();
    await fixture.whenStable();
    expect(q('inbox-tab-notifications')?.getAttribute('aria-selected')).toBe('true');
    q('inbox-tab-tasks')!.click();
    await fixture.whenStable();
    expect(q('inbox-tasks-empty')).not.toBeNull();
  });
});
