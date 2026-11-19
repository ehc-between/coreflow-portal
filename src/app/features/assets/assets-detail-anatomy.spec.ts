import { describe, expect, it } from 'vitest';
import en from '../../../assets/i18n/assets/en.json';
import nb from '../../../assets/i18n/assets/nb.json';
import { reviewMissing, reviewStatusLine } from './access-reviews/access-review-detail';
import { assetMissing, assetStatusLine } from './asset-detail';
import { AccessReviewDetail, AssetDetail } from './data/asset.models';

function asset(over: Partial<AssetDetail> = {}): AssetDetail {
  return {
    lifecycle_status: 'in_use',
    requires_calibration: false,
    calibration_status: null,
    review_status: 'ok',
    last_reviewed_at: '2026-01-01T00:00:00Z',
    description: 'A system',
    attention: [],
    ...over,
  } as unknown as AssetDetail;
}

function review(over: Partial<AccessReviewDetail> = {}): AccessReviewDetail {
  return {
    status: 'in_progress',
    can_work: true,
    can_manage: true,
    counts: { total: 5, pending: 2, keep: 3, revoke: 0, modify: 0, unremediated: 0 },
    ...over,
  } as unknown as AccessReviewDetail;
}

function lookup(tree: unknown, key: string): unknown {
  return key
    .replace(/^assets\./, '')
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);
}

describe('asset detail anatomy helpers', () => {
  it('says how an asset stands; only an overdue instrument in use is red', () => {
    expect(assetStatusLine(asset())).toEqual({
      key: 'assets.detail.statusLine.reviewed',
      tone: 'pass',
    });
    expect(assetStatusLine(asset({ review_status: 'overdue' })).tone).toBe('warn');
    expect(assetStatusLine(asset({ last_reviewed_at: null })).tone).toBe('neutral');
    expect(assetStatusLine(asset({ lifecycle_status: 'disposed' })).key).toContain('disposed');
    const instrument = { requires_calibration: true, calibration_status: 'overdue' } as const;
    expect(assetStatusLine(asset(instrument)).tone).toBe('fail');
    expect(assetStatusLine(asset({ ...instrument, lifecycle_status: 'maintenance' })).tone).toBe(
      'warn',
    );
    expect(assetStatusLine(asset({ ...instrument, calibration_status: 'ok' })).tone).toBe('pass');
  });

  it('turns follow-up flags into actions, skipping the ones it cannot offer', () => {
    const run = () => undefined;
    const a = asset({
      attention: ['review_overdue', 'no_owner', 'personal_data_unlinked'],
    });
    const all = assetMissing(a, ['/edit'], {
      calibrate: run,
      impact: run,
      review: run,
      processing: run,
    });
    expect(all.map((m) => m.key)).toEqual(['review_overdue', 'no_owner', 'personal_data_unlinked']);
    expect(all[1].link).toEqual(['/edit']);
    const some = assetMissing(a, ['/edit'], {
      calibrate: null,
      impact: null,
      review: null,
      processing: null,
    });
    expect(some.map((m) => m.key)).toEqual(['no_owner']);
  });
});

describe('access review detail anatomy helpers', () => {
  it('tells how far the review has come', () => {
    expect(reviewStatusLine(review()).key).toContain('deciding');
    expect(reviewStatusLine(review()).params).toEqual({ done: 3, total: 5 });
    expect(
      reviewStatusLine(
        review({ status: 'planned', counts: { ...review().counts, pending: 5, keep: 0 } }),
      ).key,
    ).toContain('planned');
    expect(
      reviewStatusLine(review({ counts: { ...review().counts, total: 0, pending: 0 } })).key,
    ).toContain('noAccounts');
    expect(reviewStatusLine(review({ counts: { ...review().counts, pending: 0 } })).tone).toBe(
      'pass',
    );
    const done = review({
      status: 'completed',
      counts: { ...review().counts, pending: 0, revoke: 1, unremediated: 1 },
    });
    expect(reviewStatusLine(done)).toEqual({
      key: 'assets.reviewDetail.statusLine.completedOpenOne',
      tone: 'warn',
      params: { count: 1 },
    });
  });

  it('lists decisions and access changes still to do', () => {
    const h = { accounts: () => undefined, revocations: () => undefined };
    expect(reviewMissing(review(), h).map((m) => m.labelKey)).toEqual([
      'assets.reviewDetail.missing.decisions',
    ]);
    expect(reviewMissing(review({ can_work: false }), h)).toEqual([]);
    const done = review({
      status: 'completed',
      counts: { ...review().counts, pending: 0, revoke: 2, unremediated: 2 },
    });
    expect(reviewMissing(done, h).map((m) => m.key)).toEqual(['revocations']);
  });
});

describe('assets detail i18n', () => {
  it('has every status sentence and missing line in en and nb', () => {
    const keys = [
      ...['reviewed', 'notReviewed', 'reviewOverdue', 'calibrated', 'calibrationOverdueInUse'].map(
        (k) => `assets.detail.statusLine.${k}`,
      ),
      ...['planned', 'deciding', 'ready', 'completed', 'completedOpen', 'completedOpenOne'].map(
        (k) => `assets.reviewDetail.statusLine.${k}`,
      ),
      'assets.reviewDetail.missing.decisionsOne',
      'assets.detail.missing.held_by_leaver',
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), key).toBe('string');
      expect(typeof lookup(nb, key), key).toBe('string');
    }
  });
});
