import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { activityErrorCode, activityErrorKey, isUnsupportedEntity } from './activity-errors';
import { NotificationRulesApi } from './notification-rules-api';
import { UserNotificationsApi } from './user-notifications-api';
import { WatchersApi } from './watchers-api';

const BASE = 'http://test/api';

describe('F3 API clients', () => {
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
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('gets, watches and unwatches a record for the current user', () => {
    const api = TestBed.inject(WatchersApi);
    const state = { watching: true, count: 1, users: [{ id: 'u1', name: 'Ada' }] };
    api.get('org-1', 'deviation', 'd-1').subscribe();
    api.watch('org-1', 'deviation', 'd-1').subscribe();
    api.unwatch('org-1', 'deviation', 'd-1').subscribe();
    const reqs = http.match((r) => r.url === `${BASE}/v1/orgs/org-1/watchers`);
    expect(reqs.map((r) => r.request.method)).toEqual(['GET', 'PUT', 'DELETE']);
    for (const req of reqs) {
      expect(req.request.params.get('entity_type')).toBe('deviation');
      expect(req.request.params.get('entity_id')).toBe('d-1');
      expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
      req.flush(state);
    }
  });

  it('lists, sets and resets notification rules', () => {
    const api = TestBed.inject(NotificationRulesApi);
    api.listRules('org-1').subscribe();
    http.expectOne(`${BASE}/v1/orgs/org-1/notification-rules`).flush([]);

    const body = {
      recipients: [{ type: 'owner' as const }],
      channels: ['in_app' as const],
      enabled: true,
    };
    api.setRule('org-1', 'reminder.due_soon', body).subscribe();
    const put = http.expectOne(`${BASE}/v1/orgs/org-1/notification-rules/reminder.due_soon`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual(body);
    put.flush({});

    api.resetRule('org-1', 'reminder.due_soon').subscribe();
    const del = http.expectOne(`${BASE}/v1/orgs/org-1/notification-rules/reminder.due_soon`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('reads and writes settings and department leads', () => {
    const api = TestBed.inject(NotificationRulesApi);
    const settings = {
      reminder_days: 3,
      escalation_days: 5,
      escalation_role_key: null,
      escalate_to_department_lead: true,
    };
    api.getSettings('org-1').subscribe();
    http.expectOne(`${BASE}/v1/orgs/org-1/notification-settings`).flush(settings);
    api.updateSettings('org-1', settings).subscribe();
    const put = http.expectOne(`${BASE}/v1/orgs/org-1/notification-settings`);
    expect(put.request.method).toBe('PUT');
    put.flush(settings);

    api.listDepartmentLeads('org-1').subscribe();
    http.expectOne(`${BASE}/v1/orgs/org-1/department-leads`).flush([]);
    api.setDepartmentLead('org-1', 'dep-1', null).subscribe();
    const lead = http.expectOne(`${BASE}/v1/orgs/org-1/departments/dep-1/lead`);
    expect(lead.request.method).toBe('PUT');
    expect(lead.request.body).toEqual({ user_id: null });
    lead.flush({});
  });

  it('reads and writes the current user categories and quiet hours', () => {
    const api = TestBed.inject(UserNotificationsApi);
    api.getCategories('org-1').subscribe();
    const get = http.expectOne((r) => r.url === `${BASE}/v1/me/notification-categories`);
    expect(get.request.params.get('org_id')).toBe('org-1');
    get.flush([]);

    const prefs = [{ category: 'reminders', in_app: false, email: 'immediate' as const }];
    api.updateCategories('org-1', prefs).subscribe();
    const put = http.expectOne((r) => r.url === `${BASE}/v1/me/notification-categories`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual(prefs);
    expect(put.request.params.get('org_id')).toBe('org-1');
    put.flush(prefs);

    const schedule = { quiet_start: '22:00:00', quiet_end: '07:00:00', timezone: 'Europe/Oslo' };
    api.getSchedule().subscribe();
    http.expectOne(`${BASE}/v1/me/notification-schedule`).flush(schedule);
    api.updateSchedule(schedule).subscribe();
    const sched = http.expectOne(`${BASE}/v1/me/notification-schedule`);
    expect(sched.request.method).toBe('PUT');
    sched.flush(schedule);
  });
});

describe('activity errors', () => {
  const err = (status: number, detail: unknown) =>
    new HttpErrorResponse({ status, error: { detail } });

  it('maps structured codes to keys', () => {
    expect(activityErrorCode(err(422, { code: 'unknown_role', role_key: 'x' }))).toBe(
      'unknown_role',
    );
    expect(activityErrorKey(err(422, { code: 'not_a_member' }))).toBe(
      'activity.errors.not_a_member',
    );
  });

  it('falls back by status', () => {
    expect(activityErrorKey(err(0, null))).toBe('activity.errors.network');
    expect(activityErrorKey(err(503, null))).toBe('activity.errors.server');
    expect(activityErrorKey(err(403, 'Insufficient permissions'))).toBe(
      'activity.errors.forbidden',
    );
    expect(activityErrorKey(err(422, [{ msg: 'bad' }]))).toBe('activity.errors.invalid');
    expect(activityErrorKey(new Error('x'))).toBe('activity.errors.generic');
  });

  it('recognises records that cannot be followed', () => {
    expect(isUnsupportedEntity(err(422, { code: 'unsupported_entity_type' }))).toBe(true);
    expect(isUnsupportedEntity(err(404, { code: 'module_disabled' }))).toBe(true);
    expect(isUnsupportedEntity(err(500, null))).toBe(false);
  });
});
