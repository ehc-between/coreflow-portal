import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ObjectivesApi } from './objectives-api';
import { objectivesErrorCode, objectivesErrorKey } from './objectives-errors';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path: string) => `${BASE}/v1/orgs/${ORG}/objectives${path}`;

describe('ObjectivesApi', () => {
  let api: ObjectivesApi;
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
    api = TestBed.inject(ObjectivesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists objectives with filters as query params (status as csv)', () => {
    api
      .list(ORG, {
        q: 'complaints',
        status: ['draft', 'active'],
        management_system: 'iso9001',
        owner: 'me',
        overdue: true,
        sort: '-due_date',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url(''));
    expect(req.request.method).toBe('GET');
    const p = req.request.params;
    expect(p.get('q')).toBe('complaints');
    expect(p.get('status')).toBe('draft,active');
    expect(p.get('management_system')).toBe('iso9001');
    expect(p.get('owner')).toBe('me');
    expect(p.get('overdue')).toBe('true');
    expect(p.get('sort')).toBe('-due_date');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    req.flush({ items: [], total: 0 });
  });

  it('omits empty filters', () => {
    api.list(ORG, { q: '', status: [], overdue: false }).subscribe();
    const req = http.expectOne((r) => r.url === url(''));
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ items: [], total: 0 });
  });

  it('reads the overview for a management system', () => {
    api.overview(ORG, 'iso27001').subscribe();
    const req = http.expectOne((r) => r.url === url('/overview'));
    expect(req.request.params.get('management_system')).toBe('iso27001');
    req.flush({});
  });

  it('creates, updates and deletes objectives without the generic toast', () => {
    api.create(ORG, { title: 'Fewer complaints' }).subscribe();
    const create = http.expectOne(url(''));
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ title: 'Fewer complaints' });
    expect(create.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    create.flush({});

    api.update(ORG, 'o-1', { status: 'achieved', change_reason: 'Done' }).subscribe();
    const update = http.expectOne(url('/o-1'));
    expect(update.request.method).toBe('PATCH');
    expect(update.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    update.flush({});

    api.delete(ORG, 'o-1').subscribe();
    const del = http.expectOne(url('/o-1'));
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('lists KPIs with status and health filters', () => {
    api
      .listKpis(ORG, {
        status: ['active', 'paused'],
        last_status: ['off_track', 'no_data'],
        objective_id: 'o-1',
        sort: '-last_period_end',
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('/kpis'));
    expect(req.request.params.get('status')).toBe('active,paused');
    expect(req.request.params.get('last_status')).toBe('off_track,no_data');
    expect(req.request.params.get('objective_id')).toBe('o-1');
    expect(req.request.params.get('sort')).toBe('-last_period_end');
    req.flush({ items: [], total: 0 });
  });

  it('calls the KPI, series and measurement endpoints', () => {
    api.getKpi(ORG, 'k-1').subscribe();
    http.expectOne(url('/kpis/k-1')).flush({});

    api.createKpi(ORG, { name: 'Complaint rate', target_value: 5 }).subscribe();
    const create = http.expectOne(url('/kpis'));
    expect(create.request.method).toBe('POST');
    create.flush({});

    api.updateKpi(ORG, 'k-1', { status: 'paused' }).subscribe();
    expect(http.expectOne(url('/kpis/k-1')).request.method).toBe('PATCH');

    api.deleteKpi(ORG, 'k-1').subscribe();
    expect(http.expectOne(url('/kpis/k-1')).request.method).toBe('DELETE');

    api.series(ORG, 'k-1').subscribe();
    const series = http.expectOne((r) => r.url === url('/kpis/k-1/series'));
    expect(series.request.params.get('limit')).toBe('60');
    series.flush({});

    api.listMeasurements(ORG, 'k-1', { limit: 12, offset: 12 }).subscribe();
    const list = http.expectOne((r) => r.url === url('/kpis/k-1/measurements'));
    expect(list.request.params.get('limit')).toBe('12');
    expect(list.request.params.get('offset')).toBe('12');
    list.flush({ items: [], total: 0 });

    api.createMeasurement(ORG, 'k-1', { period_end: '2026-10-31', value: 4.2 }).subscribe();
    const measure = http.expectOne(url('/kpis/k-1/measurements'));
    expect(measure.request.method).toBe('POST');
    expect(measure.request.body).toEqual({ period_end: '2026-10-31', value: 4.2 });
    measure.flush({});

    api.updateMeasurement(ORG, 'k-1', 'm-1', { value: 4 }).subscribe();
    expect(http.expectOne(url('/kpis/k-1/measurements/m-1')).request.method).toBe('PATCH');

    api.deleteMeasurement(ORG, 'k-1', 'm-1').subscribe();
    expect(http.expectOne(url('/kpis/k-1/measurements/m-1')).request.method).toBe('DELETE');
  });
});

describe('objectivesErrorKey', () => {
  const coded = (status: number, code: string) =>
    new HttpErrorResponse({ status, error: { detail: { code, message: 'English' } } });

  it('maps known codes to scoped keys', () => {
    expect(objectivesErrorKey(coded(422, 'invalid_thresholds'))).toBe(
      'objectives.errors.invalid_thresholds',
    );
    expect(objectivesErrorCode(coded(409, 'measurement_exists'))).toBe('measurement_exists');
  });

  it('falls back to forbidden and neutral status messages', () => {
    expect(objectivesErrorKey(new HttpErrorResponse({ status: 403 }))).toBe(
      'objectives.errors.forbidden',
    );
    expect(objectivesErrorKey(coded(422, 'something_new'))).not.toContain('objectives.errors');
    expect(objectivesErrorKey(new Error('x'))).toBe('errors.generic');
  });
});
