import { HttpErrorResponse } from '@angular/common/http';
import { makeContract } from '../contracts.testing';
import { extractionChanges, isReadableFile } from '../contract-ai-panel';
import { actionInputs, proposedRenewalEnd } from '../contract-workflow-bar';
import { statusesForFilter } from '../contracts-list';
import { contractListParams } from './contracts-api';
import {
  actionVariant,
  contractStatusKey,
  contractStatusTone,
  daysUntil,
  deadlineKindKey,
  dpaTone,
  isClosedContract,
} from './contract-display';
import { contractErrorKey } from './contract-errors';
import {
  applyExtraction,
  emptyContractForm,
  emptyParty,
  formFromContract,
  normaliseAmount,
  toCreateRequest,
  toUpdateRequest,
  validateContractForm,
} from './contract-form-model';
import { obligationFromExtraction } from './obligations';

describe('contract form model', () => {
  it('builds a create request with nulls for empty fields and only named parties', () => {
    const body = toCreateRequest({
      ...emptyContractForm(),
      title: '  Hosting ',
      contract_type: 'supplier',
      value_amount: '1 200,50',
      currency: 'nok',
      notice_period_days: '90',
      parties: [emptyParty({ name: 'Acme', is_internal: true }), emptyParty()],
    });
    expect(body.title).toBe('Hosting');
    expect(body.value_amount).toBe('1200.50');
    expect(body.currency).toBe('NOK');
    expect(body.notice_period_days).toBe(90);
    expect(body.end_date).toBeNull();
    expect(body.owner_user_id).toBeUndefined();
    expect(body.parties).toEqual([
      {
        name: 'Acme',
        role: 'other',
        is_internal: true,
        org_number: null,
        contact_name: null,
        contact_email: null,
      },
    ]);
  });

  it('sends only the changed fields on update, with the change reason', () => {
    const original = formFromContract(makeContract());
    const body = toUpdateRequest(original, { ...original, end_date: '2027-12-31' }, ' Extended ');
    expect(body).toEqual({ end_date: '2027-12-31', change_reason: 'Extended' });
    expect(toUpdateRequest(original, original, '')).toEqual({});
  });

  it('validates title, dates, amount, currency and whole numbers', () => {
    const errors = validateContractForm({
      ...emptyContractForm(),
      start_date: '2026-05-01',
      end_date: '2026-01-01',
      value_amount: 'abc',
      currency: 'NO',
      notice_period_days: '1.5',
    });
    expect(Object.keys(errors).sort()).toEqual(
      ['currency', 'end_date', 'notice_period_days', 'title', 'value_amount'].sort(),
    );
    expect(normaliseAmount('10,5')).toBe('10.5');
    expect(normaliseAmount('10.555')).toBeNull();
  });

  it('applies an extraction without overwriting what the user typed', () => {
    const next = applyExtraction(
      { ...emptyContractForm(), title: 'My title', parties: [emptyParty({ name: 'Acme' })] },
      {
        title: 'Extracted title',
        contract_type: 'dpa',
        start_date: '2026-01-01',
        end_date: 'soon',
        notice_period_days: 30,
        currency: 'eur',
        auto_renew: true,
        parties: [
          { name: 'acme', role: 'controller' },
          { name: 'Cloudy AS', role: 'processor', org_number: '123' },
        ],
      },
    );
    expect(next.title).toBe('My title');
    expect(next.contract_type).toBe('customer');
    expect(next.start_date).toBe('2026-01-01');
    expect(next.end_date).toBe('');
    expect(next.notice_period_days).toBe('30');
    expect(next.currency).toBe('EUR');
    expect(next.auto_renew).toBe(true);
    expect(next.parties.map((p) => p.name)).toEqual(['Acme', 'Cloudy AS']);
    expect(next.parties[1].role).toBe('processor');
  });
});

describe('contract display helpers', () => {
  it('maps statuses, kinds and DPA states to keys and tones', () => {
    expect(contractStatusKey('in_review')).toBe('contracts.status.in_review');
    expect(contractStatusKey('weird')).toBe('contracts.status.unknown');
    expect(contractStatusTone('active')).toBe('pass');
    expect(deadlineKindKey('notice_deadline')).toBe('contracts.deadlineKinds.notice_deadline');
    expect(deadlineKindKey('custom')).toBe('contracts.deadlineKinds.other');
    expect(dpaTone('missing')).toBe('fail');
    expect(isClosedContract('terminated')).toBe(true);
    expect(isClosedContract('active')).toBe(false);
    expect(actionVariant('terminate')).toBe('danger');
  });

  it('counts days to a date', () => {
    const today = new Date(2026, 10, 12);
    expect(daysUntil('2026-11-15', today)).toBe(3);
    expect(daysUntil('2026-11-10', today)).toBe(-2);
    expect(daysUntil(null, today)).toBeNull();
  });

  it('maps coded errors to scoped keys', () => {
    const coded = new HttpErrorResponse({
      status: 409,
      error: { detail: { code: 'contract_closed', message: 'Closed' } },
    });
    expect(contractErrorKey(coded)).toBe('contracts.errors.contract_closed');
    expect(contractErrorKey(new HttpErrorResponse({ status: 403 }))).toBe(
      'contracts.errors.forbidden',
    );
    expect(contractErrorKey(new HttpErrorResponse({ status: 500 }))).toBe('errors.server');
  });
});

describe('contract list and workflow helpers', () => {
  it('builds csv query params and drops empty values', () => {
    expect(
      contractListParams({
        q: ' cloud ',
        status: ['draft', 'active'],
        type: [],
        owner: 'me',
        sort: 'end_date',
        limit: 25,
        offset: 0,
      }),
    ).toEqual({
      q: 'cloud',
      status: 'draft,active',
      type: undefined,
      owner: 'me',
      expiring_within_days: undefined,
      processes_personal_data: undefined,
      sort: 'end_date',
      limit: 25,
      offset: 0,
    });
    expect(statusesForFilter('open')).toEqual(['draft', 'in_review', 'approved', 'active']);
    expect(statusesForFilter('all')).toEqual([]);
    expect(statusesForFilter('expired')).toEqual(['expired']);
  });

  it('knows which inputs each action needs', () => {
    expect(actionInputs('reject')).toEqual({ note: 'required', date: null });
    expect(actionInputs('terminate')).toEqual({ note: 'required', date: 'effective' });
    expect(actionInputs('renew')).toEqual({ note: 'optional', date: 'newEnd' });
  });

  it('proposes the renewed end date from the renewal term', () => {
    expect(
      proposedRenewalEnd(makeContract({ end_date: '2026-12-31', renewal_term_months: 12 })),
    ).toBe('2027-12-31');
    expect(
      proposedRenewalEnd(makeContract({ end_date: '2026-01-31', renewal_term_months: 1 })),
    ).toBe('2026-02-28');
    expect(proposedRenewalEnd(makeContract({ renewal_term_months: null }))).toBe('');
  });
});

describe('contract AI helpers', () => {
  it('turns an extraction into changes for empty fields and new parties only', () => {
    const contract = makeContract({ governing_law: null, review_date: null, auto_renew: true });
    const { update, parties } = extractionChanges(contract, {
      title: 'Other title',
      governing_law: 'Sweden',
      end_date: '2030-01-01',
      auto_renew: false,
      parties: [{ name: 'Cloudy AS' }, { name: 'New Sub AS', role: 'sub_processor' }],
    });
    expect(update).toEqual({ governing_law: 'Sweden' });
    expect(parties).toEqual([
      { name: 'New Sub AS', role: 'sub_processor', is_internal: false, org_number: null },
    ]);
  });

  it('recognises files the analysis can read', () => {
    const file = (filename: string, content_type: string) =>
      ({ filename, content_type }) as Parameters<typeof isReadableFile>[0];
    expect(isReadableFile(file('a.pdf', 'application/pdf'))).toBe(true);
    expect(isReadableFile(file('a.txt', 'text/plain'))).toBe(true);
    expect(isReadableFile(file('a.docx', 'application/msword'))).toBe(false);
  });

  it('maps an extracted obligation to an obligation task', () => {
    expect(
      obligationFromExtraction({
        title: 'Quarterly report',
        party: 'Supplier',
        due_date: '2026-03-31',
        recurring: 'quarterly',
      }),
    ).toEqual({
      title: 'Quarterly report',
      description: 'Supplier · quarterly',
      due_at: '2026-03-31T23:59:59',
    });
    expect(obligationFromExtraction({ title: 'X', due_date: 'monthly' }).due_at).toBeNull();
  });
});
