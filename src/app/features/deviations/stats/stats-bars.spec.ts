import { maxCount, recordToBuckets, toBars } from './stats-bars';

describe('stats-bars', () => {
  it('computes share of the bucket sum and rounds to whole percents', () => {
    const bars = toBars([
      { id: 'a', label: 'A', count: 3 },
      { id: 'b', label: 'B', count: 1 },
    ]);
    expect(bars.map((b) => b.percent)).toEqual([75, 25]);
  });

  it('drops zero-count buckets and sorts by count descending', () => {
    const bars = toBars([
      { id: 'a', label: 'A', count: 1 },
      { id: 'b', label: 'B', count: 0 },
      { id: 'c', label: 'C', count: 5 },
    ]);
    expect(bars.map((b) => b.id)).toEqual(['c', 'a']);
  });

  it('limits to topN when given', () => {
    const bars = toBars(
      [
        { id: 'a', label: 'A', count: 5 },
        { id: 'b', label: 'B', count: 4 },
        { id: 'c', label: 'C', count: 3 },
      ],
      2,
    );
    expect(bars.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('yields no bars (and no division) for an all-zero breakdown', () => {
    expect(toBars([{ id: 'a', label: 'A', count: 0 }])).toEqual([]);
  });

  it('maps a record to buckets via a label resolver', () => {
    const buckets = recordToBuckets({ open: 2, closed: 1 }, (k) => k.toUpperCase());
    expect(buckets).toEqual([
      { id: 'open', label: 'OPEN', count: 2 },
      { id: 'closed', label: 'CLOSED', count: 1 },
    ]);
  });

  it('finds the tallest count for trend scaling', () => {
    expect(maxCount([{ count: 2 }, { count: 7 }, { count: 4 }])).toBe(7);
    expect(maxCount([])).toBe(0);
  });
});
