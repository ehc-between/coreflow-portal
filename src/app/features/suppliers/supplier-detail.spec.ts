import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import suppliersEn from '../../../assets/i18n/suppliers/en.json';
import { APP_CONFIG } from '../../core/config/app-config';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { SupplierAgreements, SupplierDetail } from './data/supplier.models';
import { SuppliersApi } from './data/suppliers-api';
import { SupplierDetailPage } from './supplier-detail';

const SUPPLIER = {
  id: 's-1',
  code: 'SUP-0002',
  name: 'Nordic Cloud AS',
  category: 'cloud',
  criticality: 'critical',
  status: 'under_evaluation',
  country: 'NO',
  owner: { id: 'u-1', name: 'Kari' },
  department_id: null,
  processes_personal_data: true,
  has_system_access: true,
  provides_cloud_services: true,
  provides_ai: false,
  next_evaluation_at: '2026-12-17T09:00:00',
  evaluation_overdue: false,
  last_evaluated_at: null,
  last_score: null,
  attention: ['not_approved', 'dpa_missing'],
  url: '/suppliers/s-1',
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:00',
  legal_name: null,
  registration_number: null,
  website: null,
  description: null,
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  data_locations: ['NO'],
  certifications: ['ISO/IEC 27001'],
  certificates: [
    {
      id: 'c1',
      standard: 'iso27001',
      standard_name: 'ISO/IEC 27001',
      label: 'ISO/IEC 27001',
      number: 'ISMS-2207',
      issuer: 'Bureau Veritas',
      valid_until: '2027-01-01',
      attachment_id: null,
      status: 'expiring',
    },
  ],
  evaluation_interval_months: null,
  effective_interval_months: 12,
  approved_at: null,
  approved_by: null,
  created_by: null,
  open_evaluations: 1,
  latest_assessments: {},
  required_assessments: [
    { kind: 'initial', reason: 'always', done: false, latest: null, open_evaluation_id: null },
    {
      kind: 'privacy',
      reason: 'personal_data',
      done: true,
      latest: { id: 'e-9', decision: 'approved', score: 95.4, decided_at: '2026-10-18T09:00:00' },
      open_evaluation_id: null,
    },
    {
      kind: 'security',
      reason: 'system_access',
      done: false,
      latest: null,
      open_evaluation_id: 'e-2',
    },
  ],
  required_done: 1,
  required_total: 3,
  open_conditions: null,
  performance: {
    period_days: 365,
    entries: 0,
    nonconformities: 0,
    average_rating: null,
    on_time_rate: null,
    quality_ok_rate: null,
  },
  performance_warning: null,
  dpa_status: 'missing',
  can_edit: true,
  can_approve: false,
  can_delete: false,
} as unknown as SupplierDetail;

const AGREEMENTS: SupplierAgreements = {
  dpa: { required: true, status: 'missing', attention: true },
  transfer: { required: false, assessed: false },
  contracts: [],
  processors: [],
  transfer_assessments: [],
  ai_systems: [],
  assets: [],
  risks: [],
  deviations: [],
  open_risks: 0,
  open_deviations: 0,
  suggestions: [],
};

async function setup() {
  const api = {
    get: vi.fn(() => of(SUPPLIER)),
    agreements: vi.fn(() => of(AGREEMENTS)),
    listSupplierEvaluations: vi.fn(() => of({ items: [], total: 0 })),
    listPerformance: vi.fn(() => of({ items: [], total: 0, stats: SUPPLIER.performance })),
    listQuestionnaires: vi.fn(() => of({ items: [] })),
  };
  TestBed.configureTestingModule({
    imports: [
      SupplierDetailPage,
      TranslocoTestingModule.forRoot({
        langs: { en: { ...en, suppliers: suppliersEn }, 'kit/en': kitEn },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...provideFakeGuidance().providers,
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
      { provide: SuppliersApi, useValue: api },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: AskPanelService, useValue: { askAbout: vi.fn(), showWith: vi.fn() } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1').asReadonly(),
          currentOrg: signal({
            id: 'org-1',
            name: 'Acme',
            roles: [],
            permissions: ['suppliers:read', 'suppliers:write', 'contracts:write', 'privacy:write'],
          }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SupplierDetailPage);
  fixture.componentRef.setInput('id', 's-1');
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await render();
  return { fixture, api, render, root: fixture.nativeElement as HTMLElement };
}

describe('SupplierDetailPage', () => {
  afterEach(() => document.body.replaceChildren());

  it('opens "Start evaluation" from the header on any tab, with the recommended kind', async () => {
    const { root, render, api } = await setup();
    root.querySelector<HTMLButtonElement>('[data-testid="tab-activity"]')!.click();
    await render();
    root.querySelector<HTMLElement>('[data-testid="header-start-evaluation"] button')!.click();
    await render();
    expect(api.listQuestionnaires).toHaveBeenCalled();
    const kind = document.querySelector<HTMLSelectElement>('#ev-kind')!;
    expect(kind).not.toBeNull();
    // Initial is not done and not started: it is the recommended kind.
    expect(kind.value).toBe('initial');
    expect(kind.selectedOptions[0].textContent).toContain('(recommended)');
    // The AI assessment does not apply to a supplier without AI.
    const kinds = Array.from(kind.options).map((o) => o.value);
    expect(kinds).not.toContain('ai');
    expect(kinds).toContain('security');
  });

  it('lists what needs follow-up with the action that closes it', async () => {
    const { root } = await setup();
    const card = root.querySelector('[data-testid="attention-card"]')!;
    expect(card.textContent).toContain('Needs follow-up (2)');
    expect(card.querySelector('[data-code="dpa_missing"]')?.textContent).toContain('Create DPA');
    expect(card.querySelector('[data-code="not_approved"]')?.textContent).toContain(
      'Start initial evaluation',
    );
  });

  it('shows the required assessments and the DPA gap', async () => {
    const { root } = await setup();
    const required = root.querySelector('[data-testid="required-assessments"]')!;
    expect(required.textContent).toContain('Required assessments: 1 of 3 done');
    expect(required.querySelector('[data-kind="security"]')?.textContent).toContain('In progress');
    expect(required.querySelector('[data-kind="privacy"]')?.textContent).toContain('95.4 / 100');
    expect(root.querySelector('[data-testid="dpa-gap"]')?.textContent).toContain(
      'Personal data without a data processing agreement',
    );
    expect(root.querySelector('[data-testid="certificates"]')?.textContent).toContain(
      'Expires soon',
    );
  });
});
