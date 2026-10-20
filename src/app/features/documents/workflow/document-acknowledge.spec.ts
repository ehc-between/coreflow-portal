import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { DocumentDetail } from '../../../core/documents/document.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { DocumentAcknowledge } from './document-acknowledge';

const approvedRev = {
  id: 'r-a',
  rev: 'A',
  status: 'approved',
  author_user_id: 'u-1',
  created_at: '2026-10-01T00:00:00Z',
};

function doc(overrides: Partial<DocumentDetail>): DocumentDetail {
  return {
    id: 'doc-1',
    type: 'procedure',
    title: 'Quality manual',
    doc_code: 'QM-1',
    status: 'approved',
    owner_user_id: 'u-1',
    current_revision: approvedRev,
    revisions: [],
    acknowledgement: { required: true, acknowledged_at: null },
    ...overrides,
  };
}

async function render(document: DocumentDetail): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [DocumentAcknowledge, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal('org-1').asReadonly() },
      },
    ],
  });
  const fixture = TestBed.createComponent(DocumentAcknowledge);
  fixture.componentRef.setInput('document', document);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const prompt = (root: HTMLElement) => root.textContent?.includes('documents.ack.promptTitle');

describe('DocumentAcknowledge gate', () => {
  it('shows for an approved document that requires acknowledgement', async () => {
    expect(prompt(await render(doc({})))).toBe(true);
  });

  it('still shows while a newer draft is in review (an approved revision exists)', async () => {
    expect(prompt(await render(doc({ status: 'in_review' })))).toBe(true);
  });

  it('hides for obsolete, never-approved or not-required documents', async () => {
    expect(prompt(await render(doc({ status: 'obsolete' })))).toBe(false);
    TestBed.resetTestingModule();
    expect(prompt(await render(doc({ status: 'draft', current_revision: null })))).toBe(false);
    TestBed.resetTestingModule();
    expect(
      prompt(await render(doc({ acknowledgement: { required: false, acknowledged_at: null } }))),
    ).toBe(false);
  });
});
