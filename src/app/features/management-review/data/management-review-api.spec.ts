import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ManagementReviewApi } from './management-review-api';
import { missingForSubmit, mrErrorCode, mrErrorKey } from './management-review-errors';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path: string) => `${BASE}/v1/orgs/${ORG}/management-review${path}`;

describe('ManagementReviewApi', () => {
  let api: ManagementReviewApi;
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
    api = TestBed.inject(ManagementReviewApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists reviews with filters as query params (status as csv)', () => {
    api
      .listReviews(ORG, {
        q: 'annual',
        status: ['planned', 'in_progress'],
        framework: 'iso9001',
        owner: 'u-1',
        sort: 'code',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('/reviews'));
    expect(req.request.method).toBe('GET');
    const p = req.request.params;
    expect(p.get('q')).toBe('annual');
    expect(p.get('status')).toBe('planned,in_progress');
    expect(p.get('framework')).toBe('iso9001');
    expect(p.get('owner')).toBe('u-1');
    expect(p.get('sort')).toBe('code');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    req.flush({ items: [], total: 0 });
  });

  it('omits empty filters', () => {
    api.listReviews(ORG, { q: '', status: [] }).subscribe();
    const req = http.expectOne((r) => r.url === url('/reviews'));
    expect(req.request.params.has('q')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    req.flush({ items: [], total: 0 });
  });

  it('lists meetings with kind, window and include_reviews', () => {
    api
      .listMeetings(ORG, {
        status: ['planned'],
        kind: ['committee', 'safety'],
        from: '2026-11-12T08:00:00',
        include_reviews: false,
        sort: 'scheduled_at',
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('/meetings'));
    const p = req.request.params;
    expect(p.get('status')).toBe('planned');
    expect(p.get('kind')).toBe('committee,safety');
    expect(p.get('from')).toBe('2026-11-12T08:00:00');
    expect(p.get('include_reviews')).toBe('false');
    expect(p.get('sort')).toBe('scheduled_at');
    req.flush({ items: [], total: 0 });
  });

  it('creates a review and skips the generic error toast', () => {
    api.createReview(ORG, { title: 'MR 2026', frameworks: ['iso9001'] }).subscribe();
    const req = http.expectOne(url('/reviews'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'MR 2026', frameworks: ['iso9001'] });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ id: 'r-1' });
  });

  it.each([
    ['start', (a: ManagementReviewApi) => a.start(ORG, 'r-1'), '/reviews/r-1/start', {}],
    ['compile', (a: ManagementReviewApi) => a.compile(ORG, 'r-1'), '/reviews/r-1/compile', {}],
    ['submit', (a: ManagementReviewApi) => a.submit(ORG, 'r-1'), '/reviews/r-1/submit', {}],
    [
      'return',
      (a: ManagementReviewApi) => a.returnReview(ORG, 'r-1', 'fix'),
      '/reviews/r-1/return',
      { reason: 'fix' },
    ],
    [
      'cancel',
      (a: ManagementReviewApi) => a.cancel(ORG, 'r-1', null),
      '/reviews/r-1/cancel',
      { reason: null },
    ],
    [
      'sign',
      (a: ManagementReviewApi) => a.sign(ORG, 'r-1', { signature_name: 'Ada', statement: 'ok' }),
      '/reviews/r-1/sign',
      { signature_name: 'Ada', statement: 'ok' },
    ],
  ] as const)('posts the %s transition', (_name, call, path, body) => {
    call(api).subscribe();
    const req = http.expectOne(url(path));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('manages inputs', () => {
    api.addInput(ORG, 'r-1', { title: 'Board topic' }).subscribe();
    http.expectOne((r) => r.method === 'POST' && r.url === url('/reviews/r-1/inputs')).flush({});
    api.updateInput(ORG, 'r-1', 'i-1', { reviewed: true }).subscribe();
    const patch = http.expectOne(url('/reviews/r-1/inputs/i-1'));
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ reviewed: true });
    patch.flush({});
    api.deleteInput(ORG, 'r-1', 'i-1').subscribe();
    const del = http.expectOne(url('/reviews/r-1/inputs/i-1'));
    expect(del.request.method).toBe('DELETE');
    del.flush({});
  });

  it('replaces the agenda with PUT', () => {
    api.replaceAgenda(ORG, 'm-1', [{ title: 'Opening' }], 'reorder').subscribe();
    const req = http.expectOne(url('/meetings/m-1/agenda'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ items: [{ title: 'Opening' }], change_reason: 'reorder' });
    req.flush({});
  });

  it('manages attendees, decisions and minutes', () => {
    api.addAttendee(ORG, 'm-1', { name: 'Guest', role: 'guest' }).subscribe();
    http
      .expectOne((r) => r.method === 'POST' && r.url === url('/meetings/m-1/attendees'))
      .flush({});
    api.updateAttendee(ORG, 'm-1', 'a-1', { attendance: 'present' }).subscribe();
    http
      .expectOne((r) => r.method === 'PATCH' && r.url === url('/meetings/m-1/attendees/a-1'))
      .flush({});
    api.removeAttendee(ORG, 'm-1', 'a-1').subscribe();
    http
      .expectOne((r) => r.method === 'DELETE' && r.url === url('/meetings/m-1/attendees/a-1'))
      .flush({});
    api.addDecision(ORG, 'm-1', { text: 'Do it', create_action: true }).subscribe();
    const dec = http.expectOne(
      (r) => r.method === 'POST' && r.url === url('/meetings/m-1/decisions'),
    );
    expect(dec.request.body).toEqual({ text: 'Do it', create_action: true });
    dec.flush({});
    api.deleteDecision(ORG, 'm-1', 'd-1').subscribe();
    http
      .expectOne((r) => r.method === 'DELETE' && r.url === url('/meetings/m-1/decisions/d-1'))
      .flush({});
    api.approveMinutes(ORG, 'm-1').subscribe();
    http
      .expectOne((r) => r.method === 'POST' && r.url === url('/meetings/m-1/minutes/approve'))
      .flush({});
    api.reopenMinutes(ORG, 'm-1', 'typo').subscribe();
    const reopen = http.expectOne(url('/meetings/m-1/minutes/reopen'));
    expect(reopen.request.body).toEqual({ reason: 'typo' });
    reopen.flush({});
  });

  it('reads the report and the input catalogue', () => {
    api.report(ORG, 'r-1').subscribe();
    http.expectOne(url('/reviews/r-1/report')).flush({ frozen: false, sha256: null, report: {} });
    api.inputCategories(ORG).subscribe();
    http.expectOne(url('/input-categories')).flush([]);
  });
});

describe('management review errors', () => {
  const coded = (status: number, detail: unknown) =>
    new HttpErrorResponse({ status, error: { detail } });

  it('maps known codes to scoped keys', () => {
    expect(mrErrorKey(coded(409, { code: 'review_locked' }))).toBe(
      'managementReview.errors.review_locked',
    );
    expect(mrErrorCode(coded(409, { code: 'nope' }))).toBeNull();
  });

  it('uses the forbidden key for a 403 and the neutral key otherwise', () => {
    expect(mrErrorKey(coded(403, 'Insufficient permissions'))).toBe(
      'managementReview.errors.forbidden',
    );
    expect(mrErrorKey(new Error('x'))).toBe('errors.generic');
  });

  it('reads the missing list of review_incomplete', () => {
    const error = coded(409, {
      code: 'review_incomplete',
      missing: ['conclusions', 'meeting_completed', 3],
    });
    expect(missingForSubmit(error)).toEqual(['conclusions', 'meeting_completed']);
    expect(missingForSubmit(new Error('x'))).toEqual([]);
  });
});
