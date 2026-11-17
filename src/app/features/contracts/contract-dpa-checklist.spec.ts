import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import {
  ContractDpaChecklist,
  aiClauseFindings,
  clauseChanges,
  draftsFrom,
  waiversWithoutReason,
} from './contract-dpa-checklist';
import { makeContract } from './contracts.testing';
import { Contract, DPA_CLAUSE_KEYS, DpaChecklistItem } from './data/contract.models';
import { dpaTone } from './data/contract-display';

function item(key: string, overrides: Partial<DpaChecklistItem> = {}): DpaChecklistItem {
  return {
    key,
    label: key,
    state: 'unknown',
    note: null,
    source: null,
    updated_at: null,
    ...overrides,
  };
}

function checklist(overrides: Readonly<Record<string, Partial<DpaChecklistItem>>> = {}) {
  return DPA_CLAUSE_KEYS.map((k) => item(k, overrides[k] ?? {}));
}

function dpaContract(overrides: Partial<Contract['dpa']> = {}, rest: Partial<Contract> = {}) {
  return makeContract({
    contract_type: 'dpa',
    status: 'draft',
    signed_date: null,
    allowed_actions: [],
    dpa: {
      required: false,
      status: 'incomplete',
      linked_dpa_ids: [],
      covering_ids: [],
      evaluated_id: 'c-1',
      signed: false,
      missing_clauses: ['sub_processors'],
      unconfirmed_clauses: [],
      reasons: ['unsigned', 'clauses_missing'],
      checklist: checklist({
        sub_processors: { state: 'missing', source: 'ai' },
        audits_and_information: { state: 'present', source: 'ai', note: 'Clause 9' },
      }),
      ...overrides,
    },
    ...rest,
  });
}

describe('DPA checklist helpers', () => {
  it('sends only rows a person changed or confirmed, always as the person', () => {
    const items = checklist({
      confidentiality: { state: 'present', source: 'user' },
      sub_processors: { state: 'missing', source: 'ai' },
      audits_and_information: { state: 'present', source: 'ai' },
    });
    const drafts = {
      ...draftsFrom(items),
      security_measures: { state: 'present' as const, note: '' },
    };
    const out = clauseChanges(items, drafts, new Set(['audits_and_information']));
    expect(out).toEqual([
      { key: 'security_measures', state: 'present', note: null, source: 'user' },
      { key: 'audits_and_information', state: 'present', note: null, source: 'user' },
    ]);
    // Unassessed and unchanged rows (including unconfirmed suggestions) are never sent.
    expect(clauseChanges(items, draftsFrom(items), new Set())).toEqual([]);
  });

  it('requires a reason for a waiver', () => {
    const drafts = {
      sub_processors: { state: 'waived' as const, note: '  ' },
      audits_and_information: { state: 'waived' as const, note: 'Covered by ISO 27001 audit' },
    };
    expect(waiversWithoutReason(drafts)).toEqual(['sub_processors']);
  });

  it('turns assistant findings into unconfirmed entries without overriding a person', () => {
    const items = checklist({ confidentiality: { state: 'present', source: 'user' } });
    const out = aiClauseFindings(items, [
      { key: 'confidentiality', present: false },
      { key: 'sub_processors', present: false, note: ' no sub-processor terms ' },
      { key: 'sub_processors', present: true },
      { key: 'made_up', present: false },
      { key: 'audits_and_information', present: true },
    ]);
    expect(out).toEqual([
      { key: 'sub_processors', state: 'missing', note: 'no sub-processor terms', source: 'ai' },
      { key: 'audits_and_information', state: 'present', note: null, source: 'ai' },
    ]);
    // The assistant can never waive.
    expect(out.every((c) => c.state !== 'waived')).toBe(true);
  });

  it('shows incomplete as a warning, never as covered', () => {
    expect(dpaTone('incomplete')).toBe('warn');
    expect(dpaTone('covered')).toBe('pass');
    expect(dpaTone('missing')).toBe('fail');
  });
});

describe('ContractDpaChecklist', () => {
  async function render(fixture: ComponentFixture<unknown>) {
    fixture.detectChanges();
    await fixture.whenStable();
    await tick();
    fixture.detectChanges();
  }

  function setup(contract: Contract) {
    const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const { http } = configureKit(ContractDpaChecklist, {
      permissions: ['contracts:read', 'contracts:write'],
      providers: [{ provide: NotificationService, useValue: notify }],
    });
    const fixture = TestBed.createComponent(ContractDpaChecklist);
    fixture.componentRef.setInput('contract', contract);
    return { http, fixture, notify, el: fixture.nativeElement as HTMLElement };
  }

  const url = kitUrl('contracts/c-1/dpa-clauses');

  it('marks assistant findings as suggestions and confirms them as the person', async () => {
    const { http, fixture, el } = setup(dpaContract());
    await render(fixture);
    expect(el.querySelector('[data-testid="dpa-checklist-status"]')?.textContent).toContain(
      'incomplete',
    );
    expect(el.querySelector('[data-testid="dpa-suggestions"]')).toBeTruthy();
    expect(
      (el.querySelector('[data-testid="dpa-save"] button') as HTMLButtonElement).disabled,
    ).toBe(true);

    el.querySelector<HTMLElement>('[data-testid="dpa-suggestions"] button')!.click();
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="dpa-save"] button')!.click();
    const req = http.expectOne((r) => r.url === url && r.method === 'PUT');
    expect(req.request.body.clauses).toEqual([
      { key: 'sub_processors', state: 'missing', note: null, source: 'user' },
      { key: 'audits_and_information', state: 'present', note: 'Clause 9', source: 'user' },
    ]);
    req.flush(dpaContract());
    http.verify();
  });

  it('does not save a waiver without a reason', async () => {
    const { http, fixture, el } = setup(dpaContract());
    await render(fixture);
    const select = el.querySelector<HTMLSelectElement>('[data-testid="dpa-state-sub_processors"]')!;
    select.value = 'waived';
    select.dispatchEvent(new Event('change'));
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="dpa-save"] button')!.click();
    await render(fixture);
    http.expectNone(url);
    expect(el.textContent).toContain('contracts.errors.waiver_reason_required');

    const note = el.querySelector<HTMLInputElement>('[data-testid="dpa-note-sub_processors"]')!;
    note.value = 'Single-tenant service, no sub-processors';
    note.dispatchEvent(new Event('input'));
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="dpa-save"] button')!.click();
    const req = http.expectOne(url);
    expect(req.request.body.clauses).toEqual([
      {
        key: 'sub_processors',
        state: 'waived',
        note: 'Single-tenant service, no sub-processors',
        source: 'user',
      },
    ]);
    req.flush(dpaContract());
  });

  it('creates a negotiation task for the missing clauses', async () => {
    const { http, fixture, el, notify } = setup(dpaContract());
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="dpa-negotiation-task"] button')!.click();
    const req = http.expectOne((r) => r.url === kitUrl('contracts/c-1/obligations'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body.priority).toBe('high');
    expect(req.request.body.description).toContain('contracts.dpaClauses.sub_processors');
    req.flush({ id: 't-1' });
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('contracts.notices.negotiationTaskAdded');
  });

  it('is read-only on a closed contract or without edit rights', async () => {
    const { fixture, el } = setup(dpaContract({}, { status: 'expired' }));
    await render(fixture);
    expect(el.querySelector('[data-testid="dpa-save"]')).toBeNull();
    expect(el.querySelector('[data-testid="dpa-state-sub_processors"]')).toBeNull();
  });
});
