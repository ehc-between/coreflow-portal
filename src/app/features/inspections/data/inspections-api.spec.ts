import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { inspectionErrorKey, problemIndexesOf, questionIdsOf } from './inspection-errors';
import { InspectionsApi } from './inspections-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path = '') => `${BASE}/v1/orgs/${ORG}/inspections${path}`;

describe('InspectionsApi', () => {
  let api: InspectionsApi;
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
    api = TestBed.inject(InspectionsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists inspections with filters as query params (status as csv)', () => {
    api
      .list(ORG, {
        q: ' walk ',
        status: ['planned', 'in_progress'],
        inspector: 'me',
        overdue: true,
        sort: 'due_at',
        limit: 25,
        offset: 0,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url());
    const p = req.request.params;
    expect(p.get('q')).toBe('walk');
    expect(p.get('status')).toBe('planned,in_progress');
    expect(p.get('inspector')).toBe('me');
    expect(p.get('overdue')).toBe('true');
    expect(p.has('result')).toBe(false);
    req.flush({ items: [], total: 0 });
  });

  it('lists templates, findings and schedules on their own paths', () => {
    api.listTemplates(ORG, { status: ['draft', 'active'], framework: 'iso45001' }).subscribe();
    const t = http.expectOne((r) => r.url === url('/templates'));
    expect(t.request.params.get('status')).toBe('draft,active');
    expect(t.request.params.get('framework')).toBe('iso45001');
    t.flush({ items: [], total: 0 });

    api.listFindings(ORG, { severity: ['high', 'critical'], has_deviation: false }).subscribe();
    const f = http.expectOne((r) => r.url === url('/findings'));
    expect(f.request.params.get('severity')).toBe('high,critical');
    expect(f.request.params.get('has_deviation')).toBe('false');
    f.flush({ items: [], total: 0 });

    api.listSchedules(ORG, { active: true }).subscribe();
    http.expectOne((r) => r.url === url('/schedules')).flush({ items: [], total: 0 });
  });

  it('saves answers with PUT and skips the generic error toast on mutations', () => {
    api.saveResponses(ORG, 'i-1', [{ question_id: 'q1', value: 'yes' }]).subscribe();
    const req = http.expectOne(url('/i-1/responses'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ responses: [{ question_id: 'q1', value: 'yes' }] });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({});
  });

  it('completes, cancels and escalates with the contract bodies', () => {
    api.complete(ORG, 'i-1', { summary: 'ok', signature: { name: 'Ada' } }).subscribe();
    const c = http.expectOne(url('/i-1/complete'));
    expect(c.request.body).toEqual({ summary: 'ok', signature: { name: 'Ada' } });
    c.flush({});

    api.cancel(ORG, 'i-1', '').subscribe();
    expect(http.expectOne(url('/i-1/cancel')).request.body).toEqual({ reason: null });

    api.escalateFinding(ORG, 'f-1').subscribe();
    expect(http.expectOne(url('/findings/f-1/deviation')).request.body).toEqual({
      deviation_type_id: null,
    });

    api.addFindingAction(ORG, 'f-1', { title: 'Fix' }).subscribe();
    expect(http.expectOne(url('/findings/f-1/actions')).request.method).toBe('POST');
  });

  it('imports a library template in the chosen language', () => {
    api.importLibraryTemplate(ORG, 'fire_safety', 'nb').subscribe();
    const req = http.expectOne(url('/library/fire_safety/import'));
    expect(req.request.body).toEqual({ lang: 'nb' });
    req.flush({});
    api.listLibrary(ORG, 'en').subscribe();
    const lib = http.expectOne((r) => r.url === url('/library'));
    expect(lib.request.params.get('lang')).toBe('en');
    lib.flush([]);
  });

  it('publishes and archives with a change reason', () => {
    api.publishTemplate(ORG, 't-1', 'ready').subscribe();
    expect(http.expectOne(url('/templates/t-1/publish')).request.body).toEqual({
      change_reason: 'ready',
    });
    api.archiveTemplate(ORG, 't-1').subscribe();
    expect(http.expectOne(url('/templates/t-1/archive')).request.body).toEqual({
      change_reason: null,
    });
  });
});

describe('inspection errors', () => {
  const coded = (status: number, detail: unknown) =>
    new HttpErrorResponse({ status, error: { detail } });

  it('maps known codes, 403 and other 422s to translation keys', () => {
    expect(inspectionErrorKey(coded(409, { code: 'template_not_active' }))).toBe(
      'inspections.errors.template_not_active',
    );
    expect(inspectionErrorKey(coded(403, 'Insufficient permissions'))).toBe(
      'inspections.errors.forbidden',
    );
    expect(inspectionErrorKey(coded(422, { code: 'weird' }))).toBe('inspections.errors.invalid');
    expect(inspectionErrorKey(new Error('x'))).toBe('inspections.errors.generic');
  });

  it('reads question ids and problem indexes from coded details', () => {
    expect(
      questionIdsOf(coded(422, { code: 'answers_missing', question_ids: ['q1', 'q3'] })),
    ).toEqual(['q1', 'q3']);
    expect(
      questionIdsOf(coded(422, { code: 'invalid_answers', problems: [{ question_id: 'q2' }] })),
    ).toEqual(['q2']);
    expect(
      problemIndexesOf(
        coded(422, { code: 'invalid_questions', problems: [{ index: 1 }, { index: null }] }),
      ),
    ).toEqual([1]);
  });
});
