import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { InboxService } from '../../core/notifications/inbox.service';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  UserNotification,
  UserNotificationList,
  UserNotificationListQuery,
} from '../../core/notifications/user-notification.models';
import { UserNotificationsApi } from '../../core/notifications/user-notifications-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { NOTIFICATION_PAGE_SIZE, NotificationBell } from './notification-bell';

function make(id: string, overrides: Partial<UserNotification> = {}): UserNotification {
  return {
    id,
    org_id: 'org-1',
    kind: 'deviation_assigned',
    entity_type: 'deviation',
    entity_id: `dev-${id}`,
    title_key: 'notifications.deviationAssigned',
    params: { deviation_id: `dev-${id}`, code: `D-${id}`, title: 'Spill', actor_name: 'Ada' },
    created_at: new Date().toISOString(),
    read_at: null,
    is_read: false,
    ...overrides,
  };
}

function page(
  items: UserNotification[],
  total = items.length,
  unread = items.filter((n) => !n.is_read).length,
): UserNotificationList {
  return { items, total, unread_count: unread, limit: NOTIFICATION_PAGE_SIZE, offset: 0 };
}

const EN = {
  topbar: { notifications: 'Notifications' },
  notifications: {
    deviationAssigned: '{{actor_name}} assigned you {{code}}: {{title}}',
    bellUnread: 'Notifications, {{count}} unread',
    panel: {
      title: 'Notifications',
      markAllRead: 'Mark all as read',
      loading: 'Loading',
      error: 'Load failed',
      retry: 'Retry',
      empty: 'All caught up',
      loadMore: 'Load more',
      unread: 'Unread',
      settings: 'Settings',
    },
  },
};

function setup() {
  const unread = signal(2);
  const orgId = signal<string | null>('org-1');
  const list$ = { current: new Subject<UserNotificationList>() };
  const api = {
    list: vi.fn((query: UserNotificationListQuery) => {
      void query;
      return list$.current;
    }),
  };
  const inbox = {
    unreadCount: unread.asReadonly(),
    setUnreadCount: vi.fn((c: number) => unread.set(c)),
    markRead: vi.fn((n: UserNotification) => {
      unread.update((c) => c - 1);
      return of({ ...n, is_read: true });
    }),
    markAllRead: vi.fn(() => {
      unread.set(0);
      return of({ updated: 2 });
    }),
  };
  const toasts = { error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [
      NotificationBell,
      TranslocoTestingModule.forRoot({
        langs: { en: EN },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: UserNotificationsApi, useValue: api },
      { provide: InboxService, useValue: inbox },
      { provide: NotificationService, useValue: toasts },
      { provide: SelectedOrgService, useValue: { currentOrgId: orgId.asReadonly() } },
      { provide: LanguageService, useValue: { active: signal('en').asReadonly() } },
    ],
  });
  const fixture = TestBed.createComponent(NotificationBell);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

  const bell = () => el.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
  const panel = () => el.querySelector<HTMLElement>('[role="dialog"]');
  const items = () => Array.from(el.querySelectorAll<HTMLElement>('[data-notification-item]'));
  const byTestId = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const render = () => fixture.detectChanges();
  const open = async () => {
    bell().click();
    render();
    await fixture.whenStable();
  };

  return {
    fixture,
    el,
    api,
    inbox,
    toasts,
    unread,
    orgId,
    list$,
    navigate,
    bell,
    panel,
    items,
    byTestId,
    render,
    open,
  };
}

describe('NotificationBell', () => {
  it('shows the unread badge and an accessible label', () => {
    const { bell, byTestId, unread, render } = setup();
    expect(byTestId('unread-badge')?.textContent?.trim()).toBe('2');
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 2 unread');

    unread.set(150);
    render();
    expect(byTestId('unread-badge')?.textContent?.trim()).toBe('99+');

    unread.set(0);
    render();
    expect(byTestId('unread-badge')).toBeNull();
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
  });

  it('loads the first page for the selected org when opened and shows loading', async () => {
    const { api, list$, open, byTestId, items, render, inbox, panel, bell } = setup();
    await open();
    expect(bell().getAttribute('aria-expanded')).toBe('true');
    expect(api.list).toHaveBeenCalledWith({
      org_id: 'org-1',
      limit: NOTIFICATION_PAGE_SIZE,
      offset: 0,
    });
    expect(byTestId('notifications-loading')).not.toBeNull();
    expect(document.activeElement).toBe(panel());

    list$.current.next(page([make('1'), make('2', { is_read: true })], 2, 1));
    render();
    expect(items()).toHaveLength(2);
    expect(items()[0].textContent).toContain('Ada assigned you D-1: Spill');
    expect(items()[0].hasAttribute('data-unread')).toBe(true);
    expect(items()[1].hasAttribute('data-unread')).toBe(false);
    expect(inbox.setUnreadCount).toHaveBeenCalledWith(1);
  });

  it('shows the empty state', async () => {
    const { list$, open, byTestId, render } = setup();
    await open();
    list$.current.next(page([]));
    render();
    expect(byTestId('notifications-empty')).not.toBeNull();
  });

  it('shows an error state with retry', async () => {
    const { api, list$, open, byTestId, render, items } = setup();
    await open();
    list$.current.error(new Error('boom'));
    render();
    const error = byTestId('notifications-error')!;
    expect(error).not.toBeNull();

    list$.current = new Subject();
    error.querySelector('button')!.click();
    render();
    expect(api.list).toHaveBeenCalledTimes(2);
    list$.current.next(page([make('1')]));
    render();
    expect(items()).toHaveLength(1);
  });

  it('marks an unread notification read and navigates to its deviation', async () => {
    const { list$, open, items, render, inbox, navigate, panel } = setup();
    await open();
    list$.current.next(page([make('1')]));
    render();
    items()[0].click();
    render();
    expect(inbox.markRead).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    expect(navigate).toHaveBeenCalledWith(['/deviations', 'dev-1']);
    expect(panel()).toBeNull();
  });

  it('does not mark an already-read notification again', async () => {
    const { list$, open, items, render, inbox, navigate } = setup();
    await open();
    list$.current.next(page([make('1', { is_read: true })]));
    render();
    items()[0].click();
    expect(inbox.markRead).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/deviations', 'dev-1']);
  });

  it('marks all as read', async () => {
    const { list$, open, items, render, inbox, byTestId } = setup();
    await open();
    list$.current.next(page([make('1'), make('2')]));
    render();
    byTestId('mark-all-read')!.click();
    render();
    expect(inbox.markAllRead).toHaveBeenCalled();
    expect(items().some((i) => i.hasAttribute('data-unread'))).toBe(false);
    expect((byTestId('mark-all-read') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports a failed mark-all', async () => {
    const { list$, open, render, inbox, byTestId, toasts } = setup();
    inbox.markAllRead.mockImplementationOnce(() => throwError(() => new Error('boom')));
    await open();
    list$.current.next(page([make('1')]));
    render();
    byTestId('mark-all-read')!.click();
    expect(toasts.error).toHaveBeenCalledWith('notifications.panel.markAllFailed');
  });

  it('loads more pages and appends them', async () => {
    const { api, list$, open, items, render, byTestId } = setup();
    await open();
    list$.current.next(page([make('1'), make('2')], 3));
    render();
    list$.current = new Subject();
    byTestId('load-more')!.click();
    render();
    expect(api.list).toHaveBeenLastCalledWith({
      org_id: 'org-1',
      limit: NOTIFICATION_PAGE_SIZE,
      offset: 2,
    });
    list$.current.next(page([make('2'), make('3')], 3));
    render();
    expect(items()).toHaveLength(3);
    expect(byTestId('load-more')).toBeNull();
  });

  it('closes on Escape and returns focus to the bell', async () => {
    const { list$, open, render, panel, bell } = setup();
    await open();
    list$.current.next(page([make('1')]));
    render();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    render();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(bell());
  });

  it('moves focus between entries with arrow keys', async () => {
    const { list$, open, render, panel, items } = setup();
    await open();
    list$.current.next(page([make('1'), make('2')]));
    render();
    const press = (key: string) =>
      panel()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    press('ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    press('ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    press('ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    press('ArrowUp');
    expect(document.activeElement).toBe(items()[1]);
  });

  it('closes on outside click', async () => {
    const { open, render, panel } = setup();
    await open();
    document.body.click();
    render();
    expect(panel()).toBeNull();
  });

  it('reloads the open panel on org switch', async () => {
    const { api, open, orgId, fixture } = setup();
    await open();
    orgId.set('org-2');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.list).toHaveBeenLastCalledWith({
      org_id: 'org-2',
      limit: NOTIFICATION_PAGE_SIZE,
      offset: 0,
    });
  });
});
