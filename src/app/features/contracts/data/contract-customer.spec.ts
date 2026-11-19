import { makeContract } from '../contracts.testing';
import {
  emptyContractForm,
  formFromContract,
  formFromPrefill,
  toCreateRequest,
  toUpdateRequest,
} from './contract-form-model';

const ref = {
  id: 'cus-1',
  code: 'CUS-0001',
  name: 'Fjord AS',
  status: 'active',
  deleted: false,
} as const;

describe('contract Kunde field (customer register)', () => {
  it('sends the customer on create only when set', () => {
    const blank = { ...emptyContractForm(), title: 'Avtale' };
    expect(toCreateRequest(blank).customer_id).toBeUndefined();
    expect(toCreateRequest({ ...blank, customer_id: 'cus-1' }).customer_id).toBe('cus-1');
  });

  it('patches a changed or cleared customer, and nothing when unchanged', () => {
    const form = formFromContract(makeContract({ customer_id: 'cus-1', customer: ref }));
    expect(form.customer).toEqual(ref);
    expect(toUpdateRequest(form, form, '')).toEqual({});
    expect(toUpdateRequest(form, { ...form, customer_id: 'cus-2' }, '').customer_id).toBe('cus-2');
    expect(toUpdateRequest(form, { ...form, customer_id: '' }, '').customer_id).toBeNull();
  });

  it('takes the customer from the customer card flow prefill', () => {
    const next = formFromPrefill(emptyContractForm(), {
      customer_id: 'cus-1',
      customer: ref,
      contract_type: 'dpa',
      personal_data_role: 'we_process',
    });
    expect(next.customer_id).toBe('cus-1');
    expect(next.customer).toEqual(ref);
    expect(next.contract_type).toBe('dpa');
    expect(next.personal_data_role).toBe('we_process');
  });
});
