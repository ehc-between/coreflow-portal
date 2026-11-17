import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { INBOX_POLL_INTERVAL_MS, InboxService } from './inbox.service';
import {
  UnreadCountResponse,
  UnreadCountsByOrgResponse,
  UserNotification,
} from './user-notification.models';
import { UserNotificationsApi } from './user-notifications-api';

function notification(overrides: Partial<UserNotification> = {}): UserNotification {
  return {
    id: 'n-1',
    org_id: 'org-1',
    kind: 'deviation_assigned',
    entity_type: 'deviation',
    entity_id: 'dev-1',
    title_key: 'notifications.deviationAssigned',
    params: { deviation_id: 'dev-1' },
    created_at: '2026-10-19T10:00:00Z',
    read_at: null,
    is_read: false,
    ...overrides,
  };
}

describe('InboxService', () => {
  let hidden = false;

  beforeEach(() => {
    hidden = false;
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'hidden');
  });

  function setup(opts: { authenticated?: boolean; orgId?: string | null } = {}) {
    const authenticated = signal(opts.authenticated ?? true);
    const orgId = signal<string | null>(opts.orgId === undefined ? 'org-1' : opts.orgId);
    let nextCount = 3;
    const api = {
      unreadCount: vi.fn(() => of<UnreadCountResponse>({ count: nextCount })),
      unreadCountsByOrg: vi.fn(() =>
        of<UnreadCountsByOrgResponse>({
          items: [
            { org_id: 'org-1', count: nextCount },
            { org_id: 'org-2', count: 4 },
          ],
          total: nextCount + 4,
        }),
      ),
      markRead: vi.fn((id: string) => of(notification({ id, is_read: true }))),
      markAllRead: vi.fn(() => of({ updated: 3 })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: UserNotificationsApi, useValue: api },
        { provide: AuthService, useValue: { isAuthenticated: authenticated.asReadonly() } },
        { provide: SelectedOrgService, useValue: { currentOrgId: orgId.asReadonly() } },
      ],
    });
    const inbox = TestBed.inject(InboxService);
    TestBed.tick();
    return {
      inbox,
      api,
      authenticated,
      orgId,
      setNextCount: (count: number) => (nextCount = count),
    };
  }

  function setHidden(value: boolean): void {
    hidden = value;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('fetches the unread count for the selected org on start', () => {
    const { inbox, api } = setup();
    expect(api.unreadCount).toHaveBeenCalledWith('org-1');
    expect(inbox.unreadCount()).toBe(3);
    expect(inbox.hasUnread()).toBe(true);
  });

  it('polls every interval while visible', () => {
    const { inbox, api, setNextCount } = setup();
    setNextCount(5);
    vi.advanceTimersByTime(INBOX_POLL_INTERVAL_MS);
    expect(api.unreadCount).toHaveBeenCalledTimes(2);
    expect(inbox.unreadCount()).toBe(5);
    vi.advanceTimersByTime(INBOX_POLL_INTERVAL_MS);
    expect(api.unreadCount).toHaveBeenCalledTimes(3);
  });

  it('pauses polling while the tab is hidden and refreshes on return', () => {
    const { api } = setup();
    setHidden(true);
    vi.advanceTimersByTime(INBOX_POLL_INTERVAL_MS * 3);
    expect(api.unreadCount).toHaveBeenCalledTimes(1);

    setHidden(false);
    expect(api.unreadCount).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(INBOX_POLL_INTERVAL_MS);
    expect(api.unreadCount).toHaveBeenCalledTimes(3);
  });

  it('refreshes on org switch and drops a late answer for the previous org', () => {
    const pending = new Subject<UnreadCountResponse>();
    const { inbox, api, orgId } = setup();
    api.unreadCount.mockImplementationOnce(() => pending);
    vi.advanceTimersByTime(INBOX_POLL_INTERVAL_MS); // org-1 poll in flight

    api.unreadCount.mockImplementation(() => of({ count: 7 }));
    orgId.set('org-2');
    TestBed.tick();
    expect(api.unreadCount).toHaveBeenLastCalledWith('org-2');
    expect(inbox.unreadCount()).toBe(7);

    pending.next({ count: 99 });
    expect(inbox.unreadCount()).toBe(7);
  });

  it('does not poll when signed out and stops on sign-out', () => {
    const { inbox, api, authenticated } = setup();
    expect(api.unreadCount).toHaveBeenCalledTimes(1);
    authenticated.set(false);
    TestBed.tick();
    expect(inbox.unreadCount()).toBe(0);
    vi.advanceTimersByTime(INBOX_POLL_INTERVAL_MS * 2);
    expect(api.unreadCount).toHaveBeenCalledTimes(1);
  });

  it('does nothing without an org', () => {
    const { api } = setup({ orgId: null });
    vi.advanceTimersByTime(INBOX_POLL_INTERVAL_MS);
    expect(api.unreadCount).not.toHaveBeenCalled();
  });

  it('keeps the last count when a poll fails', () => {
    const { inbox, api } = setup();
    api.unreadCount.mockImplementationOnce(() => throwError(() => new Error('boom')));
    vi.advanceTimersByTime(INBOX_POLL_INTERVAL_MS);
    expect(inbox.unreadCount()).toBe(3);
  });

  it('decrements the badge when an unread notification is marked read', () => {
    const { inbox, api } = setup();
    inbox.markRead(notification({ id: 'n-9' })).subscribe();
    expect(api.markRead).toHaveBeenCalledWith('n-9');
    expect(inbox.unreadCount()).toBe(2);

    inbox.markRead(notification({ id: 'n-8', is_read: true })).subscribe();
    expect(inbox.unreadCount()).toBe(2);
  });

  it('marks all read for the selected org and clears the badge', () => {
    const { inbox, api } = setup();
    inbox.markAllRead().subscribe();
    expect(api.markAllRead).toHaveBeenCalledWith('org-1');
    expect(inbox.unreadCount()).toBe(0);
  });

  describe('per-org unread counts', () => {
    it('loads the count of every org with each poll', () => {
      const { inbox, api } = setup();
      expect(api.unreadCountsByOrg).toHaveBeenCalledTimes(1);
      expect(inbox.unreadByOrg().get('org-1')).toBe(3);
      expect(inbox.unreadByOrg().get('org-2')).toBe(4);
      expect(inbox.unreadElsewhere()).toBe(4);
      vi.advanceTimersByTime(INBOX_POLL_INTERVAL_MS);
      expect(api.unreadCountsByOrg).toHaveBeenCalledTimes(2);
    });

    it('counts the other orgs as "elsewhere" after a switch', () => {
      const { inbox, orgId } = setup();
      orgId.set('org-2');
      TestBed.tick();
      expect(inbox.unreadElsewhere()).toBe(3);
    });

    it("decrements the notification's own org when it is marked read", () => {
      const { inbox } = setup();
      inbox.markRead(notification({ id: 'n-7', org_id: 'org-2' })).subscribe();
      expect(inbox.unreadByOrg().get('org-2')).toBe(3);
      // Not the selected org: its badge is untouched.
      expect(inbox.unreadCount()).toBe(3);
    });

    it('zeroes the selected org on mark-all-read', () => {
      const { inbox } = setup();
      inbox.markAllRead().subscribe();
      expect(inbox.unreadByOrg().get('org-1')).toBe(0);
      expect(inbox.unreadByOrg().get('org-2')).toBe(4);
    });

    it('clears the counts on sign-out', () => {
      const { inbox, authenticated } = setup();
      authenticated.set(false);
      TestBed.tick();
      expect(inbox.unreadByOrg().size).toBe(0);
      expect(inbox.unreadElsewhere()).toBe(0);
    });

    it('keeps the last counts when the request fails', () => {
      const { inbox, api } = setup();
      api.unreadCountsByOrg.mockImplementationOnce(() => throwError(() => new Error('boom')));
      vi.advanceTimersByTime(INBOX_POLL_INTERVAL_MS);
      expect(inbox.unreadByOrg().get('org-2')).toBe(4);
    });
  });
});
