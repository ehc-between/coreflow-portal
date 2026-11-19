import { assetDraftFrom, assetFieldsFrom } from './asset-form';
import { DEFAULT_ASSET_FILTERS, assetFiltersFromView, assetQuery } from './assets-list';

const CID = '6f1c2a3b-1111-4a2b-9c3d-123456789abc';

describe('assets: customer property', () => {
  it('filters the list by customer (`?customer_id=`)', () => {
    const filters = assetFiltersFromView({ customer_id: CID });
    expect(filters.customer).toBe(CID);
    expect(assetQuery('', filters, 0).customer_id).toBe(CID);
    expect(assetQuery('', DEFAULT_ASSET_FILTERS, 0).customer_id).toBeUndefined();
    expect(assetFiltersFromView({ customer_id: 'not-an-id' }).customer).toBe('');
  });

  it('sends the owning customer (empty = ours)', () => {
    const draft = { ...assetDraftFrom(null), name: 'Måleinstrument' };
    expect(assetFieldsFrom(draft).customer_id).toBeNull();
    expect(assetFieldsFrom({ ...draft, customer_id: CID }).customer_id).toBe(CID);
  });
});
