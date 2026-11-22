import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Type, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import contactsEn from '../../../assets/i18n/contacts/en.json';
import { APP_CONFIG } from '../../core/config/app-config';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';
import { ContractsApi } from '../contracts/data/contracts-api';
import { CustomersApi } from '../customers/data/customers-api';
import { ContactCard } from './contact-card';
import { ContactsPage } from './contacts-page';
import { ContactsApi } from './data/contacts-api';
import { ContactCard as CardData, ContactList } from './data/contacts.models';

const ORG = 'org-1';

@Component({ template: '' })
class Blank {}

const LIST: ContactList = {
  items: [
    {
      key: 'no-923456781',
      name: 'Fjord Cloud Hosting AS',
      org_number: '923456781',
      place: 'Oslo',
      country: 'NO',
      roles: ['supplier', 'processor'],
      refs: { customer_id: null, supplier_ids: ['s-1'], processor_ids: ['p-1'], contract_ids: [] },
      status: { key: 'approved', tone: 'ok' },
      next: { key: 'noticeIn', params: { days: 5 }, tone: 'warn', due_at: '2026-11-27' },
    },
    {
      key: 'no-987654320',
      name: 'Nordic Steel Components AS',
      org_number: '987654320',
      place: 'Trondheim',
      country: 'NO',
      roles: ['customer', 'supplier'],
      refs: { customer_id: 'c-1', supplier_ids: ['s-2'], processor_ids: [], contract_ids: [] },
      status: { key: 'active', tone: 'ok' },
      next: { key: 'openComplaints', params: { count: 2 }, tone: 'plain', due_at: null },
    },
  ],
  counts: { all: 18, customer: 9, supplier: 11, processor: 4, agreements: 15 },
  total: 2,
  roles: ['customer', 'supplier', 'processor'],
  agreements_enabled: true,
};

const CARD: CardData = {
  key: 'no-923456781',
  name: 'Fjord Cloud Hosting AS',
  org_number: '923456781',
  place: 'Oslo',
  country: 'NO',
  roles: ['supplier', 'processor'],
  status: { key: 'approved', tone: 'ok' },
  next: null,
  sentence: {
    purpose: 'Runs our customer portal.',
    key: 'dpaSignedRenewal',
    params: { date: '2026-11-27' },
  },
  agreements: [
    {
      id: 'k-1',
      title: 'Hosting agreement',
      code: 'CT-1',
      kind: 'contract',
      contract_type: 'sla',
      status: 'active',
      signed_on: null,
      renews_at: '2026-11-27',
      notice_period_days: 30,
      notice_at: '2026-10-28',
      days_to_notice: 5,
      tone: 'warn',
      url: '/contracts/k-1',
    },
  ],
  personal_data: [
    {
      id: 'r-1',
      title: 'Customer contact details',
      country: 'NO',
      transfer_countries: [],
      url: '/privacy/ropa/r-1',
    },
  ],
  risks: [
    {
      id: 'x-1',
      title: 'Portal downtime',
      level: 'medium',
      after_treatment: false,
      tone: 'warn',
      status: 'assessed',
      url: '/risk/risks/x-1',
    },
  ],
  evaluations: [
    {
      id: 'e-1',
      title: 'Evaluation 2025',
      status: 'completed',
      result: 'approved',
      date: '2025-11-01',
      url: '/suppliers/s-1/evaluations/e-1',
    },
  ],
  next_evaluation_at: null,
  incidents: [],
  customer: null,
  members: [],
  links: { customer: null, supplier: '/suppliers/s-1', processor: '/privacy/processors/p-1' },
  visible: { contracts: true, privacy: true, suppliers: true },
  requirement_refs: { agreements: ['ISO 27001 A.5.20'] },
};

interface Opts {
  readonly query?: Record<string, string>;
  readonly params?: Record<string, string>;
  readonly permissions?: readonly string[];
  readonly card?: () => unknown;
  readonly showReq?: boolean;
}

async function setup<T>(component: Type<T>, opts: Opts = {}) {
  const api = {
    list: vi.fn(() => of(LIST)),
    card: vi.fn(opts.card ?? (() => of(CARD))),
  };
  const contracts = {
    list: vi.fn(() =>
      of({
        items: [
          {
            id: 'k-1',
            code: 'CT-1',
            title: 'Hosting agreement',
            contract_type: 'sla',
            status: 'active',
            counterparties: ['Fjord Cloud Hosting AS'],
            end_date: '2026-11-27',
            notice_deadline: '2026-10-28',
            notice_due_in_days: 5,
          },
        ],
        total: 1,
      }),
    ),
  };
  const customers = { summary: vi.fn(() => of({ pending_matches: 3, last_scan: null })) };
  const show = signal(opts.showReq ?? false);
  TestBed.configureTestingModule({
    imports: [
      component,
      TranslocoTestingModule.forRoot({
        langs: { en: { ...en, contacts: contactsEn } },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', component: Blank }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
      { provide: ContactsApi, useValue: api },
      { provide: ContractsApi, useValue: contracts },
      { provide: CustomersApi, useValue: customers },
      {
        provide: RequirementsVisibilityService,
        useValue: { show: show.asReadonly(), on: show.asReadonly() },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap(opts.query ?? {}),
            paramMap: convertToParamMap(opts.params ?? {}),
          },
          queryParamMap: of(convertToParamMap(opts.query ?? {})),
          paramMap: of(convertToParamMap(opts.params ?? {})),
        },
      },
      {
        provide: ModuleService,
        useValue: {
          isEnabled: () => true,
          loaded: signal(true).asReadonly(),
          ensureLoaded: () => of(true),
        },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({
            id: ORG,
            name: 'Org',
            roles: [],
            permissions: opts.permissions ?? [
              'customers:read',
              'customers:write',
              'suppliers:read',
              'suppliers:write',
              'privacy:read',
              'contracts:read',
            ],
          }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(component);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api, contracts, root: fixture.nativeElement as HTMLElement };
}

describe('ContactsPage', () => {
  afterEach(() => document.body.replaceChildren());

  it('lists companies with role chips, status and the next step', async () => {
    const { root, api } = await setup(ContactsPage);
    expect(api.list).toHaveBeenCalledWith(ORG, expect.objectContaining({ role: 'all' }));
    expect(root.querySelector('h1')?.textContent).toContain('Contacts');
    const row = root.querySelector('[data-testid="contact-row-no-923456781"]')!;
    expect(row.textContent).toContain('Fjord Cloud Hosting AS');
    expect(row.textContent).toContain('Org. no. 923 456 781 · Oslo');
    expect(row.textContent).toContain('Supplier');
    expect(row.textContent).toContain('Data processor');
    expect(row.textContent).toContain('Approved');
    expect(row.textContent).toContain('Notice deadline in 5 days');
    expect(root.querySelector('[data-testid="contacts-tab-all"]')?.textContent).toContain('(18)');
    expect(root.querySelector('[data-testid="contacts-tab-agreements"]')?.textContent).toContain(
      '(15)',
    );
    expect(root.querySelector('[data-testid="contacts-duplicates"]')?.textContent).toContain('(3)');
    const registers = root.querySelector('[data-testid="contacts-registers"]')!;
    expect(registers.querySelector('a[href="/customers"]')).not.toBeNull();
    expect(registers.querySelector('a[href="/privacy/processors"]')).not.toBeNull();
  });

  it('filters by role from ?tab= and shows agreements from the contract register', async () => {
    const supplierTab = await setup(ContactsPage, { query: { tab: 'suppliers' } });
    expect(supplierTab.api.list).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ role: 'supplier' }),
    );
    expect(
      supplierTab.root.querySelector(
        '[data-testid="contacts-registers"] a[href="/suppliers/evaluations"]',
      ),
    ).not.toBeNull();
    document.body.replaceChildren();
    TestBed.resetTestingModule();

    const { root, contracts } = await setup(ContactsPage, { query: { tab: 'agreements' } });
    expect(contracts.list).toHaveBeenCalled();
    const table = root.querySelector('[data-testid="contacts-agreements"]')!;
    expect(table.textContent).toContain('Hosting agreement');
    expect(table.textContent).toContain('Service agreement');
    expect(table.textContent).toContain('Notice deadline');
  });

  it('only offers "+ New contact" targets the user may create', async () => {
    const { root } = await setup(ContactsPage, { permissions: ['customers:read'] });
    expect(root.querySelector('[data-testid="contacts-new"]')).toBeNull();
    expect(root.querySelector('[data-testid="contacts-duplicates"]')).toBeNull();
  });
});

describe('ContactCard', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows the company with roles, the status sentence and the cards', async () => {
    const { root, api } = await setup(ContactCard, { params: { key: 'no-923456781' } });
    expect(api.card).toHaveBeenCalledWith(ORG, 'no-923456781');
    expect(root.querySelector('h1')?.textContent).toContain('Fjord Cloud Hosting AS');
    expect(root.querySelector('[data-testid="contact-roles"]')?.textContent).toContain('Supplier');
    const sentence = root.querySelector('[data-testid="contact-sentence"]')!;
    expect(sentence.textContent).toContain('Runs our customer portal.');
    expect(sentence.querySelector('b')?.textContent).toContain('data processing agreement');
    const agreements = root.querySelector('[data-testid="contact-agreements"]')!;
    expect(agreements.textContent).toContain('Hosting agreement');
    expect(agreements.textContent).toContain('5 days');
    expect(agreements.textContent).toContain('notice 1 mo.');
    expect(root.querySelector('[data-testid="contact-personal-data"]')?.textContent).toContain(
      '(EEA)',
    );
    expect(root.querySelector('[data-testid="contact-risks"]')?.textContent).toContain('Medium');
    expect(root.querySelector('[data-testid="contact-evaluations"]')?.textContent).toContain(
      'Approved',
    );
    const start = root.querySelector('[data-testid="contact-start-evaluation"]');
    expect(start?.getAttribute('href')).toBe('/suppliers/s-1?newEvaluation=1');
    // Requirement refs stay hidden until "Vis krav" is on.
    expect(root.querySelector('[data-testid="req-pills"]')).toBeNull();
  });

  it('shows requirement refs with "Vis krav" on', async () => {
    const { root } = await setup(ContactCard, { params: { key: 'k' }, showReq: true });
    expect(root.querySelector('[data-testid="req-pills"]')?.textContent).toContain(
      'ISO 27001 A.5.20',
    );
  });

  it('says so when the company is not found', async () => {
    const { root } = await setup(ContactCard, {
      params: { key: 'supplier-x' },
      card: () => throwError(() => new HttpErrorResponse({ status: 404 })),
    });
    expect(root.querySelector('[data-testid="contact-missing"]')).not.toBeNull();
  });
});
