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
  it('loads the first page and pages forward with the offset', async () => {
    const { fixture, root, http } = await setup();
    const first = http.expectOne((r) => r.url === URL);
    expect(first.request.params.get('limit')).toBe(String(DOCUMENTS_PAGE_SIZE));
    expect(first.request.params.get('offset')).toBe('0');
    first.flush({
      items: Array.from({ length: DOCUMENTS_PAGE_SIZE }, (_, i) => summary(i)),
      total: DOCUMENTS_PAGE_SIZE + 3,
    });
    await fixture.whenStable();

    const next = Array.from(root.querySelectorAll<HTMLButtonElement>('nav button'))[1];
    next.click();
    const second = http.expectOne((r) => r.url === URL);
    expect(second.request.params.get('offset')).toBe(String(DOCUMENTS_PAGE_SIZE));
    second.flush({ items: [summary(99)], total: DOCUMENTS_PAGE_SIZE + 3 });
    http.verify();
  });

  it('badges overdue reviews and filters to review-due documents', async () => {
    const { fixture, root, http } = await setup();
    http
      .expectOne((r) => r.url === URL)
      .flush({ items: [summary(1, { review_overdue: true }), summary(2)], total: 2 });
    await fixture.whenStable();
    expect(root.textContent).toContain('documents.review.overdue');
    expect(root.querySelector('nav')).toBeNull();

    const toggle = root.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
    toggle.click();
    const filtered = http.expectOne((r) => r.url === URL);
    expect(filtered.request.params.get('review_due')).toBe('true');
    expect(filtered.request.params.get('offset')).toBe('0');
    filtered.flush({ items: [], total: 0 });
    http.verify();
  });
});
