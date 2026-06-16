import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { Comment } from './document.models';
import { DocumentsApi } from './documents-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const DOC = 'doc-1';

function commentFixture(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c-1',
    document_id: DOC,
    revision_id: 'rev-1',
    author_user_id: 'u-1',
    author_name: 'Ada',
    anchor_quote: 'brown fox',
    anchor_prefix: 'The quick ',
    anchor_start: 10,
    anchor_end: 19,
    body: 'Please clarify.',
    status: 'open',
    suggestion_html: null,
    suggestion_rationale: null,
    created_at: '2026-06-16T00:00:00Z',
    ...overrides,
  };
}

describe('DocumentsApi comments', () => {
  let api: DocumentsApi;
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
    api = TestBed.inject(DocumentsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists comments with revision and status filters', () => {
    api.listComments(ORG, DOC, { revisionId: 'rev-1', status: 'open' }).subscribe();
    const req = http.expectOne(
      `${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments?revision_id=rev-1&status=open`,
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('omits empty filters', () => {
    api.listComments(ORG, DOC).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments`);
    expect(req.request.params.keys()).toHaveLength(0);
    req.flush([]);
  });

  it('creates a comment with the anchor payload', () => {
    const body = {
      revision_id: 'rev-1',
      anchor_quote: 'brown fox',
      anchor_prefix: 'The quick ',
      anchor_start: 10,
      anchor_end: 19,
      body: 'Please clarify.',
    };
    api.createComment(ORG, DOC, body).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(commentFixture());
  });

  it('requests an AI suggestion', () => {
    api.suggestComment(ORG, DOC, 'c-1').subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments/c-1/suggest`);
    expect(req.request.method).toBe('POST');
    req.flush(commentFixture({ suggestion_html: '<p>fix</p>' }));
  });

  it('updates a suggestion via PATCH', () => {
    api.updateComment(ORG, DOC, 'c-1', { suggestion_html: '<p>edited</p>' }).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments/c-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ suggestion_html: '<p>edited</p>' });
    req.flush(commentFixture());
  });

  it('resolves a comment with the applied revision id', () => {
    api.resolveComment(ORG, DOC, 'c-1', 'rev-2').subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments/c-1/resolve`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ applied_revision_id: 'rev-2' });
    req.flush(commentFixture({ status: 'resolved' }));
  });

  it('rejects a comment', () => {
    api.rejectComment(ORG, DOC, 'c-1').subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments/c-1/reject`);
    expect(req.request.method).toBe('POST');
    req.flush(commentFixture({ status: 'rejected' }));
  });

  it('deletes a comment', () => {
    api.deleteComment(ORG, DOC, 'c-1').subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments/c-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
