/** A single horizontal bar: a translated/plain label, its count and share %. */
export interface StatBar {
  /** Stable identity for the bucket (used for drill-down + tracking). */
  readonly id: string;
  /** Display label (already resolved to a name or i18n-ready key by the host). */
  readonly label: string;
  readonly count: number;
  /** Share of the total as a 0–100 percentage, rounded to a whole number. */
  readonly percent: number;
}

/** A raw bucket before its share is computed. */
export interface RawBucket {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

/**
 * Turns raw buckets into bars with a share-of-total percentage. The denominator
 * is the sum of the buckets' counts (not the deviation total), so a breakdown's
 * bars always sum to ~100%. Zero-count buckets are dropped; the result is sorted
 * by count descending and limited to `topN` when given.
 */
export function toBars(buckets: readonly RawBucket[], topN?: number): readonly StatBar[] {
  const present = buckets.filter((b) => b.count > 0);
  const sum = present.reduce((acc, b) => acc + b.count, 0);
  const bars = present
    .map((b) => ({
      id: b.id,
      label: b.label,
      count: b.count,
      percent: sum === 0 ? 0 : Math.round((b.count / sum) * 100),
    }))
    .sort((a, b) => b.count - a.count);
  return topN != null ? bars.slice(0, topN) : bars;
}

/** Convenience: buckets from a `Record<string, number>` keyed breakdown. */
export function recordToBuckets(
  record: Record<string, number>,
  label: (key: string) => string,
): readonly RawBucket[] {
  return Object.entries(record).map(([key, count]) => ({ id: key, label: label(key), count }));
}

/** The tallest count across trend buckets, used to scale the trend bars. */
export function maxCount(buckets: readonly { readonly count: number }[]): number {
  return buckets.reduce((max, b) => Math.max(max, b.count), 0);
}
