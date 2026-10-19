import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { CreateDeviationRequest } from './deviation.models';
import { DeviationsApi } from './deviations-api';

const BASE = 'http://test/api';
const ORG = 'org-1';

describe('DeviationsApi', () => {
  let api: DeviationsApi;
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
    api = TestBed.inject(DeviationsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists deviation types for the org', () => {
    api.listTypes(ORG).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/deviation-types`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('lists deviations with all filters serialised as query params', () => {
    api
      .listDeviations(ORG, {
        status: 'open',
        type_id: 't-1',
        standard: 'iso9001',
        severity: 'high',
        tag: 'safety',
        owner_user_id: 'u-1',
        department_id: 'd-1',
        source: 'audit',
        due_before: '2026-07-01',
        due_after: '2026-06-01',
        q: 'spill',
        sort: '-raised_at',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/v1/orgs/${ORG}/deviations`);
    expect(req.request.method).toBe('GET');
    const params = req.request.params;
    expect(params.get('status')).toBe('open');
    expect(params.get('type_id')).toBe('t-1');
    expect(params.get('standard')).toBe('iso9001');
    expect(params.get('severity')).toBe('high');
    expect(params.get('tag')).toBe('safety');
    expect(params.get('owner_user_id')).toBe('u-1');
    expect(params.get('department_id')).toBe('d-1');
    expect(params.get('source')).toBe('audit');
    expect(params.get('due_before')).toBe('2026-07-01');
    expect(params.get('due_after')).toBe('2026-06-01');
    expect(params.get('q')).toBe('spill');
    expect(params.get('sort')).toBe('-raised_at');
    expect(params.get('limit')).toBe('25');
    expect(params.get('offset')).toBe('50');
    req.flush({ items: [], total: 0 });
  });

  it('omits unset filters from the query', () => {
    api.listDeviations(ORG, { status: 'open' }).subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/v1/orgs/${ORG}/deviations`);
    expect(req.request.params.has('type_id')).toBe(false);
    expect(req.request.params.has('q')).toBe(false);
    req.flush({ items: [], total: 0 });
  });

  it('posts a create-deviation body', () => {
    const body: CreateDeviationRequest = {
      type_id: 't-1',
      title: 'Calibration overdue',
      severity: 'medium',
      source: 'internal',
      data: { instrument: 'scale-7' },
    };
    api.createDeviation(ORG, body).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/deviations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('patches a deviation', () => {
    api.updateDeviation(ORG, 'dev-1', { status: 'closed' }).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/deviations/dev-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'closed' });
    req.flush({});
  });

  it('adds an action under a deviation', () => {
    api.addAction(ORG, 'dev-1', { kind: 'corrective', description: 'Recalibrate' }).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/deviations/dev-1/actions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ kind: 'corrective', description: 'Recalibrate' });
    req.flush({});
  });

  it('patches an action to verified with effectiveness', () => {
    api
      .updateAction(ORG, 'dev-1', 'act-1', { status: 'verified', effectiveness: 'effective' })
      .subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/deviations/dev-1/actions/act-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'verified', effectiveness: 'effective' });
    req.flush({});
  });

  it('fetches deviation stats', () => {
    api.getStats(ORG, { standard: 'iso9001' }).subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/v1/orgs/${ORG}/deviations/stats`);
    expect(req.request.params.get('standard')).toBe('iso9001');
    req.flush({});
  });

  it('posts an AI type-draft request to the non-org-prefixed endpoint', () => {
    api.draftType(ORG, 'GDPR breach for ISO 27001', ['gdpr', 'iso27001']).subscribe();
    const req = http.expectOne(`${BASE}/v1/ai/deviation-type-draft`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      org_id: ORG,
      description: 'GDPR breach for ISO 27001',
      standards: ['gdpr', 'iso27001'],
    });
    req.flush({
      name: 'GDPR breach',
      key: 'gdpr_breach',
      code_prefix: 'PB',
      description: null,
      standards: ['gdpr'],
      schema: [],
    });
  });

  it('lists access subjects for the pickers', () => {
    api.listAccessSubjects(ORG).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/access-subjects`);
    expect(req.request.method).toBe('GET');
    req.flush({ users: [], departments: [] });
  });
});
