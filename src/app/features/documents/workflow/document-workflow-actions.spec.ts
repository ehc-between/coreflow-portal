import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import { DocumentDetail, DocumentStatus } from '../../../core/documents/document.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { DocumentWorkflowActions } from './document-workflow-actions';

const BASE = 'http://test/api';
const ORG = 'org-1';
const DOC_URL = `${BASE}/v1/orgs/${ORG}/documents/doc-1`;

function doc(status: DocumentStatus): DocumentDetail {
  return {
    id: 'doc-1',
    type: 'procedure',
    title: 'Quality manual',
    doc_code: 'QM-1',
    status,
    owner_user_id: 'u-1',
    current_revision: null,
    draft_revision: {
      id: 'r-a',
      rev: 'A',
      status,
      author_user_id: 'u-1',
      created_at: '2026-10-01T00:00:00Z',
    },
    revisions: [],
  };
}

async function setup(status: DocumentStatus, permissions: string[], me = 'u-2') {
  const notifications = { success: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [DocumentWorkflowActions, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: NotificationService, useValue: notifications },
      { provide: AuthService, useValue: { user: signal({ id: me }).asReadonly() } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DocumentWorkflowActions);
  fixture.componentRef.setInput('document', doc(status));
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);
  const changed: DocumentDetail[] = [];
  let reloads = 0;
  fixture.componentInstance.changed.subscribe((d) => changed.push(d));
  fixture.componentInstance.reloadRequested.subscribe(() => reloads++);
  return { fixture, root, http, notifications, changed, reloads: () => reloads };
}

/** The translation key a label renders as under the empty testing loader (`en.<key>`). */
const keyOf = (el: Element) => (el.textContent ?? '').trim().replace(/^en\./, '');

/** Visible action labels. */
const labels = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('app-button'))
    .filter((el) => !el.closest('[role="alertdialog"]'))
    .map(keyOf);

/** Click the button inside the element whose label is `label`. */
function click(root: HTMLElement, label: string): void {
  const host = Array.from(root.querySelectorAll('app-button')).find((el) => keyOf(el) === label);
  host!.querySelector('button')!.click();
}

function dialog(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>('[role="alertdialog"]')!;
}

function confirmIn(root: HTMLElement): HTMLButtonElement {
  const buttons = Array.from(dialog(root).querySelectorAll<HTMLButtonElement>('button'));
  return buttons[buttons.length - 1];
}

describe('DocumentWorkflowActions', () => {
  afterEach(() => document.body.replaceChildren());

  it('offers Submit to drafters on a draft, and nothing to plain readers', async () => {
    const drafter = await setup('draft', ['documents:read', 'documents:draft']);
    expect(labels(drafter.root)).toEqual(['documents.workflow.submit']);
    document.body.replaceChildren();
    TestBed.resetTestingModule();

    const reader = await setup('approved', ['documents:read']);
    expect(labels(reader.root)).toEqual([]);
  });

  it('offers Request changes and Approve to approvers while in review', async () => {
    const { root } = await setup('in_review', ['documents:approve']);
    expect(labels(root)).toEqual(['documents.requestChanges', 'documents.approve']);
  });

  it('explains instead of offering Approve when the approver wrote the revision', async () => {
    const { root } = await setup('in_review', ['documents:approve'], 'u-1');
    expect(labels(root)).toEqual(['documents.requestChanges']);
    expect(root.querySelector('[data-testid="self-approval-note"]')).not.toBeNull();
  });

  it('submits for approval to the chosen approver', async () => {
    const { fixture, root, http, changed, notifications } = await setup('draft', [
      'documents:draft',
    ]);
    click(root, 'documents.workflow.submit');
    await fixture.whenStable();
    http.expectOne(`${DOC_URL}/approvers`).flush({
      segregation_required: true,
      author_user_id: 'u-1',
      approvers: [{ user_id: 'u-9', name: 'Lars Olsen', email: 'lars@example.no' }],
    });
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="segregation-note"]')).not.toBeNull();
    const select = root.querySelector<HTMLSelectElement>('[data-testid="approver-select"]')!;
    select.value = 'u-9';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    confirmIn(root).click();

    const req = http.expectOne(`${DOC_URL}/submit`);
    expect(req.request.body).toEqual({ approver_user_id: 'u-9' });
    req.flush(doc('in_review'));
    await fixture.whenStable();
    expect(changed.map((d) => d.status)).toEqual(['in_review']);
    expect(notifications.success).toHaveBeenCalledWith('documents.workflow.submittedToast');
    http.verify();
  });

  it('requires a comment before requesting changes', async () => {
    const { fixture, root, http } = await setup('in_review', ['documents:approve']);
    click(root, 'documents.requestChanges');
    await fixture.whenStable();

    expect(confirmIn(root).disabled).toBe(true);
    const textarea = dialog(root).querySelector('textarea')!;
    textarea.value = '  Section 4 is out of date  ';
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(confirmIn(root).disabled).toBe(false);
    confirmIn(root).click();

    const req = http.expectOne(`${DOC_URL}/request-changes`);
    expect(req.request.body).toEqual({ comment: 'Section 4 is out of date' });
    req.flush(doc('draft'));
    http.verify();
  });

  it('explains a self-approval conflict without reloading', async () => {
    const { fixture, root, http, notifications, reloads } = await setup('in_review', [
      'documents:approve',
    ]);
    click(root, 'documents.approve');
    await fixture.whenStable();
    expect(confirmIn(root).disabled).toBe(true);
    const note = dialog(root).querySelector('textarea')!;
    note.value = 'Checked against the routine';
    note.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    confirmIn(root).click();

    const approve = http.expectOne(`${DOC_URL}/approve`);
    expect(approve.request.body).toEqual({
      note: 'Checked against the routine',
      review_interval_months: 12,
    });
    approve.flush(
      { detail: { code: 'self_approval', message: 'x' } },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();
    expect(notifications.error).toHaveBeenCalledWith('documents.workflow.errors.selfApproval');
    expect(reloads()).toBe(0);
    expect(root.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('asks who must read and confirm and when it is reviewed again (U27)', async () => {
    const { fixture, root, http, notifications } = await setup('in_review', ['documents:approve']);
    click(root, 'documents.approve');
    await fixture.whenStable();
    const note = dialog(root).querySelector('textarea')!;
    note.value = 'Ok';
    note.dispatchEvent(new Event('input'));
    const readers = dialog(root).querySelector<HTMLSelectElement>(
      '[data-testid="approve-readers"]',
    )!;
    readers.value = 'all';
    readers.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const readBy = dialog(root).querySelector<HTMLInputElement>('[data-testid="approve-read-by"]')!;
    readBy.value = '2026-12-31';
    readBy.dispatchEvent(new Event('change'));
    const review = dialog(root).querySelector<HTMLSelectElement>('[data-testid="approve-review"]')!;
    review.value = '24';
    review.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    confirmIn(root).click();

    const req = http.expectOne(`${DOC_URL}/approve`);
    expect(req.request.body).toEqual({
      note: 'Ok',
      readers: [{ type: 'all' }],
      read_by: '2026-12-31',
      review_interval_months: 24,
    });
    req.flush(doc('approved'));
    await fixture.whenStable();
    expect(notifications.success).toHaveBeenCalledWith('documents.readConfirm.publish.toast');
  });

  it('asks the host to reload when the document is no longer in review', async () => {
    const { fixture, root, http, notifications, reloads } = await setup('in_review', [
      'documents:approve',
    ]);
    click(root, 'documents.approve');
    await fixture.whenStable();
    const note = dialog(root).querySelector('textarea')!;
    note.value = 'Ok';
    note.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    confirmIn(root).click();

    http
      .expectOne(`${DOC_URL}/approve`)
      .flush({ detail: { code: 'not_in_review' } }, { status: 409, statusText: 'Conflict' });
    expect(notifications.error).toHaveBeenCalledWith('documents.workflow.errors.notInReview');
    expect(reloads()).toBe(1);
  });

  it('obsoletes with the reason given', async () => {
    const { fixture, root, http, changed } = await setup('approved', ['documents:approve']);
    // Retiring lives in the page's "Mer" menu, which opens the dialog.
    expect(labels(root)).toEqual([]);
    expect(fixture.componentInstance.canObsolete()).toBe(true);
    fixture.componentInstance.open('obsolete');
    await fixture.whenStable();
    const textarea = dialog(root).querySelector('textarea')!;
    textarea.value = 'Replaced by QM-2';
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    confirmIn(root).click();

    const req = http.expectOne(`${DOC_URL}/obsolete`);
    expect(req.request.body).toEqual({ reason: 'Replaced by QM-2' });
    req.flush(doc('obsolete'));
    expect(changed.map((d) => d.status)).toEqual(['obsolete']);
  });
});
