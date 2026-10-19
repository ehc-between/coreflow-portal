import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { UserNotificationsApi } from './user-notifications-api';

const BASE = 'http://test/api';

describe('UserNotificationsApi', () => {
  let api: UserNotificationsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    api = TestBed.inject(UserNotificationsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists notifications with paging and org filter', () => {
    api.list({ org_id: 'org-1', limit: 20, offset: 40 }).subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/v1/me/notifications`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('org_id')).toBe('org-1');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.get('offset')).toBe('40');
    expect(req.request.params.has('unread_only')).toBe(false);
    req.flush({ items: [], total: 0, unread_count: 0, limit: 20, offset: 40 });
  });

  it('fetches the unread count', () => {
    api.unreadCount('org-1').subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/v1/me/notifications/unread-count`);
    expect(req.request.params.get('org_id')).toBe('org-1');
    req.flush({ count: 2 });
  });

  it('marks one read', () => {
    api.markRead('n-1').subscribe();
    const req = http.expectOne(`${BASE}/v1/me/notifications/n-1/read`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('marks all read for an org', () => {
    api.markAllRead('org-1').subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/v1/me/notifications/read-all`);
    expect(req.request.method).toBe('POST');
    expect(req.request.params.get('org_id')).toBe('org-1');
    req.flush({ updated: 1 });
  });

  it('reads and updates digest preferences', () => {
    api.getPreferences().subscribe();
    http.expectOne(`${BASE}/v1/me/notification-preferences`).flush({ items: [] });

    api.updatePreference({ org_id: 'org-1', email_digest: false }).subscribe();
    const req = http.expectOne(`${BASE}/v1/me/notification-preferences`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ org_id: 'org-1', email_digest: false });
    req.flush({ items: [] });
  });

  it('suppresses the generic error toast for background and self-reporting calls', () => {
    api.unreadCount('org-1').subscribe();
    api.list({ org_id: 'org-1' }).subscribe();
    api.markAllRead('org-1').subscribe();
    api.getPreferences().subscribe();
    const reqs = [
      http.expectOne((r) => r.url === `${BASE}/v1/me/notifications/unread-count`),
      http.expectOne((r) => r.url === `${BASE}/v1/me/notifications`),
      http.expectOne((r) => r.url === `${BASE}/v1/me/notifications/read-all`),
      http.expectOne(`${BASE}/v1/me/notification-preferences`),
    ];
    for (const req of reqs) {
      expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
      req.flush({});
    }

    api.updatePreference({ org_id: 'org-1', email_digest: true }).subscribe();
    const put = http.expectOne(`${BASE}/v1/me/notification-preferences`);
    expect(put.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    put.flush({ items: [] });
  });
});
