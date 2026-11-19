import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Type, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import customersEn from '../../../assets/i18n/customers/en.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import { APP_CONFIG } from '../../core/config/app-config';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { ModuleService } from '../../core/modules/module.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { AskPanelService } from '../ask/ask-panel.service';
import { CustomerDetailPage } from './customer-detail';
import { CustomerFormPage } from './customer-form-page';
import { CustomersList } from './customers-list';
import {
  CustomerDetail,
  CustomerListItem,
  CustomerOverview,
  MatchGroup,
  RegistryLookup,
} from './data/customer.models';
import { CustomersApi } from './data/customers-api';
import { CustomerMatches } from './matches/customer-matches';

const ORG = 'org-1';

@Component({ template: '' })
class Blank {}

const ROW: CustomerListItem = {
  id: 'c-1',
  code: 'CUS-0001',
  name: 'Fjord Industrier ASA',
  org_number: '999000001',
  status: 'active',
  segment: 'Industri',
  city: 'Bergen',
  owner: { id: 'u-1', name: 'Kari' },
  open_claims: 2,
  next_renewal: { date: '2027-01-03', days: 45, contract_id: 'k-1' },
  also_supplier: { id: 's-1', code: 'SUP-0001', name: 'Fjord Industrier ASA' },
  updated_at: '2026-11-01T00:00:00Z',
};

const DETAIL: CustomerDetail = {
  id: 'c-1',
  code: 'CUS-0001',
  name: 'Fjord Industrier ASA',
  legal_name: 'FJORD INDUSTRIER ASA',
  org_number: '999000001',
  org_form: 'ASA',
  country: 'NO',
  address_line: 'Kaigaten 1',
  postal_code: '5015',
  city: 'Bergen',
  industry_code: '28.290',
  industry_label: 'Produksjon av maskiner',
  segment: 'Industri',
  status: 'active',
  owner: null,
  website: null,
  email: null,
  phone: null,
  description: null,
  registry: { bankrupt: false, checked_at: '2026-11-18T10:00:00Z' },
  customer_since: '2020-01-01',
  contacts: [
    {
      id: 'p-1',
      name: 'Ola Nordmann',
      title: 'Innkjøpssjef',
      email: 'ola@fjord.example',
      phone: null,
      is_primary: true,
      notes: null,
      position: 0,
    },
  ],
  also_supplier: { id: 's-4', code: 'SUP-0004', name: 'Fjord Industrier ASA' },
  orgnr_checksum_ok: false,
  can_edit: true,
  can_manage: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

const OVERVIEW: CustomerOverview = {
  customer: { id: 'c-1', code: 'CUS-0001', name: 'Fjord', status: 'active', deleted: false },
  facts: {
    open_claims: 2,
    next_renewal: { date: '2027-01-03', days: 45, contract_id: 'k-1', code: 'CT-0003' },
  },
  sections: [
    {
      key: 'claims',
      module: 'deviations',
      total: 3,
      open: 2,
      items: [
        {
          entity_type: 'deviation',
          entity_id: 'd-1',
          title: 'Feil dimensjon på levert del',
          code: 'AVV-0012',
          url: '/deviations/d-1',
          status: 'open',
          module: 'deviations',
          label_key: 'modules.entities.deviation',
        },
      ],
      list_url: '/deviations?customer_id=c-1',
      flow_key: 'customer.to_claim',
    },
  ],
  pending_matches: 1,
};

const LOOKUP: RegistryLookup = {
  org_number: '923609016',
  name: 'EQUINOR ASA',
  legal_name: 'EQUINOR ASA',
  org_form: 'ASA',
  address_line: 'Forusbeen 50',
  postal_code: '4035',
  city: 'STAVANGER',
  country: 'NO',
  industry_code: '06.100',
  industry_label: 'Utvinning av råolje',
  website: null,
  registry: { checked_at: '2026-11-19T10:00:00Z' },
  existing_customer: null,
  also_supplier: null,
};

function fakeApi() {
  return {
    list: vi.fn(() => of({ items: [ROW], total: 1 })),
    summary: vi.fn(() =>
      of({ pending_matches: 3, last_scan: { created: 1, linked: 2, pending: 3 } }),
    ),
    segments: vi.fn(() => of(['Industri', 'Offentlig'])),
    scan: vi.fn(() => of({ created: 4, linked: 9, pending: 2, skipped: 0 })),
    registry: vi.fn(() => of(LOOKUP)),
    get: vi.fn(() => of(DETAIL)),
    create: vi.fn(() => of(DETAIL)),
    update: vi.fn(() => of(DETAIL)),
    delete: vi.fn(() => of(undefined)),
    merge: vi.fn(() => of(DETAIL)),
    overview: vi.fn(() => of(OVERVIEW)),
    supplier: vi.fn(() => of({ name: 'Nordlønn AS', registration_number: '912345678' })),
    matches: vi.fn(() => of([] as MatchGroup[])),
    accept: vi.fn(() => of({})),
    createFromMatch: vi.fn(() => of({})),
    dismiss: vi.fn(() => of({})),
    bulk: vi.fn(() => of({})),
  };
}

async function setup<T>(
  component: Type<T>,
  opts: {
    permissions?: readonly string[];
    api?: ReturnType<typeof fakeApi>;
    inputs?: Record<string, unknown>;
    query?: Record<string, string>;
  } = {},
) {
  const api = opts.api ?? fakeApi();
  const notifications = { success: vi.fn(), error: vi.fn() };
  const ask = { askAbout: vi.fn(), showWith: vi.fn() };
  const query = opts.query ?? {};
  TestBed.configureTestingModule({
    imports: [
      component,
      TranslocoTestingModule.forRoot({
        langs: { en: { ...en, customers: customersEn }, 'kit/en': kitEn },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', component: Blank }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...provideFakeGuidance().providers,
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
      { provide: CustomersApi, useValue: api },
      { provide: NotificationService, useValue: notifications },
      { provide: AskPanelService, useValue: ask },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap(query) },
          queryParamMap: of(convertToParamMap(query)),
          paramMap: of(convertToParamMap({})),
        },
      },
      {
        provide: AssigneeOptionsService,
        useValue: {
          options: signal({ users: [], roles: [], departments: [] }).asReadonly(),
          ensureLoaded: () => undefined,
        },
      },
      {
        provide: ModuleService,
        useValue: {
          enabledKeys: signal(new Set(['customers'])).asReadonly(),
          isEnabled: () => true,
          loaded: signal(true).asReadonly(),
          modules: signal([]).asReadonly(),
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
              'customers:manage',
            ],
          }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(component);
  for (const [k, v] of Object.entries(opts.inputs ?? {})) {
    fixture.componentRef.setInput(k, v);
  }
  document.body.appendChild(fixture.nativeElement);
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await render();
  return { fixture, api, notifications, ask, render, root: fixture.nativeElement as HTMLElement };
}

describe('CustomersList', () => {
  afterEach(() => document.body.replaceChildren());

  it('lists customers with status, open claims, "Also a supplier" and the pending banner', async () => {
    const { root, api } = await setup(CustomersList);
    expect(api.list).toHaveBeenCalledWith(ORG, expect.objectContaining({ sort: 'name' }));
    const row = root.querySelector('[data-testid="customer-rows"] app-record-row')!;
    expect(row.textContent).toContain('CUS-0001');
    expect(row.textContent).toContain('Org. no. 999 000 001');
    expect(row.textContent).toContain('renews in 45 days');
    // An upcoming renewal is not overdue.
    expect(row.textContent).not.toContain('Overdue');
    expect(row.querySelector('[data-testid="row-claims"]')?.textContent).toContain('2 open claims');
    expect(row.querySelector('[data-testid="row-also-supplier"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="pending-banner"]')?.textContent).toContain(
      '3 customer matches are waiting for review',
    );
  });

  it('offers to find customers in existing data when the register is empty, then shows the result', async () => {
    const api = fakeApi();
    api.list.mockReturnValue(of({ items: [], total: 0 }));
    api.summary.mockReturnValue(of({ pending_matches: 0, last_scan: null }) as never);
    const { root, render } = await setup(CustomersList, { api });
    const empty = root.querySelector('[data-testid="empty-scan"]')!;
    expect(empty.textContent).toContain('Find your customers in existing data');
    empty.querySelector<HTMLButtonElement>('button')!.click();
    await render();
    expect(api.scan).toHaveBeenCalledWith(ORG);
    expect(root.querySelector('[data-testid="scan-result"]')?.textContent).toContain(
      'Created 4 customers and linked 9 records. 2 matches are waiting for review.',
    );
  });

  it('filters on status', async () => {
    const { root, api, render } = await setup(CustomersList);
    const select = root.querySelector<HTMLSelectElement>('[data-testid="filter-status"]')!;
    select.value = 'prospect';
    select.dispatchEvent(new Event('change'));
    await render();
    expect(api.list).toHaveBeenLastCalledWith(
      ORG,
      expect.objectContaining({ status: ['prospect'] }),
    );
  });
});

describe('CustomerFormPage', () => {
  afterEach(() => document.body.replaceChildren());

  const type = async (root: HTMLElement, testId: string, value: string) => {
    const input = root.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('looks up a Norwegian org. number and fills only the empty fields', async () => {
    const { root, api, render } = await setup(CustomerFormPage);
    await type(root, 'name-input', 'Equinor');
    await type(root, 'orgnr-input', '923 609 016');
    await render();
    expect(api.registry).toHaveBeenCalledWith(ORG, '923609016');
    expect(root.querySelector<HTMLInputElement>('[data-testid="name-input"]')!.value).toBe(
      'Equinor',
    );
    expect(root.querySelector<HTMLInputElement>('[data-testid="city-input"]')!.value).toBe(
      'STAVANGER',
    );
    expect(root.querySelector('[data-testid="lookup-filled"]')?.textContent).toContain(
      'Retrieved from the Brønnøysund Register Centre',
    );
    root.querySelector<HTMLElement>('[data-testid="save-customer"] button')!.click();
    await render();
    expect(api.create).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({
        name: 'Equinor',
        org_number: '923609016',
        city: 'STAVANGER',
        registry: LOOKUP.registry,
      }),
    );
  });

  it('stays usable when the register is unavailable and warns about a failed checksum', async () => {
    const api = fakeApi();
    api.registry.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })) as never);
    const { root, render } = await setup(CustomerFormPage, { api });
    await type(root, 'orgnr-input', '999000001');
    await render();
    expect(root.querySelector('[data-testid="lookup-unavailable"]')?.textContent).toContain(
      'Could not get the details right now – fill them in yourself.',
    );
    expect(root.querySelector('[data-testid="orgnr-checksum"]')).not.toBeNull();
    await type(root, 'name-input', 'Fjord AS');
    root.querySelector<HTMLElement>('[data-testid="save-customer"] button')!.click();
    await render();
    expect(api.create).toHaveBeenCalledWith(ORG, expect.objectContaining({ name: 'Fjord AS' }));
  });

  it('says when the org. number is already a customer, and on a 409 links to it', async () => {
    const api = fakeApi();
    api.registry.mockReturnValue(
      of({
        ...LOOKUP,
        existing_customer: {
          id: 'c-7',
          code: 'CUS-0007',
          name: 'Equinor',
          status: 'active',
          deleted: false,
        },
      }),
    );
    api.create.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              detail: {
                code: 'customer_org_number_taken',
                customer: { id: 'c-7', code: 'CUS-0007', name: 'Equinor' },
              },
            },
          }),
      ) as never,
    );
    const { root, render } = await setup(CustomerFormPage, { api });
    await type(root, 'orgnr-input', '923609016');
    await render();
    expect(root.querySelector('[data-testid="lookup-existing"]')?.textContent).toContain(
      'Already registered: Equinor.',
    );
    root.querySelector<HTMLElement>('[data-testid="save-customer"] button')!.click();
    await render();
    const error = root.querySelector('[data-testid="form-error"]')!;
    expect(error.textContent).toContain('already registered as a customer');
    expect(error.querySelector('a')?.getAttribute('href')).toBe('/customers/c-7');
  });

  it('prefills from a supplier (?from_supplier=)', async () => {
    const { root, api, render } = await setup(CustomerFormPage, {
      query: { from_supplier: 's-4' },
    });
    await render();
    expect(api.supplier).toHaveBeenCalledWith(ORG, 's-4');
    expect(root.querySelector<HTMLInputElement>('[data-testid="name-input"]')!.value).toBe(
      'Nordlønn AS',
    );
    expect(api.registry).toHaveBeenCalledWith(ORG, '912345678');
  });
});

describe('CustomerDetailPage', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows the status sentence, the main information and the connected records', async () => {
    const { root } = await setup(CustomerDetailPage, { inputs: { id: 'c-1' } });
    const lead = root.querySelector('[data-testid="record-lead"]')!;
    expect(lead.querySelector('[data-testid="status-sentence"]')?.textContent).toContain(
      'Active customer – 2 open claims · contract renews in 45 days',
    );
    expect(lead.textContent).toContain('999 000 001');
    expect(lead.querySelector('[data-testid="also-supplier"]')?.getAttribute('href')).toBe(
      '/suppliers/s-4',
    );
    expect(lead.textContent).toContain('Ola Nordmann');
    const claims = root.querySelector('[data-testid="section-claims"]')!;
    expect(claims.textContent).toContain('Claims and complaints');
    expect(claims.textContent).toContain('AVV-0012');
    expect(
      claims.querySelector('[data-testid="section-all-claims"]')?.getAttribute('href'),
    ).toContain('/deviations?customer_id=c-1');
    expect(root.querySelector('[data-testid="customer-contacts"]')?.textContent).toContain(
      'Ola Nordmann',
    );
  });

  it('lists the follow-up to-dos', async () => {
    const { root } = await setup(CustomerDetailPage, { inputs: { id: 'c-1' } });
    const lines = [...root.querySelectorAll('[data-testid="record-missing-item"]')].map(
      (li) => li.textContent ?? '',
    );
    expect(lines.join(' | ')).toContain('1 customer match is waiting');
    expect(lines.join(' | ')).toContain('No customer owner');
  });

  it('asks the assistant for a customer status summary', async () => {
    const { fixture, ask } = await setup(CustomerDetailPage, { inputs: { id: 'c-1' } });
    (fixture.componentInstance as unknown as { askAi(k: string): void }).askAi('summarise');
    expect(ask.askAbout).toHaveBeenCalledWith(
      expect.stringContaining('Summarise the status of customer CUS-0001'),
    );
  });
});

describe('CustomerMatches', () => {
  afterEach(() => document.body.replaceChildren());

  const groups: MatchGroup[] = [
    {
      proposed: {
        id: 'c-1',
        code: 'CUS-0001',
        name: 'Fjord Industrier ASA',
        status: 'active',
        deleted: false,
      },
      proposed_name: 'Fjord Industrier ASA',
      items: [
        {
          id: 'm-1',
          field_key: 'feedback.item',
          entity_type: 'customer_feedback',
          entity_id: 'f-4',
          entity: {
            entity_type: 'customer_feedback',
            entity_id: 'f-4',
            title: 'Treg levering',
            code: 'TB-0004',
            url: '/feedback/items/f-4',
            status: null,
            module: 'feedback',
            label_key: null,
          },
          source_text: 'Fjord Industrier AS',
          source_org_number: null,
          proposed_customer_id: 'c-1',
          reason: 'same_core_name',
          score: 0.95,
          status: 'pending',
        },
      ],
    },
  ];

  it('explains each match in plain words and links it to the proposed customer', async () => {
    const api = fakeApi();
    api.matches.mockReturnValue(of(groups));
    const { root, render } = await setup(CustomerMatches, { api });
    const row = root.querySelector('[data-testid="match-row"]')!;
    expect(row.textContent).toContain('«Fjord Industrier AS»');
    expect(row.textContent).toContain('TB-0004');
    expect(row.querySelector('[data-testid="match-reason"]')?.textContent).toContain(
      'Same name, different spelling',
    );
    row.querySelector<HTMLElement>('[data-testid="match-accept"] button')!.click();
    await render();
    expect(api.accept).toHaveBeenCalledWith(ORG, 'm-1');
    expect(api.matches).toHaveBeenCalledTimes(2);
  });

  it('decides selected matches in bulk', async () => {
    const api = fakeApi();
    api.matches.mockReturnValue(of(groups));
    const { root, render } = await setup(CustomerMatches, { api });
    const box = root.querySelector<HTMLInputElement>(
      '[data-testid="match-row"] input[type="checkbox"]',
    )!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await render();
    root.querySelector<HTMLElement>('[data-testid="bulk-accept"] button')!.click();
    await render();
    expect(api.bulk).toHaveBeenCalledWith(ORG, ['m-1'], 'accept');
  });
});
