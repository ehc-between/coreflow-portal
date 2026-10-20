import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { DocumentsApi, toDocumentPage } from './documents-api';
import { DocumentSummary } from './document.models';

const BASE = 'http://test/api';
const ORG = 'org-1';
const DOC = 'doc-1';
const URL = `${BASE}/v1/orgs/${ORG}/documents`;

const summary = (id: string): DocumentSummary => ({
  id,
  type: 'procedure',
  title: id,
  doc_code: id,
  status: 'approved',
  owner_user_id: 'u-1',
  current_rev: 'A',
  updated_at: '2026-10-01T00:00:00Z',
});

describe('DocumentsApi document control', () => {
  let api: DocumentsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([])),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    api = TestBed.inject(DocumentsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the workflow transitions with their bodies, toast-free', () => {
    api.submit(ORG, DOC).subscribe();
    api.requestChanges(ORG, DOC, 'Fix section 2').subscribe();
    api.approve(ORG, DOC).subscribe();
    api.obsolete(ORG, DOC, 'Superseded by QM-2').subscribe();
    api.acknowledge(ORG, DOC).subscribe();

    const expectations: [string, unknown][] = [
      ['submit', null],
      ['request-changes', { comment: 'Fix section 2' }],
      ['approve', null],
      ['obsolete', { reason: 'Superseded by QM-2' }],
      ['acknowledge', null],
    ];
    for (const [action, body] of expectations) {
      const req = http.expectOne(`${URL}/${DOC}/${action}`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
      req.flush({});
    }
  });

  it('deletes a document, sending a trimmed reason only when given', () => {
    api.delete(ORG, DOC, '  Duplicate of QM-2  ').subscribe();
    const withReason = http.expectOne(`${URL}/${DOC}`);
    expect(withReason.request.method).toBe('DELETE');
    expect(withReason.request.body).toEqual({ reason: 'Duplicate of QM-2' });
    expect(withReason.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    withReason.flush(null, { status: 204, statusText: 'No Content' });

    api.delete(ORG, DOC).subscribe();
    const withoutReason = http.expectOne(`${URL}/${DOC}`);
    expect(withoutReason.request.method).toBe('DELETE');
    expect(withoutReason.request.body).toBeNull();
    withoutReason.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('sends a trimmed change reason with a new revision, and omits a blank one', () => {
    api.addRevision(ORG, DOC, '<p>x</p>', '  Updated scope  ').subscribe();
    const withReason = http.expectOne(`${URL}/${DOC}/revisions`);
    expect(withReason.request.body).toEqual({
      content_html: '<p>x</p>',
      change_reason: 'Updated scope',
    });
    withReason.flush({});

    api.addRevision(ORG, DOC, '<p>y</p>', '   ').subscribe();
    const withoutReason = http.expectOne(`${URL}/${DOC}/revisions`);
    expect(withoutReason.request.body).toEqual({ content_html: '<p>y</p>' });
    withoutReason.flush({});
  });

  it('PATCHes the review / acknowledgement settings', () => {
    api
      .updateControl(ORG, DOC, {
        review_interval_months: 12,
        next_review_at: '2027-01-31',
        acknowledgement_required: true,
      })
      .subscribe();
    const req = http.expectOne(`${URL}/${DOC}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      review_interval_months: 12,
      next_review_at: '2027-01-31',
      acknowledgement_required: true,
    });
    req.flush({});
  });

  it('normalises the acknowledgement report', () => {
    let result: unknown;
    api.listAcknowledgements(ORG, DOC).subscribe((r) => (result = r));
    http.expectOne(`${URL}/${DOC}/acknowledgements`).flush({
      acknowledged: [{ user_id: 'u-1', name: 'Ada', acknowledged_at: '2026-10-02T00:00:00Z' }],
      not_acknowledged: [
        { user_id: 'u-2', full_name: 'Grace' },
        { user_id: 'u-3', email: 'x@y' },
      ],
    });
    expect(result).toEqual({
      revision: null,
      acknowledged: [
        { user_id: 'u-1', name: 'Ada', email: null, acknowledged_at: '2026-10-02T00:00:00Z' },
      ],
      pending: [
        { user_id: 'u-2', name: 'Grace', email: null, acknowledged_at: null },
        { user_id: 'u-3', name: 'x@y', email: 'x@y', acknowledged_at: null },
      ],
    });
  });

  it('pages the full list client-side, sending no paging params', () => {
    let page: unknown;
    api.listPage(ORG, { status: 'approved', limit: 2, offset: 2 }).subscribe((p) => (page = p));
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get('status')).toBe('approved');
    expect(req.request.params.has('limit')).toBe(false);
    expect(req.request.params.has('offset')).toBe(false);
    expect(req.request.params.has('review_due')).toBe(false);
    req.flush([summary('a'), summary('b'), summary('c')]);
    expect(page).toEqual({ items: [summary('c')], total: 3 });
  });
});

describe('toDocumentPage', () => {
  const all = [
    summary('a'),
    { ...summary('b'), review_overdue: true },
    { ...summary('c'), review_overdue: true },
    { ...summary('d'), review_overdue: true },
  ];

  it('slices to the requested page with the full total', () => {
    expect(toDocumentPage(all, { limit: 2, offset: 2 })).toEqual({
      items: [all[2], all[3]],
      total: 4,
    });
  });

  it('filters to review-due documents before paging', () => {
    expect(toDocumentPage(all, { review_due: true, limit: 2, offset: 0 })).toEqual({
      items: [all[1], all[2]],
      total: 3,
    });
  });

  it('returns everything without a query', () => {
    expect(toDocumentPage(all)).toEqual({ items: all, total: 4 });
  });
});
