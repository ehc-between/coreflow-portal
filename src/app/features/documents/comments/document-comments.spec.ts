import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import { Comment } from '../../../core/documents/document.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { DocumentComments } from './document-comments';

const BASE = 'http://test/api';
const ORG = 'org-1';
const DOC = 'doc-1';
const REV = 'rev-1';
const HTML = '<p>The quick brown fox jumps over the lazy dog.</p>';

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c-1',
    document_id: DOC,
    revision_id: REV,
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

function setup(canEdit = true) {
  const selectedOrg = {
    currentOrgId: signal(ORG).asReadonly(),
    currentOrg: signal({
      id: ORG,
      name: 'Org',
      roles: [],
      permissions: ['documents:draft'],
    }).asReadonly(),
  };
  const notifications = { success: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn() };

  TestBed.configureTestingModule({
    imports: [DocumentComments, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: SelectedOrgService, useValue: selectedOrg },
      { provide: NotificationService, useValue: notifications },
      { provide: AuthService, useValue: { user: signal({ id: 'u-1' }).asReadonly() } },
    ],
  });

  const docEl = document.createElement('div');
  docEl.className = 'cf-doc';
  docEl.innerHTML = HTML;
  document.body.appendChild(docEl);

  const fixture = TestBed.createComponent(DocumentComments);
  const ref = fixture.componentRef as ComponentRef<DocumentComments>;
  ref.setInput('documentId', DOC);
  ref.setInput('revisionId', REV);
  ref.setInput('revisionHtml', HTML);
  ref.setInput('canEdit', canEdit);
  ref.setInput('docElement', docEl);

  const http = TestBed.inject(HttpTestingController);
  return { fixture, ref, http, docEl, notifications };
}

describe('DocumentComments', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('loads the revision comments and highlights open anchors in the doc', async () => {
    const { fixture, http, docEl } = setup();
    fixture.detectChanges();

    http
      .expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments?revision_id=${REV}`)
      .flush([comment()]);
    fixture.detectChanges();
    await Promise.resolve();

    const mark = docEl.querySelector<HTMLElement>('.cf-comment-mark');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('brown fox');
    expect(mark!.dataset['commentId']).toBe('c-1');

    // An editor with an open, suggestion-less comment auto-requests a suggestion.
    http.expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments/c-1/suggest`).flush(comment());
    http.verify();
  });

  it('does not highlight resolved comments', async () => {
    const { fixture, http, docEl } = setup();
    fixture.detectChanges();
    http.expectOne(() => true).flush([comment({ status: 'resolved' })]);
    fixture.detectChanges();
    await Promise.resolve();

    expect(docEl.querySelector('.cf-comment-mark')).toBeNull();
    http.verify();
  });

  it('stages an approved comment as accepted without creating a revision', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    http
      .expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments?revision_id=${REV}`)
      .flush([comment({ suggestion_html: '<strong>red fox</strong>' })]);
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { approve: (c: Comment) => void }).approve(
      comment({ suggestion_html: '<strong>red fox</strong>' }),
    );

    const acceptReq = http.expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments/c-1/accept`);
    expect(acceptReq.request.method).toBe('POST');
    acceptReq.flush(comment({ status: 'accepted', suggestion_html: '<strong>red fox</strong>' }));

    // Staging never touches the revisions endpoint.
    http.expectNone(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/revisions`);
    http.verify();
  });

  it('reopens an accepted comment back to open', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    http
      .expectOne(() => true)
      .flush([comment({ status: 'accepted', suggestion_html: '<em>x</em>' })]);
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { reopen: (c: Comment) => void }).reopen(
      comment({ status: 'accepted', suggestion_html: '<em>x</em>' }),
    );

    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments/c-1/reopen`);
    expect(req.request.method).toBe('POST');
    req.flush(comment({ status: 'open', suggestion_html: '<em>x</em>' }));
    http.verify();
  });

  it('commits all accepted comments into ONE new revision and resolves them', async () => {
    const twoSpan = '<p>The quick brown fox jumps over the lazy dog.</p>';
    const { fixture, ref, http, notifications } = setup();
    ref.setInput('revisionHtml', twoSpan);
    fixture.detectChanges();

    // Two accepted comments anchored at different offsets in the same body.
    const c1 = comment({
      id: 'c-1',
      status: 'accepted',
      anchor_quote: 'brown fox',
      anchor_prefix: 'The quick ',
      anchor_start: 10,
      anchor_end: 19,
      suggestion_html: '<strong>red fox</strong>',
    });
    const c2 = comment({
      id: 'c-2',
      status: 'accepted',
      anchor_quote: 'lazy dog',
      anchor_prefix: 'over the ',
      anchor_start: 35,
      anchor_end: 43,
      suggestion_html: '<strong>sleepy cat</strong>',
    });
    http.expectOne(() => true).flush([c1, c2]);
    fixture.detectChanges();

    const applied: string[] = [];
    fixture.componentInstance.revisionApplied.subscribe(() => applied.push('emitted'));

    (fixture.componentInstance as unknown as { saveRevision: () => void }).saveRevision();

    const revReq = http.expectOne(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/revisions`);
    expect(revReq.request.method).toBe('POST');
    const html = revReq.request.body.content_html as string;
    expect(html).toContain('red fox');
    expect(html).toContain('sleepy cat');
    expect(html).not.toContain('brown fox');
    expect(html).not.toContain('lazy dog');
    revReq.flush({ id: 'rev-2', rev: 2, status: 'draft', author_user_id: 'u-1', created_at: 'x' });

    for (const id of ['c-1', 'c-2']) {
      const resolveReq = http.expectOne(
        `${BASE}/v1/orgs/${ORG}/documents/${DOC}/comments/${id}/resolve`,
      );
      expect(resolveReq.request.body).toEqual({ applied_revision_id: 'rev-2' });
      resolveReq.flush(comment({ id, status: 'resolved' }));
    }

    expect(notifications.success).toHaveBeenCalledWith('documents.comments.savedToast', {
      count: 2,
      rev: 2,
    });
    expect(applied).toEqual(['emitted']);
    http.verify();
  });

  it('warns and creates no revision when no accepted anchor can be found', () => {
    const { fixture, ref, http, notifications } = setup();
    ref.setInput('revisionHtml', '<p>Entirely different content.</p>');
    fixture.detectChanges();
    http
      .expectOne(() => true)
      .flush([comment({ status: 'accepted', suggestion_html: '<em>x</em>' })]);
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { saveRevision: () => void }).saveRevision();

    expect(notifications.warning).toHaveBeenCalledWith('documents.comments.anchorNotFoundToast');
    http.expectNone(`${BASE}/v1/orgs/${ORG}/documents/${DOC}/revisions`);
    http.verify();
  });
});
