import { DeviationDetail } from '../../core/deviations/deviation.models';
import { buildDeviationPatch, editFormFrom } from './deviation-edit';
import { toDeviationFilters } from './deviations-list';

const dev = {
  id: 'd1',
  code: 'KLG-1',
  title: 'Sprekk i sveis',
  type_id: 't1',
  standards: [],
  clauses: [],
  tags: [],
  severity: 'high',
  status: 'open',
  source: 'customer',
  raised_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  visibility: 'organization',
  data: {},
  actions: [],
  events: [],
  customer_id: 'cus-1',
} as unknown as DeviationDetail;

describe('deviation Kunde field (customer register)', () => {
  it('patches only a changed customer; clearing sends null', () => {
    const form = editFormFrom(dev);
    expect(buildDeviationPatch(dev, form)).toEqual({});
    expect(buildDeviationPatch(dev, { ...form, customerId: 'cus-2' })).toEqual({
      customer_id: 'cus-2',
    });
    expect(buildDeviationPatch(dev, { ...form, customerId: '' })).toEqual({ customer_id: null });
  });

  it('filters the list on ?customer_id=', () => {
    expect(toDeviationFilters('', { customer_id: 'cus-1' }).customer_id).toBe('cus-1');
    expect(toDeviationFilters('', {}).customer_id).toBeUndefined();
  });
});
