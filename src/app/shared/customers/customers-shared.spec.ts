import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import customersEn from '../../../assets/i18n/customers/en.json';
import { APP_CONFIG } from '../../core/config/app-config';
import { ModuleService } from '../../core/modules/module.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AlsoCustomer } from './also-customer';
import { CustomerChip } from './customer-chip';
import { CustomerPicker } from './customer-picker';
import { CustomerRef } from './customer.models';
import { customerIdFromRoute } from './customer-prefill';

const BASE = 'http://test/api';
const ORG = 'org-1';
const OPTIONS = `${BASE}/v1/orgs/${ORG}/customers/options`;

const REF: CustomerRef = {
  id: 'c-1',
  code: 'CUS-0001',
  name: 'Fjord Industrier ASA',
  status: 'active',
  deleted: false,
};

@Component({
  imports: [CustomerPicker, CustomerChip, AlsoCustomer],
  template: `
    <app-customer-picker
      inputId="pick"
      [value]="value()"
      [current]="current()"
      (valueChange)="value.set($event)"
    />
    <app-customer-chip [ref]="chip()" />
    <app-also-customer orgNumber="NO 912 345 678 MVA" />
  `,
})
class Host {
  readonly value = signal<string | null>(null);
  readonly current = signal<CustomerRef | null>(null);
  readonly chip = signal<CustomerRef | null>(REF);
}

function setup(opts: { enabled?: boolean; permissions?: readonly string[] } = {}) {
  const notifications = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [
      Host,
      TranslocoTestingModule.forRoot({
        langs: { en: { ...en, customers: customersEn } },
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
      { provide: NotificationService, useValue: notifications },
      {
        provide: ModuleService,
        useValue: {
          enabledKeys: signal(new Set(opts.enabled === false ? [] : ['customers'])).asReadonly(),
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
            permissions: opts.permissions ?? ['customers:read', 'customers:write'],
          }).asReadonly(),
        },
      },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  const root = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 250));
    await fixture.whenStable();
  };
  return { fixture, http, root, notifications, settle };
}

describe('shared customer components', () => {
  afterEach(() => document.body.replaceChildren());

  it('renders nothing when the customers module is off', async () => {
    const { fixture, root, http } = setup({ enabled: false });
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="customer-picker-input"]')).toBeNull();
    // The chip still names the customer, but without a link.
    expect(root.querySelector('a[data-testid="customer-chip"]')).toBeNull();
    expect(root.querySelector('[data-testid="customer-chip"]')?.textContent).toContain('Fjord');
    http.expectNone((r) => r.url.includes('/by-org-number/'));
  });

  it('searches as you type and selects a customer with the keyboard', async () => {
    const { fixture, http, root, settle } = setup();
    await fixture.whenStable();
    http.match((r) => r.url.includes('/by-org-number/')).forEach((r) => r.flush(null));
    const input = root.querySelector<HTMLInputElement>('[data-testid="customer-picker-input"]')!;
    input.value = 'fjo';
    input.dispatchEvent(new Event('input'));
    await settle();
    const req = http.expectOne((r) => r.url === OPTIONS);
    expect(req.request.params.get('q')).toBe('fjo');
    req.flush([{ ...REF, org_number: '999000001' }]);
    await fixture.whenStable();
    const rows = root.querySelectorAll('[role="option"]');
    // "No customer", the match, and "Create the customer “fjo”".
    expect(rows.length).toBe(3);
    expect(rows[2].textContent).toContain('Create the customer “fjo”');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('c-1');
    expect(input.value).toBe('Fjord Industrier ASA');
  });

  it('quick-creates a customer from the typed name', async () => {
    const { fixture, http, root, settle, notifications } = setup();
    await fixture.whenStable();
    http.match((r) => r.url.includes('/by-org-number/')).forEach((r) => r.flush(null));
    const input = root.querySelector<HTMLInputElement>('[data-testid="customer-picker-input"]')!;
    input.value = 'Ny Kunde AS';
    input.dispatchEvent(new Event('input'));
    await settle();
    http.expectOne((r) => r.url === OPTIONS).flush([]);
    await fixture.whenStable();
    root.querySelector<HTMLElement>('[data-testid="customer-option-create"]')!.click();
    const post = http.expectOne((r) => r.method === 'POST');
    expect(post.request.body).toEqual({ name: 'Ny Kunde AS', status: 'active' });
    post.flush({ id: 'c-9', code: 'CUS-0009', name: 'Ny Kunde AS', status: 'active' });
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('c-9');
    expect(notifications.success).toHaveBeenCalledWith('customers.ref.created', {
      name: 'Ny Kunde AS',
    });
  });

  it('offers no quick create without customers:write, and looks up a prefilled id', async () => {
    const { fixture, http, root, settle } = setup({ permissions: ['customers:read'] });
    http.match((r) => r.url.includes('/by-org-number/')).forEach((r) => r.flush(null));
    fixture.componentInstance.value.set('c-1');
    await settle();
    const req = http.expectOne((r) => r.url === OPTIONS);
    expect(req.request.params.get('include_id')).toBe('c-1');
    req.flush([{ ...REF, org_number: null }]);
    await fixture.whenStable();
    const input = root.querySelector<HTMLInputElement>('[data-testid="customer-picker-input"]')!;
    expect(input.value).toBe('Fjord Industrier ASA');
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await settle();
    http.expectOne((r) => r.url === OPTIONS).flush([]);
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="customer-option-create"]')).toBeNull();
  });

  it('links the chip for readers, marks deleted customers and shows "–" for none', async () => {
    const { fixture, root, http } = setup();
    await fixture.whenStable();
    expect(root.querySelector('a[data-testid="customer-chip"]')?.getAttribute('href')).toBe(
      '/customers/c-1',
    );
    fixture.componentInstance.chip.set({ ...REF, deleted: true });
    await fixture.whenStable();
    expect(root.querySelector('a[data-testid="customer-chip"]')).toBeNull();
    expect(root.querySelector('[data-testid="customer-chip-deleted"]')?.textContent).toContain(
      '(deleted)',
    );
    fixture.componentInstance.chip.set(null);
    await fixture.whenStable();
    expect(root.querySelector('app-customer-chip')?.textContent?.trim()).toBe('–');
    http.match(() => true).forEach((r) => r.flush(null));
  });

  it('shows "Also a customer" on a supplier with the same org. number', async () => {
    const { fixture, http, root } = setup();
    await fixture.whenStable();
    http
      .expectOne(`${BASE}/v1/orgs/${ORG}/customers/by-org-number/912345678`)
      .flush({ ...REF, code: 'CUS-0004' });
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="also-customer"]')?.textContent).toContain(
      'Also a customer: CUS-0004',
    );
  });

  it('reads ?customer_id= for new-forms', () => {
    const route = (q: string | null) =>
      ({ snapshot: { queryParamMap: { get: () => q } } }) as never;
    expect(customerIdFromRoute(route('3f2b9c1e-0000-4000-8000-000000000001'))).toBe(
      '3f2b9c1e-0000-4000-8000-000000000001',
    );
    expect(customerIdFromRoute(route('<script>'))).toBeNull();
    expect(customerIdFromRoute(route(null))).toBeNull();
  });
});
