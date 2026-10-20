import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { DocumentSummary } from '../../core/documents/document.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { DOCUMENTS_PAGE_SIZE, DocumentsList } from './documents-list';

const BASE = 'http://test/api';
const ORG = 'org-1';
const URL = `${BASE}/v1/orgs/${ORG}/documents`;

const summary = (i: number, overrides: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id: `d-${i}`,
  type: 'procedure',
  title: `Doc ${i}`,
  doc_code: `P-${i}`,
  status: 'approved',
  owner_user_id: 'u-1',
  current_rev: 'A',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

async function setup() {
  TestBed.configureTestingModule({
    imports: [DocumentsList, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions: [] }).asReadonly(),
        },
      },
      { provide: AuthService, useValue: { orgs: signal({}).asReadonly() } },
    ],
  });
  const fixture = TestBed.createComponent(DocumentsList);
  await fixture.whenStable();
  return {
    fixture,
    root: fixture.nativeElement as HTMLElement,
    http: TestBed.inject(HttpTestingController),
  };
}

describe('DocumentsList', () => {
  it('pages the full list client-side', async () => {
    const { fixture, root, http } = await setup();
    const all = Array.from({ length: DOCUMENTS_PAGE_SIZE + 3 }, (_, i) => summary(i));
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.has('limit')).toBe(false);
    req.flush(all);
    await fixture.whenStable();
    expect(root.querySelectorAll('li').length).toBe(DOCUMENTS_PAGE_SIZE);

    const next = Array.from(root.querySelectorAll<HTMLButtonElement>('nav button'))[1];
    next.click();
    const second = http.expectOne((r) => r.url === URL);
    second.flush(all);
    await fixture.whenStable();
    expect(root.querySelectorAll('li').length).toBe(3);
    http.verify();
  });

  it('badges overdue reviews and filters to review-due documents', async () => {
    const { fixture, root, http } = await setup();
    const all = [summary(1, { review_overdue: true }), summary(2)];
    http.expectOne((r) => r.url === URL).flush(all);
    await fixture.whenStable();
    expect(root.textContent).toContain('documents.review.overdue');
    expect(root.querySelector('nav')).toBeNull();

    root.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click();
    http.expectOne((r) => r.url === URL).flush(all);
    await fixture.whenStable();
    expect(root.querySelectorAll('li').length).toBe(1);
    expect(root.textContent).toContain('Doc 1');
    http.verify();
  });
});
