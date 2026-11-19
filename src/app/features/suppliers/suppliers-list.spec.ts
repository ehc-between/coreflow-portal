import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import suppliersEn from '../../../assets/i18n/suppliers/en.json';
import { PageContextService } from '../../core/ai/page-context';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { SupplierListItem } from './data/supplier.models';
import { SuppliersList } from './suppliers-list';

const BASE = 'http://test/api';
const ORG = 'org-1';
const listUrl = `${BASE}/v1/orgs/${ORG}/suppliers`;

const row = (over: Partial<SupplierListItem> = {}): SupplierListItem => ({
  id: 's-1',
  code: 'SUP-0001',
  name: 'Acme Hosting',
  category: 'cloud',
  criticality: 'critical',
  status: 'approved',
  country: 'NO',
  owner: { id: 'u-1', name: 'Kari' },
  department_id: null,
  processes_personal_data: true,
  has_system_access: false,
  provides_cloud_services: true,
  provides_ai: false,
  next_evaluation_at: '2026-01-01T00:00:00',
  evaluation_overdue: true,
  last_evaluated_at: null,
  last_score: 82.5,
  url: '/suppliers/s-1',
  created_at: '2025-01-01T00:00:00',
  updated_at: '2025-01-01T00:00:00',
  ...over,
});

function setup(permissions: readonly string[] = ['suppliers:read', 'suppliers:write']) {
  const prompts: string[] = [];
  TestBed.configureTestingModule({
    imports: [
      SuppliersList,
      TranslocoTestingModule.forRoot({
        langs: { en: { ...en, suppliers: suppliersEn }, 'kit/en': kitEn },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
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
      { provide: AskPanelService, useValue: { showWith: (p: string) => prompts.push(p) } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(SuppliersList);
  document.body.appendChild(fixture.nativeElement);
  return { fixture, http, prompts, root: fixture.nativeElement as HTMLElement };
}

async function flushList(
  fixture: ReturnType<typeof setup>['fixture'],
  http: HttpTestingController,
  items: readonly SupplierListItem[],
) {
  await fixture.whenStable();
  for (const req of http.match((r) => r.url === listUrl)) {
    req.flush({ items, total: items.length });
  }
  for (const req of http.match((r) => r.url === `${listUrl}/summary`)) {
    req.flush({
      total: items.length,
      by_status: { approved: items.length },
      by_criticality: {},
      evaluations_overdue: 1,
      evaluations_due_soon: 0,
      open_evaluations: 0,
      processors: 1,
      ai_suppliers: 0,
    });
  }
  await fixture.whenStable();
}

describe('SuppliersList', () => {
  afterEach(() => document.body.replaceChildren());

  it('lists suppliers with status, criticality, flags and an overdue re-evaluation', async () => {
    const { fixture, http, root } = setup();
    await flushList(fixture, http, [row({ attention: ['dpa_missing', 'evaluation_overdue'] })]);
    const rows = root.querySelectorAll('[data-testid="supplier-rows"] app-record-row');
    expect(rows.length).toBe(1);
    const text = rows[0].textContent ?? '';
    expect(text).toContain('SUP-0001');
    expect(text).toContain('Acme Hosting');
    expect(text).toContain('Approved');
    expect(text).toContain('Critical');
    expect(text).toContain('Personal data');
    expect(text).toContain('Last score 82.5 / 100');
    expect(text).toContain('Overdue');
    expect(rows[0].querySelector('[data-testid="row-attention"]')?.textContent).toContain(
      'No data processing agreement +1',
    );
    expect(root.textContent).toContain('Re-evaluation overdue');
    // One page only: no pager row.
    expect(root.querySelector('app-pager')).toBeNull();
  });

  it('filters on a headline figure when it is clicked, and clears it on a second click', async () => {
    const { fixture, http, root } = setup();
    await flushList(fixture, http, [row()]);
    const tile = root.querySelector<HTMLButtonElement>('[data-testid="kpi-attention"]')!;
    tile.click();
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('attention')).toBe('true');
    req.flush({ items: [], total: 0 });
    await fixture.whenStable();
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    tile.click();
    await fixture.whenStable();
    const again = http.expectOne((r) => r.url === listUrl);
    expect(again.request.params.has('attention')).toBe(false);
    again.flush({ items: [], total: 0 });
  });

  it('keeps search, status and follow-up visible and the rest (criticality …) under more filters', async () => {
    const { fixture, http, root } = setup();
    await flushList(fixture, http, [row()]);
    expect(root.querySelector('#sup-f-status')).not.toBeNull();
    expect(root.querySelector('[data-testid="filter-attention"]')).not.toBeNull();
    const panel = root.querySelector('[data-testid="more-filters-panel"]')!;
    expect(panel.querySelector('#sup-f-crit')).not.toBeNull();
    expect(panel.querySelectorAll('select').length).toBe(7);
  });

  it('shows the teaching empty state for an empty register and hides "new" without write access', async () => {
    const { fixture, http, root } = setup(['suppliers:read']);
    await flushList(fixture, http, []);
    expect(root.querySelector('[data-testid="supplier-rows"]')).toBeNull();
    expect(root.textContent).not.toContain('New supplier');
  });

  it('re-queries with the chosen filter', async () => {
    const { fixture, http, root } = setup();
    await flushList(fixture, http, [row()]);
    const status = root.querySelector<HTMLSelectElement>('#sup-f-status')!;
    status.value = 'suspended';
    status.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('status')).toBe('suspended');
    req.flush({ items: [], total: 0 });
  });

  it('shows the DPA status per row and filters on it (U25)', async () => {
    const { fixture, http, root } = setup();
    await flushList(fixture, http, [
      row({ dpa_status: 'covered' }),
      row({ id: 's-2', code: 'SUP-0002', dpa_status: 'not_needed' }),
    ]);
    const badges = root.querySelectorAll('[data-testid="row-dpa"]');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toContain('DPA in place');
    const select = root.querySelector<HTMLSelectElement>('[data-testid="filter-dpa"]')!;
    select.value = 'missing';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('dpa_status')).toBe('missing');
    req.flush({ items: [], total: 0 });
  });

  it('registers page context for the assistant', async () => {
    const { fixture, http } = setup();
    await flushList(fixture, http, []);
    expect(TestBed.inject(PageContextService).current()).toMatchObject({
      module: 'suppliers',
      entityType: 'supplier',
      view: 'list',
    });
  });
});
