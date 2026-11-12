import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { StandardsApi } from './standards-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;

/** The framework endpoints (cross-mapping, readiness, suggestions). */
describe('StandardsApi frameworks', () => {
  let api: StandardsApi;
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
    api = TestBed.inject(StandardsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the frameworks without an error toast (the page falls back)', () => {
    api.listFrameworks(ORG).subscribe();
    const req = http.expectOne(`${ROOT}/frameworks`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush([]);
  });

  it('gets the readiness breakdown', () => {
    api.readiness(ORG).subscribe();
    const req = http.expectOne(`${ROOT}/frameworks/readiness`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('gets the mappings of a clause, encoding key and number', () => {
    api.clauseMappings(ORG, 'iso27001-2022', 'A.5.34').subscribe();
    const req = http.expectOne(`${ROOT}/standards/iso27001-2022/clauses/A.5.34/mappings`);
    expect(req.request.method).toBe('GET');
    req.flush([]);

    api.clauseMappings(ORG, 'eu-ai-act-2024', 'Annex III').subscribe();
    http.expectOne(`${ROOT}/standards/eu-ai-act-2024/clauses/Annex%20III/mappings`).flush([]);
  });

  it('asks which modules support a clause ref', () => {
    api.clauseSupport(ORG, 'hs:6.1').subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/clause-support`);
    expect(req.request.params.get('ref')).toBe('hs:6.1');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ ref: 'hs:6.1', modules: [] });
  });

  it('gets evidence suggestions for a record', () => {
    api.evidenceSuggestions(ORG, 'deviation', 'dev-1').subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/evidence-suggestions`);
    expect(req.request.params.get('entity_type')).toBe('deviation');
    expect(req.request.params.get('entity_id')).toBe('dev-1');
    req.flush({ requirements: [] });
  });
});
