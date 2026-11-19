import { createBody, prefillValues, withCustomerRole } from './privacy-form-model';
import { REGISTERS } from './privacy-registers';

const CID = '6f1c2a3b-1111-4a2b-9c3d-123456789abc';

describe('privacy: Kunde fields', () => {
  it('a ROPA entry opened for a customer is processing as processor', () => {
    const values = withCustomerRole(REGISTERS.ropa, {
      ...prefillValues(REGISTERS.ropa, { customer_id: CID }),
      role: 'controller',
    });
    expect(values['role']).toBe('processor');
    expect(values['customer_id']).toBe(CID);
    expect(withCustomerRole(REGISTERS.breach, { customer_id: CID })).toEqual({
      customer_id: CID,
    });
  });

  it('sends the customers a breach affects as an id list', () => {
    const body = createBody(REGISTERS.breach, {
      title: 'Feilsendt lønnsfil',
      customer_ids: [CID],
    });
    expect(body['customer_ids']).toEqual([CID]);
  });
});
