import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { DocumentSummary } from '../../core/documents/document.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { DOCUMENTS_PAGE_SIZE, DocumentsList } from './documents-list';
import { flushLocationRequests } from '../../shared/requirement-locations/requirement-locations.testing';

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
      {
        provide: AuthService,
        useValue: {
          orgs: signal({}).asReadonly(),
          isAuthenticated: signal(false).asReadonly(),
          user: signal(null).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DocumentsList);
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  // The org's document types give the readable type names.
  http
    .match((r) => r.url.endsWith('/document-types'))
    .forEach((r) => r.flush([{ id: 't-1', key: 'procedure', name: 'Prosedyre', active: true }]));
  return { fixture, root: fixture.nativeElement as HTMLElement, http };
}

/** Everything else the page loads on the side (guidance, coverage …). */
function flushRest(http: HttpTestingController): void {
  flushLocationRequests(http);
  http
    .match((r) => r.url !== URL)
    .forEach((r) =>
      r.flush(r.request.url.endsWith('/access-subjects') ? { users: [], departments: [] } : {}),
    );
}

const rows = (root: HTMLElement) => Array.from(root.querySelectorAll('app-record-row'));

describe('DocumentsList', () => {
  it('pages the full list client-side, with the type name and never the raw key', async () => {
    const { fixture, root, http } = await setup();
    const all = Array.from({ length: DOCUMENTS_PAGE_SIZE + 3 }, (_, i) => summary(i));
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.has('limit')).toBe(false);
    req.flush(all);
    await fixture.whenStable();
    expect(rows(root).length).toBe(DOCUMENTS_PAGE_SIZE);
    expect(rows(root)[0].textContent).toContain('Prosedyre · Rev A');
    expect(rows(root)[0].textContent).not.toContain('procedure');

    const next = Array.from(root.querySelectorAll<HTMLButtonElement>('app-pager button'))[1];
    next.click();
    const second = http.expectOne((r) => r.url === URL);
    second.flush(all);
    await fixture.whenStable();
    expect(rows(root).length).toBe(3);
    flushRest(http);
  });

  it('shows the owner and the next review, and filters to review-due documents', async () => {
    const { fixture, root, http } = await setup();
    const all = [
      summary(1, { review_overdue: true, next_review_at: '2026-01-10', owner_name: 'Kari' }),
      summary(2),
    ];
    http.expectOne((r) => r.url === URL).flush(all);
    await fixture.whenStable();
    expect(rows(root)[0].textContent).toContain('Kari');
    expect(rows(root)[0].textContent).toContain('common.status.overdue');

    root.querySelector<HTMLButtonElement>('[data-testid="filter-review"]')!.click();
    http.expectOne((r) => r.url === URL).flush(all);
    await fixture.whenStable();
    expect(rows(root).length).toBe(1);
    expect(root.textContent).toContain('Doc 1');
    flushRest(http);
  });

  const linked = [
    summary(1, {
      requirement_links: { confirmed: 2, suggested: 1, refs: ['iso:5.2.r1', 'iso:7.5.r1'] },
    }),
    summary(2, { requirement_links: { confirmed: 0, suggested: 3, refs: [] } }),
    summary(3, { requirement_links: { confirmed: 0, suggested: 0, refs: [] } }),
  ];

  it('shows requirement coverage chips (documents / suggested / not linked)', async () => {
    const { fixture, root, http } = await setup(['standards:read']);
    http.expectOne((r) => r.url === URL).flush(linked);
    await fixture.whenStable();
    const cells = Array.from(root.querySelectorAll('[data-testid="requirement-cell"]'));
    expect(cells).toHaveLength(3);
    const state = (cell: Element) =>
      cell.querySelector('[data-testid="coverage-chip"]')?.getAttribute('data-state');
    expect(cells.map(state)).toEqual(['documents', 'suggested', 'none']);
    // Suggestions explain themselves; raw refs are never shown.
    expect(cells[1].getAttribute('title')).toBeTruthy();
    expect(root.textContent).not.toContain('5.2.r1');
    flushRest(http);
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
    const titles = rows(root).map((row) => row.textContent ?? '');
    expect(titles).toHaveLength(2);
    expect(titles.join(' ')).toContain('Doc 2');
    expect(titles.join(' ')).toContain('Doc 3');
    expect(titles.join(' ')).not.toContain('Doc 1');
    flushRest(http);
  });

  it('follows a new ?type= on the same page (menu: Policyer, then Planer)', async () => {
    const { fixture, http } = await setup();
    http.expectOne((r) => r.url === URL).flush([summary(1)]);
    await fixture.whenStable();

    await TestBed.inject(Router).navigate([], { queryParams: { type: 'plan' } });
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get('type')).toBe('plan');
    req.flush([summary(2, { type: 'plan' })]);
    await fixture.whenStable();
    flushRest(http);
  });

  it('hides the requirement column and filter without standards:read', async () => {
    const { fixture, root, http } = await setup();
    http.expectOne((r) => r.url === URL).flush(linked);
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="requirement-cell"]')).toBeNull();
    expect(root.querySelector('[data-testid="filter-unlinked"]')).toBeNull();
    flushRest(http);
  });

  it('shows the teaching empty state when the organisation has no documents', async () => {
    const { fixture, root, http } = await setup(['documents:draft']);
    http.expectOne((r) => r.url === URL).flush([]);
    await fixture.whenStable();
    expect(root.querySelector('app-teaching-empty')).not.toBeNull();
    expect(rows(root)).toHaveLength(0);
    flushRest(http);
  });
});
