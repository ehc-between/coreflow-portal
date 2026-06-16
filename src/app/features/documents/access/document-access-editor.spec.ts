import { ComponentRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { AccessGrant, DocumentVisibility } from '../../../core/documents/document.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { DocumentAccessEditor } from './document-access-editor';

function setup(orgId: string | null) {
  const selectedOrg = {
    currentOrgId: signal(orgId).asReadonly(),
    currentOrg: signal(null).asReadonly(),
  };

  TestBed.configureTestingModule({
    imports: [DocumentAccessEditor, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
      { provide: SelectedOrgService, useValue: selectedOrg },
    ],
  });

  const fixture = TestBed.createComponent(DocumentAccessEditor);
  const ref = fixture.componentRef as ComponentRef<DocumentAccessEditor>;
  return { fixture, ref };
}

describe('DocumentAccessEditor', () => {
  it('emits a local grant without calling the API in local mode', () => {
    const { fixture, ref } = setup(null);
    ref.setInput('mode', 'local');
    ref.setInput('visibility', 'restricted' satisfies DocumentVisibility);
    fixture.detectChanges();

    const emitted: AccessGrant[][] = [];
    fixture.componentInstance.grantsChange.subscribe((g) => emitted.push([...g]));

    // pickSubject is the picker's selection handler.
    (fixture.componentInstance as unknown as { pickSubject: (s: unknown) => void }).pickSubject({
      subject_type: 'department',
      id: 'dep-1',
      name: 'Quality',
      email: '',
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0][0]).toMatchObject({
      subject_type: 'department',
      subject_id: 'dep-1',
      subject_name: 'Quality',
      level: 'view',
    });
    // No grant request should have been issued in local mode.
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('persists a grant via the API in live mode', () => {
    const { fixture, ref } = setup('org-1');
    ref.setInput('mode', 'live');
    ref.setInput('documentId', 'doc-1');
    ref.setInput('visibility', 'restricted' satisfies DocumentVisibility);
    fixture.detectChanges();

    const http = TestBed.inject(HttpTestingController);
    // The component fetches assignable subjects once an org is present.
    http
      .expectOne('http://test/api/v1/orgs/org-1/access-subjects')
      .flush({ users: [], departments: [] });

    (fixture.componentInstance as unknown as { pickSubject: (s: unknown) => void }).pickSubject({
      subject_type: 'user',
      id: 'u-1',
      name: 'Ada',
      email: 'ada@example.com',
    });

    const req = http.expectOne('http://test/api/v1/orgs/org-1/documents/doc-1/access/grants');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ subject_type: 'user', subject_id: 'u-1', level: 'view' });
    req.flush({
      id: 'g-1',
      subject_type: 'user',
      subject_id: 'u-1',
      subject_name: 'Ada',
      level: 'view',
    });
    http.verify();
  });
});
