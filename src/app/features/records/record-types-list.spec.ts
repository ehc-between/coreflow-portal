import { filterAndSort } from './record-types-list';

const items = [
  { name: 'Complaint', key: 'complaint', module: 'feedback', updated_at: '2026-01-02T00:00:00' },
  { name: 'Audit finding', key: 'finding', module: 'audits', updated_at: '2026-01-05T00:00:00' },
  { name: 'Nonconformity', key: 'nc', module: 'deviations', updated_at: '2026-01-01T00:00:00' },
];

describe('filterAndSort', () => {
  it('sorts by name or by most recently updated', () => {
    expect(
      filterAndSort(items, { search: '', module: '', sort: 'name' }).map((i) => i.key),
    ).toEqual(['finding', 'complaint', 'nc']);
    expect(
      filterAndSort(items, { search: '', module: '', sort: 'updated' }).map((i) => i.key),
    ).toEqual(['finding', 'complaint', 'nc']);
  });

  it('filters by module and searches name and key', () => {
    expect(filterAndSort(items, { search: '', module: 'deviations', sort: 'name' })).toHaveLength(
      1,
    );
    expect(
      filterAndSort(items, { search: 'NC', module: '', sort: 'name' }).map((i) => i.key),
    ).toEqual(['nc']);
    expect(filterAndSort(items, { search: 'compl', module: '', sort: 'name' })).toHaveLength(1);
  });
});
