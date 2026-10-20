import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input, output, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { DocumentDetail, DocumentStatus } from '../../../core/documents/document.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { DocumentEditor } from './document-editor';
import { DocumentEditorPage } from './document-editor-page';

/** Stands in for the rich-text editor (no editor engine in unit tests). */
@Component({ selector: 'app-document-editor', template: '' })
class StubEditor {
  readonly content = input('');
  readonly saving = input(false);
  readonly save = output<string>();
  readonly cancelEdit = output<void>();
}

const BASE = 'http://test/api';

function doc(status: DocumentStatus): DocumentDetail {
  return {
    id: 'doc-1',
    type: 'procedure',
    title: 'Quality manual',
    doc_code: 'QM-1',
    status,
    owner_user_id: 'u-1',
    current_revision: null,
    revisions: [],
  };
}

async function render(status: DocumentStatus): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [DocumentEditorPage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: SelectedOrgService, useValue: { currentOrgId: signal('org-1').asReadonly() } },
    ],
  });
  TestBed.overrideComponent(DocumentEditorPage, {
    remove: { imports: [DocumentEditor] },
    add: { imports: [StubEditor] },
  });
  const fixture = TestBed.createComponent(DocumentEditorPage);
  fixture.componentRef.setInput('id', 'doc-1');
  await fixture.whenStable();
  TestBed.inject(HttpTestingController)
    .expectOne(`${BASE}/v1/orgs/org-1/documents/doc-1`)
    .flush(doc(status));
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('DocumentEditorPage', () => {
  it('warns that saving an in-review document withdraws the submitted revision', async () => {
    const root = await render('in_review');
    expect(root.textContent).toContain('documents.editor.inReviewWarning');
  });

  it('shows no warning for a draft', async () => {
    const root = await render('draft');
    expect(root.textContent).not.toContain('documents.editor.inReviewWarning');
  });
});
