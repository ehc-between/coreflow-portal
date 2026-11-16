import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { countryName } from '../../shared/locale/countries';
import { resolveCountry } from '../../shared/ui/country-picker/country-picker';
import { invalidCountry } from './data/supplier-errors';
import { LocationOption, SupplierDetail } from './data/supplier.models';
import { locationsReviewed } from './supplier-edit';
import { SupplierForm, SupplierFormValue } from './supplier-form';

const OPTIONS: readonly LocationOption[] = [
  { code: 'EU', zone: 'eea', region: true },
  { code: 'EEA', zone: 'eea', region: true },
  { code: 'IE', zone: 'eea', region: false },
  { code: 'IR', zone: 'third_country', region: false },
  { code: 'NO', zone: 'eea', region: false },
  { code: 'GB', zone: 'adequacy', region: false },
  { code: 'US', zone: 'third_country', region: false },
];

function supplier(overrides: Partial<SupplierDetail> = {}): SupplierDetail {
  return {
    id: 's-1',
    code: 'SUP-0001',
    name: 'Nordic Cloud',
    category: 'it',
    criticality: 'high',
    status: 'approved',
    country: 'NO',
    processes_personal_data: true,
    has_system_access: false,
    provides_cloud_services: true,
    provides_ai: false,
    data_locations: ['IR'],
    data_location_details: [
      { code: 'IR', zone: 'third_country', needs_review: true, transfer_assessment_needed: true },
    ],
    certifications: [],
    ...overrides,
  } as unknown as SupplierDetail;
}

describe('country names and matching', () => {
  it('names codes in the active language', () => {
    expect(countryName('IE', 'en')).toBe('Ireland');
    expect(countryName('IE', 'nb')).toBe('Irland');
    expect(countryName('ie', 'en')).toBe('Ireland');
  });

  it('resolves typed names and codes to the offered code, never to a truncation', () => {
    const choices = ['IE', 'IR', 'GB', 'NO'].map((code) => ({
      code,
      name: countryName(code, 'nb'),
    }));
    const en = (c: string) => countryName(c, 'en');
    expect(resolveCountry('Ireland', choices, en)).toBe('IE');
    expect(resolveCountry('irland', choices, en)).toBe('IE');
    expect(resolveCountry('ie', choices, en)).toBe('IE');
    expect(resolveCountry('UK', choices, en)).toBe('GB');
    expect(resolveCountry('Irxland', choices, en)).toBeNull();
    expect(resolveCountry('Atlantis', choices, en)).toBeNull();
  });
});

describe('supplier data locations', () => {
  it('reads the rejected entries of an invalid_country error', () => {
    const err = new HttpErrorResponse({
      status: 422,
      error: { detail: { code: 'invalid_country', field: 'data_locations', values: ['Ireland'] } },
    });
    expect(invalidCountry(err)).toEqual({ field: 'data_locations', values: ['Ireland'] });
    expect(invalidCountry(new HttpErrorResponse({ status: 422, error: {} }))).toBeNull();
  });

  it('sends flagged locations on save so the review flag is cleared', () => {
    expect(locationsReviewed(supplier(), { name: 'X' }, ['IR'])).toEqual({
      name: 'X',
      data_locations: ['IR'],
    });
    expect(locationsReviewed(supplier({ data_location_details: [] }), {}, ['IR'])).toEqual({});
    expect(locationsReviewed(supplier(), { data_locations: ['IE'] }, ['IE'])).toEqual({
      data_locations: ['IE'],
    });
  });
});

describe('SupplierForm location picker', () => {
  async function render(fixture: ComponentFixture<unknown>) {
    fixture.detectChanges();
    await fixture.whenStable();
    await tick();
    fixture.detectChanges();
  }

  async function setup(value: SupplierDetail | null) {
    const { http } = configureKit(SupplierForm, { permissions: ['suppliers:write'] });
    const fixture = TestBed.createComponent(SupplierForm);
    fixture.componentRef.setInput('value', value);
    const emitted: SupplierFormValue[] = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));
    await render(fixture);
    http.expectOne((r) => r.url === kitUrl('suppliers/location-options')).flush({ items: OPTIONS });
    await render(fixture);
    return { fixture, emitted, el: fixture.nativeElement as HTMLElement };
  }

  function type(el: HTMLElement, text: string) {
    const input = el.querySelector<HTMLInputElement>('#sup-locs')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  }

  it('stores Ireland as IE and rejects text that is not a country', async () => {
    const { fixture, el, emitted } = await setup(supplier({ data_locations: [] }));
    type(el, 'Ireland');
    await render(fixture);
    expect(el.querySelector('[data-code="IE"]')?.textContent).toContain('Ireland');
    type(el, 'Irxland');
    await render(fixture);
    expect(el.textContent).toContain('"Irxland" is not a country on the list');

    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await render(fixture);
    expect(emitted[0].fields.data_locations).toEqual(['IE']);
  });

  it('flags legacy values for review and suggests a transfer assessment', async () => {
    const { el } = await setup(supplier());
    expect(el.querySelector('[data-testid="locations-review"]')).toBeTruthy();
    expect(el.querySelector('[data-code="IR"]')?.textContent).toContain('Check this value');
    expect(el.querySelector('[data-testid="locations-transfer"]')).toBeTruthy();
  });

  it('shows the field error from an invalid_country response', async () => {
    const { fixture, el } = await setup(supplier({ data_locations: [] }));
    fixture.componentRef.setInput('invalidCountry', {
      field: 'data_locations',
      values: ['Ireland'],
    });
    await render(fixture);
    expect(el.querySelector('[data-testid="locations-invalid"]')).toBeTruthy();
    expect(el.querySelector('#sup-locs')?.getAttribute('aria-invalid')).toBe('true');
  });
});
