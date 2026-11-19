import {
  applySeed,
  emptyObligationForm,
  seedFromPrefill,
  toCreateRequest,
  toUpdateRequest,
} from './obligation-form-model';

const CID = '6f1c2a3b-1111-4a2b-9c3d-123456789abc';

describe('obligation: Kunde field (customer requirements)', () => {
  it('takes the customer from a create flow and sends it on create', () => {
    const form = applySeed(
      emptyObligationForm(),
      seedFromPrefill({ customer_id: CID, obligation_type: 'contract', issuer: 'Fjord' }),
    );
    expect(form.customer_id).toBe(CID);
    expect(form.obligation_type).toBe('contract');
    expect(toCreateRequest({ ...form, title: 'ISO 14001-sertifikat' }).customer_id).toBe(CID);
  });

  it('keeps a customer the user already chose and clears with null on update', () => {
    const chosen = { ...emptyObligationForm(), customer_id: 'other' };
    expect(applySeed(chosen, { customer_id: CID }).customer_id).toBe('other');
    const original = { ...emptyObligationForm(), title: 'Krav', customer_id: CID };
    const body = toUpdateRequest(original, { ...original, customer_id: '' }, '');
    expect(body.customer_id).toBeNull();
  });
});
