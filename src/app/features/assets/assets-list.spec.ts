import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import assetsEn from '../../../assets/i18n/assets/en.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import { PageContextService } from '../../core/ai/page-context';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { AssetsList } from './assets-list';
import { Asset } from './data/asset.models';

const BASE = 'http://test/api';
const ORG = 'org-1';
const listUrl = `${BASE}/v1/orgs/${ORG}/assets`;
const dueUrl = `${listUrl}/calibrations-due`;

const row = (over: Partial<Asset> = {}): Asset => ({
  id: 'a-1',
  org_id: ORG,
  code: 'AST-0001',
  name: 'Cold store thermometer',
  description: null,
  asset_type: 'hardware',
  category: null,
  classification: 'internal',
  confidentiality: null,
  integrity: 'high',
  availability: null,
  criticality: 'high',
  lifecycle_status: 'in_use',
  owner_user_id: 'u-1',
  owner: { id: 'u-1', name: 'Kari' },
  custodian_user_id: null,
  custodian: null,
  department_id: null,
  location: 'Store 2',
  vendor: null,
  model: null,
  serial_number: null,
  version: null,
  contains_personal_data: false,
  handling_rules: null,
  acquired_on: null,
  warranty_until: null,
  end_of_life_on: null,
  review_date: null,
  retired_on: null,
  disposed_on: null,
  disposal_method: null,
  requires_calibration: true,
  calibration_interval_months: 12,
  measurement_range: null,
  accuracy: null,
  last_calibrated_on: '2025-10-01',
  next_calibration_due: '2026-10-01',
  calibration_status: 'overdue',
  notes: null,
  url: '/assets/a-1',
  created_by: 'u-1',
  created_at: '2025-01-01T00:00:00',
  updated_at: '2025-01-01T00:00:00',
  ...over,
});

function setup(permissions: readonly string[] = ['assets:read', 'assets:write']) {
  const prompts: string[] = [];
  TestBed.configureTestingModule({
    imports: [
      AssetsList,
      TranslocoTestingModule.forRoot({
        langs: { en: { ...en, assets: assetsEn }, 'kit/en': kitEn },
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
  const fixture = TestBed.createComponent(AssetsList);
  document.body.appendChild(fixture.nativeElement);
  return { fixture, http, prompts, root: fixture.nativeElement as HTMLElement };
}

async function flush(
  fixture: ReturnType<typeof setup>['fixture'],
  http: HttpTestingController,
  items: readonly Asset[],
) {
  await fixture.whenStable();
  for (const req of http.match((r) => r.url === listUrl)) {
    req.flush({ items, total: items.length });
  }
  for (const req of http.match((r) => r.url === dueUrl)) {
    req.flush({ items: items.filter((a) => a.calibration_status) });
  }
  await fixture.whenStable();
}

describe('AssetsList', () => {
  afterEach(() => document.body.replaceChildren());

  it('lists assets with classification, lifecycle and calibration status', async () => {
    const { fixture, http, root } = setup();
    await flush(fixture, http, [row()]);
    const rows = root.querySelectorAll('[data-testid="asset-rows"] li');
    expect(rows.length).toBe(1);
    const text = rows[0].textContent ?? '';
    expect(text).toContain('AST-0001');
    expect(text).toContain('Cold store thermometer');
    expect(text).toContain('Internal');
    expect(text).toContain('In use');
    expect(text).toContain('Overdue');
    expect(root.textContent).toContain('Calibrations overdue');
    expect(root.textContent).toContain('Register asset');
  });

  it('hides "register" without write access and shows the teaching empty state', async () => {
    const { fixture, http, root } = setup(['assets:read']);
    await flush(fixture, http, []);
    expect(root.querySelector('[data-testid="asset-rows"]')).toBeNull();
    expect(root.textContent).not.toContain('Register asset');
  });

  it('re-queries with the chosen filter', async () => {
    const { fixture, http, root } = setup();
    await flush(fixture, http, [row()]);
    const select = root.querySelector<HTMLSelectElement>('#ast-f-class')!;
    select.value = 'restricted';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('classification')).toBe('restricted');
    req.flush({ items: [], total: 0 });
  });

  it('registers page context for the assistant', async () => {
    const { fixture, http } = setup();
    await flush(fixture, http, []);
    expect(TestBed.inject(PageContextService).current()).toMatchObject({
      module: 'assets',
      entityType: 'asset',
      view: 'list',
    });
  });
});
