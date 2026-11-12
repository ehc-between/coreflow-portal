import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ContextApi, toParams } from './context-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}/context`;

describe('ContextApi', () => {
  let api: ContextApi;
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
    api = TestBed.inject(ContextApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the overview', () => {
    api.overview(ORG).subscribe();
    const req = http.expectOne(`${ROOT}/overview`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('lists a register with filters as query params', () => {
    api
      .list(ORG, 'party', {
        q: ' supplier ',
        status: ['active'],
        owner: 'me',
        framework: 'iso9001',
        review_due: true,
        sort: 'title',
        limit: 25,
        offset: 50,
        extra: { category: 'supplier', party_type: undefined },
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/interested-parties`);
    const p = req.request.params;
    expect(p.get('q')).toBe('supplier');
    expect(p.get('status')).toBe('active');
    expect(p.get('owner')).toBe('me');
    expect(p.get('framework')).toBe('iso9001');
    expect(p.get('review_due')).toBe('true');
    expect(p.get('sort')).toBe('title');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    expect(p.get('category')).toBe('supplier');
    expect(p.has('party_type')).toBe(false);
    req.flush({ items: [], total: 0, summary: {} });
  });

  it('uses each kind’s path segment for get, create, update and delete (quietly)', () => {
    api.get(ORG, 'analysis', 'a1').subscribe();
    http.expectOne(`${ROOT}/analyses/a1`).flush({});

    api.create(ORG, 'scope', { framework: 'iso9001', title: 'QMS' }).subscribe();
    const create = http.expectOne(`${ROOT}/scopes`);
    expect(create.request.method).toBe('POST');
    expect(create.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    create.flush({});

    api.update(ORG, 'policy', 'p1', { title: 'New', change_reason: 'Annual review' }).subscribe();
    const patch = http.expectOne(`${ROOT}/policies/p1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ title: 'New', change_reason: 'Annual review' });
    patch.flush({});

    api.delete(ORG, 'responsibility', 'r1').subscribe();
    const del = http.expectOne(`${ROOT}/responsibilities/r1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('posts lifecycle steps with an empty body by default', () => {
    api.transition(ORG, 'policy', 'p1', 'submit').subscribe();
    const submit = http.expectOne(`${ROOT}/policies/p1/submit`);
    expect(submit.request.body).toEqual({});
    submit.flush({});

    api.transition(ORG, 'scope', 's1', 'return', { reason: 'Missing site' }).subscribe();
    const ret = http.expectOne(`${ROOT}/scopes/s1/return`);
    expect(ret.request.body).toEqual({ reason: 'Missing site' });
    ret.flush({});
  });

  it('communicates a policy and loads the RACI matrix', () => {
    api
      .communicate(ORG, 'p1', { assignee: { type: 'role', value: 'member' }, due_at: null })
      .subscribe();
    const comm = http.expectOne(`${ROOT}/policies/p1/communicate`);
    expect(comm.request.method).toBe('POST');
    comm.flush({ task_id: 't1', policy_id: 'p1' });

    api.matrix(ORG, { status: ['active'], framework: 'iso27001' }).subscribe();
    const matrix = http.expectOne((r) => r.url === `${ROOT}/responsibilities/matrix`);
    expect(matrix.request.params.get('status')).toBe('active');
    expect(matrix.request.params.get('framework')).toBe('iso27001');
    expect(matrix.request.params.has('q')).toBe(false);
    matrix.flush({ columns: [], rows: [] });
  });
});

describe('toParams', () => {
  it('drops blanks and defaults', () => {
    expect(toParams({ q: '  ', status: [], review_due: false, offset: 0 })).toEqual({
      q: undefined,
      status: undefined,
      owner: undefined,
      framework: undefined,
      review_due: undefined,
      sort: undefined,
      limit: undefined,
      offset: undefined,
    });
  });
});
