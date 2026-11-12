import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ReportsApi, filterParams } from './reports-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}/reports`;

describe('ReportsApi', () => {
  let api: ReportsApi;
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
    api = TestBed.inject(ReportsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the compliance dashboard, with and without a framework', () => {
    api.compliance(ORG).subscribe();
    const all = http.expectOne((r) => r.url === `${ROOT}/compliance`);
    expect(all.request.params.has('framework')).toBe(false);
    all.flush({});

    api.compliance(ORG, 'iso27001').subscribe();
    const one = http.expectOne((r) => r.url === `${ROOT}/compliance`);
    expect(one.request.params.get('framework')).toBe('iso27001');
    one.flush({});
  });

  it('sends the calendar window, modules as csv and include_overdue only when set', () => {
    api
      .calendar(ORG, {
        from: '2026-11-01T00:00:00',
        to: '2026-12-01T00:00:00',
        modules: ['tasks', 'deviations'],
        framework: 'iso9001',
        include_overdue: true,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/calendar`);
    const p = req.request.params;
    expect(p.get('from')).toBe('2026-11-01T00:00:00');
    expect(p.get('to')).toBe('2026-12-01T00:00:00');
    expect(p.get('modules')).toBe('tasks,deviations');
    expect(p.get('framework')).toBe('iso9001');
    expect(p.get('include_overdue')).toBe('true');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ start: '', end: '', items: [], truncated: false });

    api.calendar(ORG, {}).subscribe();
    const bare = http.expectOne((r) => r.url === `${ROOT}/calendar`);
    expect(bare.request.params.keys()).toEqual([]);
    bare.flush({ start: '', end: '', items: [], truncated: false });
  });

  it('downloads the calendar as an .ics blob', () => {
    api.calendarIcs(ORG, { from: 'a', to: 'b', modules: ['tasks'] }).subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/calendar.ics`);
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('modules')).toBe('tasks');
    req.flush(new Blob(['BEGIN:VCALENDAR']));
  });

  it('saves a dashboard layout with explicit null frameworks and resets it', () => {
    api
      .saveDashboard(ORG, 'quality_manager', [
        { key: 'standards.readiness', size: 'lg' },
        { key: 'tasks.overdue', framework: 'iso9001', size: 'sm' },
      ])
      .subscribe();
    const put = http.expectOne(`${ROOT}/dashboards/quality_manager`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({
      widgets: [
        { key: 'standards.readiness', framework: null, size: 'lg' },
        { key: 'tasks.overdue', framework: 'iso9001', size: 'sm' },
      ],
    });
    put.flush({});

    api.resetDashboard(ORG, 'default').subscribe();
    const del = http.expectOne(`${ROOT}/dashboards/default`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('previews and exports a register with its filters', () => {
    api
      .previewRegister(ORG, 'deviations', {
        q: ' fire ',
        status: ['open', 'closed'],
        from: '2026-01-01T00:00:00',
        lang: 'nb',
        limit: 50,
      })
      .subscribe();
    const preview = http.expectOne((r) => r.url === `${ROOT}/registers/deviations`);
    const p = preview.request.params;
    expect(p.get('q')).toBe('fire');
    expect(p.get('status')).toBe('open,closed');
    expect(p.get('from')).toBe('2026-01-01T00:00:00');
    expect(p.has('to')).toBe(false);
    expect(p.get('lang')).toBe('nb');
    expect(p.get('limit')).toBe('50');
    preview.flush({
      register_key: 'deviations',
      columns: [],
      rows: [],
      total: 0,
      truncated: false,
    });

    api
      .exportRegister(ORG, 'soa', {
        format: 'pdf',
        standard_key: 'iso27001',
        columns: ['code', 'title'],
      })
      .subscribe();
    const exp = http.expectOne((r) => r.url === `${ROOT}/registers/soa/export`);
    expect(exp.request.responseType).toBe('blob');
    expect(exp.request.params.get('format')).toBe('pdf');
    expect(exp.request.params.get('standard_key')).toBe('iso27001');
    expect(exp.request.params.get('columns')).toBe('code,title');
    exp.flush(new Blob(['x']));
  });

  it('lists, creates, updates, schedules and deletes saved reports', () => {
    api
      .listDefinitions(ORG, { q: 'q', owner: 'me', sort: '-updated_at', limit: 25, offset: 25 })
      .subscribe();
    const list = http.expectOne((r) => r.url === `${ROOT}/definitions`);
    expect(list.request.params.get('owner')).toBe('me');
    expect(list.request.params.get('sort')).toBe('-updated_at');
    expect(list.request.params.get('offset')).toBe('25');
    list.flush({ items: [], total: 0 });

    const body = {
      name: 'Open',
      register_key: 'deviations',
      default_format: 'xlsx',
      lang: 'en',
    } as const;
    api.createDefinition(ORG, body).subscribe();
    const create = http.expectOne(`${ROOT}/definitions`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(body);
    expect(create.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    create.flush({});

    api.updateDefinition(ORG, 'd-1', { name: 'New', change_reason: 'why' }).subscribe();
    const patch = http.expectOne(`${ROOT}/definitions/d-1`);
    expect(patch.request.method).toBe('PATCH');
    patch.flush({});

    api.exportDefinition(ORG, 'd-1', 'csv').subscribe();
    const exp = http.expectOne((r) => r.url === `${ROOT}/definitions/d-1/export`);
    expect(exp.request.params.get('format')).toBe('csv');
    exp.flush(new Blob(['x']));

    api
      .scheduleDefinition(ORG, 'd-1', {
        rrule: 'FREQ=MONTHLY',
        dtstart: '2026-12-01T08:00:00',
        lead_days: 3,
      })
      .subscribe();
    const schedule = http.expectOne(`${ROOT}/definitions/d-1/schedule`);
    expect(schedule.request.method).toBe('POST');
    schedule.flush({ task_id: 't', recurrence_id: 'r', due_at: null });

    api.deleteDefinition(ORG, 'd-1').subscribe();
    const del = http.expectOne(`${ROOT}/definitions/d-1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('generates, lists, downloads and deletes audit packs', () => {
    api
      .createAuditPack(ORG, {
        standard_key: 'iso27001',
        lang: 'en',
        include_policies: true,
        registers: null,
      })
      .subscribe();
    const create = http.expectOne(`${ROOT}/audit-packs`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body.registers).toBeNull();
    create.flush({});

    api.listAuditPacks(ORG, { framework: 'iso27001', limit: 25, offset: 0 }).subscribe();
    const list = http.expectOne((r) => r.url === `${ROOT}/audit-packs`);
    expect(list.request.params.get('framework')).toBe('iso27001');
    list.flush({ items: [], total: 0 });

    api.downloadAuditPack(ORG, 'p-1').subscribe();
    const dl = http.expectOne(`${ROOT}/audit-packs/p-1/download`);
    expect(dl.request.responseType).toBe('blob');
    dl.flush(new Blob(['zip']));

    api.deleteAuditPack(ORG, 'p-1').subscribe();
    http.expectOne(`${ROOT}/audit-packs/p-1`).flush(null);
  });

  it('drops empty filters', () => {
    expect(filterParams({ q: '  ', status: [], from: '', to: null, standard_key: null })).toEqual({
      q: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
      standard_key: undefined,
    });
  });
});
