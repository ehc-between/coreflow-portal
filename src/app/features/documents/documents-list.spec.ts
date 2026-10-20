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

async function setup(permissions: string[] = []) {
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
          currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions }).asReadonly(),
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

  const linked = [
    summary(1, {
      requirement_links: { confirmed: 2, suggested: 1, refs: ['iso:5.2.r1', 'iso:7.5.r1'] },
    }),
    summary(2, { requirement_links: { confirmed: 0, suggested: 3, refs: [] } }),
    summary(3, { requirement_links: { confirmed: 0, suggested: 0, refs: [] } }),
  ];

  it('shows requirement chips: confirmed count, suggested hint, and "not linked"', async () => {
    const { fixture, root, http } = await setup(['standards:read']);
    http.expectOne((r) => r.url === URL).flush(linked);
    await fixture.whenStable();
    const cells = Array.from(root.querySelectorAll('[data-testid="requirement-cell"]'));
    expect(cells).toHaveLength(3);

    const count = cells[0].querySelector('[data-testid="requirement-count"]')!;
    expect(count.textContent).toContain('documents.requirements.count');
    expect(count.getAttribute('title')).toBe('5.2.r1, 7.5.r1');
    expect(cells[0].querySelector('[data-testid="requirement-suggested"]')?.textContent).toContain(
      '1',
    );

    expect(cells[1].querySelector('[data-testid="requirement-count"]')).toBeNull();
    expect(cells[1].textContent).toContain('documents.requirements.none');
    expect(cells[1].querySelector('[data-testid="requirement-suggested"]')?.textContent).toContain(
      '3',
    );

    expect(cells[2].textContent).toContain('documents.requirements.none');
    expect(cells[2].querySelector('[data-testid="requirement-suggested"]')).toBeNull();
    http.verify();
  });

  it('filters to documents without a confirmed requirement link', async () => {
    const { fixture, root, http } = await setup(['standards:read']);
    http.expectOne((r) => r.url === URL).flush(linked);
    await fixture.whenStable();
    const toggle = root.querySelector<HTMLButtonElement>('[data-testid="filter-unlinked"]')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    http.expectOne((r) => r.url === URL).flush(linked);
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    const titles = Array.from(root.querySelectorAll('li')).map((li) => li.textContent);
    expect(titles).toHaveLength(2);
    expect(titles.join(' ')).toContain('Doc 2');
    expect(titles.join(' ')).toContain('Doc 3');
    expect(titles.join(' ')).not.toContain('Doc 1');
    http.verify();
  });

  it('hides the requirement column and filter without standards:read', async () => {
    const { fixture, root, http } = await setup();
    http.expectOne((r) => r.url === URL).flush(linked);
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="requirement-cell"]')).toBeNull();
    expect(root.querySelector('[data-testid="filter-unlinked"]')).toBeNull();
    http.verify();
  });
});
