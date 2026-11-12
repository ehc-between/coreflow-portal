import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { TasksApi } from './tasks-api';

const BASE = 'http://test/api';
const ORG = 'org-1';

describe('TasksApi', () => {
  let api: TasksApi;
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
    api = TestBed.inject(TasksApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists tasks with filters as query params (status as csv)', () => {
    api
      .list(ORG, {
        entity_type: 'deviation',
        entity_id: 'd-1',
        assignee: 'me',
        status: ['open', 'in_progress'],
        recurrence_id: 'r-1',
        q: 'fire',
        sort: 'priority',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/v1/orgs/${ORG}/tasks`);
    expect(req.request.method).toBe('GET');
    const p = req.request.params;
    expect(p.get('entity_type')).toBe('deviation');
    expect(p.get('entity_id')).toBe('d-1');
    expect(p.get('assignee')).toBe('me');
    expect(p.get('status')).toBe('open,in_progress');
    expect(p.get('recurrence_id')).toBe('r-1');
    expect(p.get('q')).toBe('fire');
    expect(p.get('sort')).toBe('priority');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    req.flush({ items: [], total: 0 });
  });

  it('omits empty filters', () => {
    api.list(ORG, { status: [], q: '' }).subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/v1/orgs/${ORG}/tasks`);
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ items: [], total: 0 });
  });

  it('creates a task without the generic error toast', () => {
    api.create(ORG, { title: 'Check extinguishers', priority: 'high' }).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/tasks`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Check extinguishers', priority: 'high' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({});
  });

  it('gets, patches and deletes a task', () => {
    api.get(ORG, 't-1').subscribe();
    http.expectOne(`${BASE}/v1/orgs/${ORG}/tasks/t-1`).flush({});

    api.update(ORG, 't-1', { status: 'blocked', assignee: null }).subscribe();
    const patch = http.expectOne(`${BASE}/v1/orgs/${ORG}/tasks/t-1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ status: 'blocked', assignee: null });
    patch.flush({});

    api.delete(ORG, 't-1').subscribe();
    const del = http.expectOne(`${BASE}/v1/orgs/${ORG}/tasks/t-1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it.each(['complete', 'reopen', 'cancel'] as const)('posts the %s transition', (action) => {
    api[action](ORG, 't-1').subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/tasks/t-1/${action}`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('manages checklist items', () => {
    api.addChecklistItem(ORG, 't-1', 'Step').subscribe();
    const add = http.expectOne(`${BASE}/v1/orgs/${ORG}/tasks/t-1/checklist`);
    expect(add.request.body).toEqual({ text: 'Step' });
    add.flush({});

    api.updateChecklistItem(ORG, 't-1', 'c-1', { done: true }).subscribe();
    const upd = http.expectOne(`${BASE}/v1/orgs/${ORG}/tasks/t-1/checklist/c-1`);
    expect(upd.request.method).toBe('PATCH');
    expect(upd.request.body).toEqual({ done: true });
    upd.flush({});

    api.deleteChecklistItem(ORG, 't-1', 'c-1').subscribe();
    const del = http.expectOne(`${BASE}/v1/orgs/${ORG}/tasks/t-1/checklist/c-1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('lists, creates, updates and deletes recurring series', () => {
    api.listRecurrences(ORG, { active: true, limit: 10 }).subscribe();
    const list = http.expectOne((r) => r.url === `${BASE}/v1/orgs/${ORG}/task-recurrences`);
    expect(list.request.params.get('active')).toBe('true');
    expect(list.request.params.get('limit')).toBe('10');
    list.flush({ items: [], total: 0 });

    const body = {
      title: 'Monthly round',
      recurrence: { rrule: 'FREQ=MONTHLY', dtstart: '2026-12-01T23:59:59', lead_days: 7 },
    };
    api.createRecurrence(ORG, body).subscribe();
    const create = http.expectOne(`${BASE}/v1/orgs/${ORG}/task-recurrences`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(body);
    create.flush({});

    api.updateRecurrence(ORG, 'r-1', { active: false }).subscribe();
    const upd = http.expectOne(`${BASE}/v1/orgs/${ORG}/task-recurrences/r-1`);
    expect(upd.request.method).toBe('PATCH');
    upd.flush({});

    api.deleteRecurrence(ORG, 'r-1').subscribe();
    const del = http.expectOne(`${BASE}/v1/orgs/${ORG}/task-recurrences/r-1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('fetches My Work with an optional window and sources', () => {
    api
      .myWork(ORG, {
        from: '2026-11-01T00:00:00',
        to: '2026-11-30T23:59:59',
        include: ['task', 'deviation_action'],
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/v1/orgs/${ORG}/my-work`);
    expect(req.request.params.get('from')).toBe('2026-11-01T00:00:00');
    expect(req.request.params.get('to')).toBe('2026-11-30T23:59:59');
    expect(req.request.params.get('include')).toBe('task,deviation_action');
    req.flush({ items: [] });
  });
});
