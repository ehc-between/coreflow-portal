import { emptyPlanForm, planFormToInput, planPrefill } from '../plans/plan-form';

const CID = '6f1c2a3b-1111-4a2b-9c3d-123456789abc';

function params(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

describe('audit plan: Kunde field (customer audits)', () => {
  it('?customer_id= opens an external audit by that customer', () => {
    const prefill = planPrefill(params({ customer_id: CID }), null);
    expect(prefill.kind).toBe('external');
    expect(prefill.partyType).toBe('customer');
    expect(prefill.customerId).toBe(CID);
  });

  it('sends the customer only for an external audit by a customer', () => {
    const base = { ...emptyPlanForm(), title: 'Kunderevisjon', customerId: CID };
    expect(
      planFormToInput({ ...base, kind: 'external', partyType: 'customer' }, false).customer_id,
    ).toBe(CID);
    expect(
      planFormToInput({ ...base, kind: 'external', partyType: 'supplier' }, false).customer_id,
    ).toBeNull();
    expect(planFormToInput({ ...base, kind: 'internal' }, false).customer_id).toBeNull();
  });
});
