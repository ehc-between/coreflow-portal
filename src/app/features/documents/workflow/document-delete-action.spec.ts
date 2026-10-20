import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { DocumentDetail, DocumentStatus } from '../../../core/documents/document.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { DocumentDeleteAction } from './document-delete-action';

const BASE = 'http://test/api';
const ORG = 'org-1';
const DOC_URL = `${BASE}/v1/orgs/${ORG}/documents/doc-1`;

const rev = (status: DocumentStatus) => ({
  id: 'r-a',
  rev: 'A',
  status,
  author_user_id: 'u-1',
  created_at: '2026-10-01T00:00:00Z',
});

function doc(status: DocumentStatus, extra: Partial<DocumentDetail> = {}): DocumentDetail {
  return {
    id: 'doc-1',
    type: 'procedure',
    title: 'Quality manual',
    doc_code: 'QM-1',
    status,
    owner_user_id: 'u-1',
    current_revision: null,
    draft_revision: rev(status),
    revisions: [],
    ...extra,
  };
}

async function setup(document_: DocumentDetail, canManage = true) {
  const notifications = { success: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [DocumentDeleteAction, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: NotificationService, useValue: notifications },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions: [] }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DocumentDeleteAction);
  fixture.componentRef.setInput('document', document_);
  fixture.componentRef.setInput('canManage', canManage);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);
  let deleted = 0;
  let reloads = 0;
  fixture.componentInstance.deleted.subscribe(() => deleted++);
  fixture.componentInstance.reloadRequested.subscribe(() => reloads++);
  return {
    fixture,
    root,
    http,
    notifications,
    deleted: () => deleted,
    reloads: () => reloads,
  };
}

/** The Delete button outside any dialog. */
function deleteButton(root: HTMLElement): HTMLButtonElement | null {
  const host = Array.from(root.querySelectorAll('app-button')).find(
    (el) => !el.closest('[role="alertdialog"]'),
  );
  return host?.querySelector('button') ?? null;
}

function dialog(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('[role="alertdialog"]');
}

function confirmIn(root: HTMLElement): HTMLButtonElement {
  const buttons = Array.from(dialog(root)!.querySelectorAll<HTMLButtonElement>('button'));
  return buttons[buttons.length - 1];
}

describe('DocumentDeleteAction', () => {
  afterEach(() => document.body.replaceChildren());

  it('renders nothing when the document cannot be deleted and has nothing approved', async () => {
    const { root } = await setup(doc('draft', { can_delete: false }));
    expect(deleteButton(root)).toBeNull();
    expect(root.querySelector('[data-testid="delete-blocked"]')).toBeNull();
  });

  it('deletes a draft after confirming, then reports success', async () => {
    const { fixture, root, http, notifications, deleted } = await setup(
      doc('draft', { can_delete: true }),
    );
    deleteButton(root)!.click();
    await fixture.whenStable();
    expect(dialog(root)!.querySelector('textarea')).toBeNull();
    confirmIn(root).click();

    const req = http.expectOne(DOC_URL);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toBeNull();
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(notifications.success).toHaveBeenCalledWith('documents.delete.deletedToast');
    expect(deleted()).toBe(1);
    expect(dialog(root)).toBeNull();
    http.verify();
  });

  it('requires a reason to delete an obsolete document', async () => {
    const { fixture, root, http, deleted } = await setup(
      doc('obsolete', {
        current_revision: rev('obsolete'),
        can_delete: true,
        delete_requires_reason: true,
      }),
    );
    deleteButton(root)!.click();
    await fixture.whenStable();

    expect(confirmIn(root).disabled).toBe(true);
    const textarea = dialog(root)!.querySelector('textarea')!;
    textarea.value = '  Duplicate of QM-2  ';
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(confirmIn(root).disabled).toBe(false);
    confirmIn(root).click();

    const req = http.expectOne(DOC_URL);
    expect(req.request.body).toEqual({ reason: 'Duplicate of QM-2' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(deleted()).toBe(1);
    http.verify();
  });

  it('hints that an approved document must be made obsolete first', async () => {
    const { root } = await setup(
      doc('approved', { current_revision: rev('approved'), can_delete: false }),
    );
    expect(deleteButton(root)).toBeNull();
    expect(root.querySelector('[data-testid="delete-blocked"]')?.textContent).toContain(
      'documents.delete.blockedHint',
    );
  });

  it('hides the hint from users who cannot manage the document', async () => {
    const { root } = await setup(
      doc('approved', { current_revision: rev('approved'), can_delete: false }),
      false,
    );
    expect(root.querySelector('[data-testid="delete-blocked"]')).toBeNull();
  });

  it('translates a has_approved_revision conflict and asks the host to reload', async () => {
    const { fixture, root, http, notifications, deleted, reloads } = await setup(
      doc('draft', { can_delete: true }),
    );
    deleteButton(root)!.click();
    await fixture.whenStable();
    confirmIn(root).click();

    http
      .expectOne(DOC_URL)
      .flush(
        { detail: { code: 'has_approved_revision' } },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();
    expect(notifications.error).toHaveBeenCalledWith('documents.delete.errors.hasApprovedRevision');
    expect(deleted()).toBe(0);
    expect(reloads()).toBe(1);
    expect(dialog(root)).toBeNull();
  });

  it('shows a permission message on 403 without reloading', async () => {
    const { fixture, root, http, notifications, reloads } = await setup(
      doc('draft', { can_delete: true }),
    );
    deleteButton(root)!.click();
    await fixture.whenStable();
    confirmIn(root).click();

    http
      .expectOne(DOC_URL)
      .flush({ detail: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    expect(notifications.error).toHaveBeenCalledWith('documents.workflow.errors.forbidden');
    expect(reloads()).toBe(0);
  });
});
