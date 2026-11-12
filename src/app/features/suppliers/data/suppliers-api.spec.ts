import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { SuppliersApi } from './suppliers-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path: string) => `${BASE}/v1/orgs/${ORG}/suppliers${path}`;

describe('SuppliersApi', () => {
  let api: SuppliersApi;
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
    api = TestBed.inject(SuppliersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists suppliers with csv filters, flags and paging', () => {
    api
      .list(ORG, {
        q: 'acme',
        status: ['approved', 'conditional'],
        criticality: ['high'],
        category: ['cloud'],
        owner: 'me',
        evaluation_due: 'overdue',
        processes_personal_data: true,
        sort: 'criticality',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url(''));
    const p = req.request.params;
    expect(req.request.method).toBe('GET');
    expect(p.get('q')).toBe('acme');
    expect(p.get('status')).toBe('approved,conditional');
    expect(p.get('criticality')).toBe('high');
    expect(p.get('category')).toBe('cloud');
    expect(p.get('owner')).toBe('me');
    expect(p.get('evaluation_due')).toBe('overdue');
    expect(p.get('processes_personal_data')).toBe('true');
    expect(p.has('provides_ai')).toBe(false);
    expect(p.get('sort')).toBe('criticality');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    req.flush({ items: [], total: 0 });
  });

  it('omits empty filters', () => {
    api.list(ORG, { q: '', status: [] }).subscribe();
    const req = http.expectOne((r) => r.url === url(''));
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ items: [], total: 0 });
  });

  it('reads the summary and a supplier', () => {
    api.summary(ORG).subscribe();
    http.expectOne(url('/summary')).flush({});
    api.get(ORG, 's-1').subscribe();
    http.expectOne(url('/s-1')).flush({});
  });

  it('creates, updates, changes status and deletes without the generic toast', () => {
    api.create(ORG, { name: 'Acme' } as never).subscribe();
    const create = http.expectOne(url(''));
    expect(create.request.method).toBe('POST');
    expect(create.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    create.flush({});

    api.update(ORG, 's-1', { name: 'B', change_reason: 'rename' }).subscribe();
    const patch = http.expectOne(url('/s-1'));
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ name: 'B', change_reason: 'rename' });
    patch.flush({});

    api.setStatus(ORG, 's-1', { status: 'suspended', reason: 'incident' }).subscribe();
    const status = http.expectOne(url('/s-1/status'));
    expect(status.request.method).toBe('POST');
    expect(status.request.body).toEqual({ status: 'suspended', reason: 'incident' });
    status.flush({});

    api.delete(ORG, 's-1').subscribe();
    const del = http.expectOne(url('/s-1'));
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('lists evaluations across suppliers and for one supplier', () => {
    api
      .listEvaluations(ORG, { status: ['draft', 'submitted'], evaluator: 'me', overdue: true })
      .subscribe();
    const all = http.expectOne((r) => r.url === url('/evaluations'));
    expect(all.request.params.get('status')).toBe('draft,submitted');
    expect(all.request.params.get('evaluator')).toBe('me');
    expect(all.request.params.get('overdue')).toBe('true');
    all.flush({ items: [], total: 0 });

    api.listSupplierEvaluations(ORG, 's-1', { kind: 'security', limit: 50 }).subscribe();
    const one = http.expectOne((r) => r.url === url('/s-1/evaluations'));
    expect(one.request.params.get('kind')).toBe('security');
    expect(one.request.params.has('status')).toBe(false);
    one.flush({ items: [], total: 0 });
  });

  it('drives the evaluation lifecycle', () => {
    api.createEvaluation(ORG, 's-1', { kind: 'initial', lang: 'nb' }).subscribe();
    const create = http.expectOne(url('/s-1/evaluations'));
    expect(create.request.body).toEqual({ kind: 'initial', lang: 'nb' });
    create.flush({});

    api.updateEvaluation(ORG, 'e-1', { answers: { q1: { value: 'yes' } } }).subscribe();
    expect(http.expectOne(url('/evaluations/e-1')).request.method).toBe('PATCH');

    api.submitEvaluation(ORG, 'e-1').subscribe();
    expect(http.expectOne(url('/evaluations/e-1/submit')).request.method).toBe('POST');

    api.reopenEvaluation(ORG, 'e-1', '').subscribe();
    expect(http.expectOne(url('/evaluations/e-1/reopen')).request.body).toEqual({ reason: null });

    api.decideEvaluation(ORG, 'e-1', { decision: 'conditional', conditions: 'DPA' }).subscribe();
    expect(http.expectOne(url('/evaluations/e-1/decide')).request.body).toEqual({
      decision: 'conditional',
      conditions: 'DPA',
    });

    api.cancelEvaluation(ORG, 'e-1', 'duplicate').subscribe();
    expect(http.expectOne(url('/evaluations/e-1/cancel')).request.body).toEqual({
      reason: 'duplicate',
    });

    api.deleteEvaluation(ORG, 'e-1').subscribe();
    expect(http.expectOne(url('/evaluations/e-1')).request.method).toBe('DELETE');
  });

  it('manages questionnaire templates in the requested language', () => {
    api.listQuestionnaires(ORG, { kind: 'privacy', lang: 'nb' }).subscribe();
    const list = http.expectOne((r) => r.url === url('/questionnaires'));
    expect(list.request.params.get('kind')).toBe('privacy');
    expect(list.request.params.get('lang')).toBe('nb');
    list.flush({ items: [] });

    api.getQuestionnaire(ORG, 'builtin-ai', 'en').subscribe();
    http.expectOne((r) => r.url === url('/questionnaires/builtin-ai')).flush({});

    api
      .createQuestionnaire(ORG, {
        name: 'Q',
        kind: 'ai',
        questions: [{ text: 'x' }],
        pass_score: 70,
      })
      .subscribe();
    expect(http.expectOne(url('/questionnaires')).request.method).toBe('POST');

    api.updateQuestionnaire(ORG, 'q-1', { name: 'R' }).subscribe();
    expect(http.expectOne(url('/questionnaires/q-1')).request.method).toBe('PATCH');

    api.deleteQuestionnaire(ORG, 'q-1').subscribe();
    expect(http.expectOne(url('/questionnaires/q-1')).request.method).toBe('DELETE');
  });

  it('reads and writes the performance log', () => {
    api.listPerformance(ORG, 's-1', { kind: 'incident', limit: 50 }).subscribe();
    const list = http.expectOne((r) => r.url === url('/s-1/performance'));
    expect(list.request.params.get('kind')).toBe('incident');
    list.flush({ items: [], total: 0, stats: {} });

    api.logPerformance(ORG, 's-1', { kind: 'delivery', title: 'Late' }).subscribe();
    expect(http.expectOne(url('/s-1/performance')).request.method).toBe('POST');

    api.updatePerformance(ORG, 'p-1', { rating: 3 }).subscribe();
    expect(http.expectOne(url('/performance/p-1')).request.method).toBe('PATCH');

    api.deletePerformance(ORG, 'p-1').subscribe();
    expect(http.expectOne(url('/performance/p-1')).request.method).toBe('DELETE');
  });
});
