import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { privacyError } from './data/privacy-errors';
import { createBody } from './data/privacy-form-model';
import { REGISTERS } from './data/privacy-registers';
import { ProcessorDpaCoverage } from './processor-dpa-coverage';
import { PrivacyRegisterEdit } from './register-edit';

async function render(fixture: ComponentFixture<unknown>) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick();
  fixture.detectChanges();
}

const toasts = () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() });

function flushSide(http: HttpTestingController) {
  for (const req of http.match((r) => r.url === kitUrl('attachments'))) {
    req.flush([]);
  }
  for (const req of http.match(
    (r) => r.url.startsWith(kitUrl('privacy/')) && r.params.get('limit') === '200',
  )) {
    req.flush({ items: [], total: 0 });
  }
}

describe('transfer safeguards', () => {
  it('asks for the signed agreement for SCC, BCR and other tools, not for adequacy', () => {
    const field = REGISTERS.transfer.fields.find((f) => f.key === 'contract_id')!;
    expect(field.kind).toBe('contract');
    expect(field.showIf?.({ mechanism: 'sccs' })).toBe(true);
    expect(field.showIf?.({ mechanism: 'bcrs' })).toBe(true);
    expect(field.showIf?.({ mechanism: 'adequacy' })).toBe(false);
    expect(field.showIf?.({ mechanism: 'derogation' })).toBe(false);
    // A hidden agreement is not sent with an adequacy transfer.
    expect(
      createBody(REGISTERS.transfer, {
        title: 'Hosting',
        destination_country: 'US',
        mechanism: 'adequacy',
        contract_id: 'c-1',
      }),
    ).not.toHaveProperty('contract_id');
  });

  it('explains an SCC activation the backend refused', () => {
    const refused = (code: string) =>
      privacyError(
        new HttpErrorResponse({ status: 422, error: { detail: { code, field: 'contract_id' } } }),
      );
    expect(refused('scc_contract_required')).toEqual({
      key: 'privacy.errors.scc_contract_required',
      fields: ['contract_id'],
    });
    expect(refused('scc_contract_unsigned').key).toBe('privacy.errors.scc_contract_unsigned');
  });

  it('links the agreement picked from the contract register when creating a transfer', async () => {
    const { http } = configureKit(PrivacyRegisterEdit, {
      permissions: ['privacy:read', 'privacy:write', 'contracts:read'],
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: toasts() },
      ],
    });
    const fixture = TestBed.createComponent(PrivacyRegisterEdit);
    fixture.componentRef.setInput('register', 'transfer');
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);

    const set = (testid: string, value: string, event = 'input') => {
      const input = el.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[data-testid="field-${testid}"]`,
      )!;
      input.value = value;
      input.dispatchEvent(new Event(event));
    };
    set('title', 'Support desk in the US');
    set('destination_country', 'US');
    set('mechanism', 'sccs', 'change');
    await render(fixture);
    flushSide(http);
    const contracts = http.expectOne((r) => r.url === kitUrl('contracts'));
    expect(contracts.request.params.get('limit')).toBe('200');
    contracts.flush({
      items: [
        { id: 'c-9', code: 'CT-0009', title: 'SCCs', contract_type: 'dpa', status: 'active' },
      ],
      total: 1,
    });
    await render(fixture);
    const picker = el.querySelector<HTMLSelectElement>('[data-testid="field-contract_id"]')!;
    expect(picker.textContent).toContain('CT-0009 · SCCs');
    set('contract_id', 'c-9', 'change');
    await render(fixture);

    el.querySelector<HTMLElement>('[data-testid="privacy-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('privacy/transfers'));
    expect(req.request.body).toMatchObject({ mechanism: 'sccs', contract_id: 'c-9' });
    req.flush(
      { detail: { code: 'scc_contract_unsigned', field: 'contract_id' } },
      { status: 422, statusText: 'Unprocessable' },
    );
    await render(fixture);
    expect(el.querySelector('[data-testid="form-error"]')?.textContent).toContain(
      'privacy.errors.scc_contract_unsigned',
    );
  });
});

describe('ProcessorDpaCoverage', () => {
  it('shows an incomplete agreement with its missing clauses, never as covered', async () => {
    const { http } = configureKit(ProcessorDpaCoverage, { permissions: ['privacy:read'] });
    const fixture = TestBed.createComponent(ProcessorDpaCoverage);
    fixture.componentRef.setInput('processorId', 'p-1');
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    http.expectOne(kitUrl('privacy/processors/p-1/dpa-coverage')).flush({
      status: 'incomplete',
      missing_clauses: ['sub_processors'],
      contracts: [
        {
          id: 'c-2',
          code: 'CT-0002',
          title: 'Draft DPA',
          contract_type: 'dpa',
          status: 'draft',
          signed: false,
          dpa_status: 'incomplete',
          missing_clauses: ['sub_processors'],
          unconfirmed_clauses: [],
          reasons: ['unsigned', 'clauses_missing'],
          url: '/contracts/c-2',
        },
      ],
    });
    await render(fixture);
    expect(el.querySelector('[data-testid="dpa-coverage-status"]')?.textContent).toContain(
      'privacy.dpaCoverage.status.incomplete',
    );
    expect(el.querySelector('[data-testid="dpa-coverage-missing"]')?.textContent).toContain(
      'privacy.dpaClauses.sub_processors',
    );
    const contracts = el.querySelector('[data-testid="dpa-coverage-contracts"]')!;
    expect(contracts.textContent).toContain('CT-0002');
    expect(contracts.textContent).toContain('privacy.dpaCoverage.reasons.unsigned');
    expect(contracts.querySelector('a')?.getAttribute('href')).toBe('/contracts/c-2');
  });
});
