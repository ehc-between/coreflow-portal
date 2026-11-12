import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { emptyProfile, toProfileUpdate } from './module.models';
import { ModulesApi, moduleErrorDetail } from './modules-api';

const BASE = 'http://test/api';
const ORG = 'org-1';

describe('ModulesApi', () => {
  let api: ModulesApi;
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
    api = TestBed.inject(ModulesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists modules quietly', () => {
    api.list(ORG).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/modules`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush([]);
  });

  it('switches a module with {enabled}', () => {
    api.setEnabled(ORG, 'risk', false).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/modules/risk`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ enabled: false });
    req.flush({});
  });

  it('reads and replaces the profile', () => {
    api.getProfile(ORG).subscribe();
    http.expectOne(`${BASE}/v1/orgs/${ORG}/profile`).flush(emptyProfile(ORG));

    const update = toProfileUpdate({ ...emptyProfile(ORG), frameworks: ['iso9001'] });
    api.updateProfile(ORG, update).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/profile`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(update);
    expect(Object.keys(req.request.body as object)).not.toContain('setup_step');
    req.flush(emptyProfile(ORG));
  });

  it('wraps terminology overrides in {terms}', () => {
    api.updateTerminology(ORG, { deviation: { en: { one: 'nc', other: 'ncs' } } }).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/terminology`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ terms: { deviation: { en: { one: 'nc', other: 'ncs' } } } });
    req.flush({ terms: {}, term_keys: [] });
  });

  it('calls the setup endpoints', () => {
    api.setup(ORG).subscribe();
    http.expectOne(`${BASE}/v1/orgs/${ORG}/setup`).flush({ completed_at: null, step: null });

    api.setSetupStep(ORG, 'modules').subscribe();
    const step = http.expectOne(`${BASE}/v1/orgs/${ORG}/setup/step`);
    expect(step.request.method).toBe('PUT');
    expect(step.request.body).toEqual({ step: 'modules' });
    step.flush({ completed_at: null, step: 'modules' });

    api.recommendations(ORG, { frameworks: ['gdpr'] }).subscribe();
    const rec = http.expectOne(`${BASE}/v1/orgs/${ORG}/setup/recommendations`);
    expect(rec.request.method).toBe('POST');
    expect(rec.request.body).toEqual({ frameworks: ['gdpr'] });
    rec.flush({ modules: [] });

    api.completeSetup(ORG, { modules: ['risk'], step: 'done' }).subscribe();
    const done = http.expectOne(`${BASE}/v1/orgs/${ORG}/setup/complete`);
    expect(done.request.method).toBe('POST');
    expect(done.request.body).toEqual({ modules: ['risk'], step: 'done' });
    done.flush({ enabled: ['risk'], completed_at: '2026-11-12T10:00:00' });
  });
});

describe('moduleErrorDetail', () => {
  it('extracts the coded detail', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { detail: { code: 'module_required_by', module: 'risk', modules: ['audits'] } },
    });
    expect(moduleErrorDetail(error)).toEqual({
      code: 'module_required_by',
      module: 'risk',
      modules: ['audits'],
    });
  });

  it('returns null for plain errors', () => {
    expect(moduleErrorDetail(new HttpErrorResponse({ status: 500 }))).toBeNull();
    expect(moduleErrorDetail(new Error('x'))).toBeNull();
    expect(
      moduleErrorDetail(new HttpErrorResponse({ status: 403, error: { detail: 'No access' } })),
    ).toBeNull();
  });
});
