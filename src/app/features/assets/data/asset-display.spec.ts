import { HttpErrorResponse } from '@angular/common/http';
import {
  reviewDraftErrors,
  reviewDraftFrom,
  reviewFieldsFrom,
} from '../access-reviews/access-review-edit';
import { reviewQuery } from '../access-reviews/access-reviews-list';
import { countItems } from '../access-reviews/review-items';
import { canComplete } from '../access-reviews/access-review-detail';
import { applySuggestion, assetDraftFrom, assetFieldsFrom } from '../asset-form';
import { createAssetBody } from '../asset-new';
import { assetFiltersFromView, assetQuery, DEFAULT_ASSET_FILTERS } from '../assets-list';
import { calibrationBody } from '../detail/calibration-panel';
import { createChangeBody } from '../changes/change-edit';
import { applyAssessment, changeDraftFrom, changeFieldsFrom } from '../changes/change-form';
import { stepPatch } from '../changes/change-step';
import { changeQuery, DEFAULT_CHANGE_FILTERS } from '../changes/changes-list';
import {
  addMonths,
  changedFields,
  daysUntil,
  localizedLabel,
  missingStepFields,
} from './asset-display';
import { assetErrorKey, assetErrorMessage, lockedFields } from './asset-errors';
import { AccessReviewDetail, ChangeDetail, ReviewItem } from './asset.models';

const coded = (status: number, detail: unknown) =>
  new HttpErrorResponse({ status, error: { detail } });

const change = (over: Partial<ChangeDetail> = {}): ChangeDetail => ({
  id: 'c-1',
  org_id: 'o',
  code: 'CHG-0001',
  title: 'Upgrade',
  change_type: 'normal',
  category: 'application',
  description: null,
  reason: null,
  impact_assessment: null,
  risk_level: null,
  risk_assessment: null,
  implementation_plan: null,
  rollback_plan: null,
  planned_start: null,
  planned_end: null,
  owner_user_id: 'u-1',
  department_id: null,
  implemented_at: null,
  review_outcome: null,
  review_notes: null,
  owner: { id: 'u-1', name: 'Kari' },
  requested_by: { id: 'u-1', name: 'Kari' },
  status: 'draft',
  status_label: { en: 'Draft', nb: 'Utkast' },
  status_category: 'open',
  pending_approval: false,
  url: '/assets/changes/c-1',
  created_at: '2026-11-01T00:00:00',
  updated_at: '2026-11-01T00:00:00',
  workflow: {
    state: 'draft',
    label: { en: 'Draft' },
    category: 'open',
    state_entered_at: null,
    sla_due_at: null,
    closed_at: null,
    pending_approval: false,
  },
  locked_fields: [],
  closed: false,
  data: {},
  affected_assets: [],
  open_tasks: 0,
  ...over,
});

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  id: 'i-1',
  review_id: 'r-1',
  subject_name: 'Kari',
  subject_user: null,
  account: null,
  access_level: null,
  decision: 'pending',
  note: null,
  decided_by: null,
  decided_at: null,
  remediated_at: null,
  remediated_by: null,
  position: 0,
  created_at: '2026-11-01T00:00:00',
  updated_at: '2026-11-01T00:00:00',
  ...over,
});

describe('asset display helpers', () => {
  it('adds months and clamps to the end of the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 12)).toBe('2027-11-15');
    expect(addMonths('2026-03-10', -3)).toBe('2025-12-10');
    expect(addMonths('nonsense', 3)).toBeNull();
  });

  it('counts days until a date', () => {
    const today = new Date(2026, 10, 12);
    expect(daysUntil('2026-11-12', today)).toBe(0);
    expect(daysUntil('2026-11-20', today)).toBe(8);
    expect(daysUntil('2026-11-02', today)).toBe(-10);
    expect(daysUntil(null, today)).toBeNull();
  });

  it('picks the label in the active language', () => {
    expect(localizedLabel({ en: 'Draft', nb: 'Utkast' }, 'nb')).toBe('Utkast');
    expect(localizedLabel({ en: 'Draft' }, 'nb')).toBe('Draft');
    expect(localizedLabel('Plain', 'en')).toBe('Plain');
  });

  it('sends only changed fields', () => {
    expect(changedFields({ a: 1, b: 'x', c: null }, { a: 1, b: 'y', c: null })).toEqual({ b: 'y' });
  });

  it('lists what the next workflow step still needs', () => {
    expect(missingStepFields(change())).toEqual(['description', 'reason']);
    expect(missingStepFields(change({ description: 'x', reason: ' ' }))).toEqual(['reason']);
    expect(
      missingStepFields(
        change({ status: 'assessment', impact_assessment: 'ok', risk_level: 'low' }),
      ),
    ).toEqual(['implementation_plan']);
    expect(missingStepFields(change({ status: 'review', review_outcome: 'successful' }))).toEqual(
      [],
    );
    expect(missingStepFields(change({ status: 'approved' }))).toEqual([]);
  });
});

describe('asset errors', () => {
  it('maps coded errors to scoped keys with params', () => {
    expect(assetErrorKey(coded(409, { code: 'review_empty' }))).toBe('assets.errors.review_empty');
    expect(assetErrorMessage(coded(409, { code: 'items_pending', pending: 3 }))).toEqual({
      key: 'assets.errors.items_pending',
      params: { pending: 3 },
    });
    const locked = coded(409, { code: 'change_locked', fields: ['title', 'reason'] });
    expect(assetErrorMessage(locked).params).toEqual({ count: 2 });
    expect(lockedFields(locked)).toEqual(['title', 'reason']);
  });

  it('falls back to neutral messages', () => {
    expect(assetErrorKey(coded(403, 'Forbidden'))).toBe('assets.errors.forbidden');
    expect(assetErrorKey(coded(422, [{ loc: ['body'] }]))).toBe('assets.errors.invalid');
    expect(assetErrorKey(new Error('x'))).toBe('assets.errors.generic');
  });
});

describe('asset form mapping', () => {
  it('round-trips a blank draft to the API fields with nulls', () => {
    const fields = assetFieldsFrom({ ...assetDraftFrom(null), name: '  Scale  ' });
    expect(fields.name).toBe('Scale');
    expect(fields.classification).toBe('internal');
    expect(fields.lifecycle_status).toBe('in_use');
    expect(fields.vendor).toBeNull();
    expect(fields.calibration_interval_months).toBeNull();
  });

  it('keeps calibration fields only for measuring equipment', () => {
    const draft = {
      ...assetDraftFrom(null),
      name: 'Scale',
      calibration_interval_months: '12',
      next_calibration_due: '2027-01-01',
    };
    expect(assetFieldsFrom(draft).calibration_interval_months).toBeNull();
    const cal = assetFieldsFrom({ ...draft, requires_calibration: true });
    expect(cal.calibration_interval_months).toBe(12);
    expect(cal.next_calibration_due).toBe('2027-01-01');
  });

  it('applies a classification suggestion and ignores unknown values', () => {
    const next = applySuggestion(assetDraftFrom(null), {
      classification: 'restricted',
      confidentiality: 'high',
      criticality: 'bogus' as never,
      contains_personal_data: true,
      handling_rules: 'Encrypt',
    });
    expect(next.classification).toBe('restricted');
    expect(next.confidentiality).toBe('high');
    expect(next.criticality).toBe('');
    expect(next.contains_personal_data).toBe(true);
    expect(next.handling_rules).toBe('Encrypt');
  });

  it('leaves an unset owner out of the create body', () => {
    const fields = assetFieldsFrom({ ...assetDraftFrom(null), name: 'X' });
    expect(
      'owner_user_id' in createAssetBody({ fields, lastCalibratedOn: null, changeReason: null }),
    ).toBe(false);
    const body = createAssetBody({
      fields: { ...fields, owner_user_id: 'u-2' },
      lastCalibratedOn: '2026-10-01',
      changeReason: null,
    });
    expect(body.owner_user_id).toBe('u-2');
    expect(body.last_calibrated_on).toBe('2026-10-01');
  });

  it('builds a calibration body with blank values as null', () => {
    expect(
      calibrationBody({
        performed_on: '2026-11-01',
        result: 'pass',
        performed_by: ' ',
        certificate_number: 'C-1',
        notes: '',
        impact_assessment: '',
        next_due_on: '',
      }),
    ).toEqual({
      performed_on: '2026-11-01',
      result: 'pass',
      performed_by: null,
      certificate_number: 'C-1',
      notes: null,
      impact_assessment: null,
      next_due_on: null,
    });
  });
});

describe('list queries', () => {
  it('builds the asset query from filters and restores views safely', () => {
    const f = assetFiltersFromView({
      type: 'hardware',
      flag: 'contains_personal_data',
      sort: 'bad',
    });
    expect(f.sort).toBe(DEFAULT_ASSET_FILTERS.sort);
    expect(assetQuery('x', f, 25)).toMatchObject({
      q: 'x',
      type: ['hardware'],
      contains_personal_data: true,
      offset: 25,
    });
  });

  it('maps the open filters of reviews and changes', () => {
    expect(
      reviewQuery('', { status: 'open', reviewer: '', due: '30', sort: 'due_on' }, 0),
    ).toMatchObject({
      status: ['planned', 'in_progress'],
      due_within_days: 30,
    });
    expect(changeQuery('', DEFAULT_CHANGE_FILTERS, 0)).toMatchObject({
      open: true,
      status: undefined,
    });
    expect(changeQuery('', { ...DEFAULT_CHANGE_FILTERS, status: 'closed' }, 0)).toMatchObject({
      open: undefined,
      status: ['closed'],
    });
  });
});

describe('access review logic', () => {
  it('validates a draft', () => {
    const blank = reviewDraftFrom(null);
    expect(Object.keys(reviewDraftErrors(blank)).sort()).toEqual(['due_on', 'reviewer', 'system']);
    const ok = { ...blank, system_asset_id: 'a-1', reviewer_user_id: 'u-1', due_on: '2026-12-01' };
    expect(reviewDraftErrors(ok)).toEqual({});
    expect(reviewDraftErrors({ ...ok, frequency_months: '99' })).toHaveProperty('frequency');
  });

  it('sends either the system asset or the system name', () => {
    const base = {
      ...reviewDraftFrom(null, 'a-1'),
      system_name: 'Payroll',
      reviewer_user_id: 'u-1',
      due_on: '2026-12-01',
    };
    expect(reviewFieldsFrom(base)).toMatchObject({ system_asset_id: 'a-1', system_name: null });
    expect(reviewFieldsFrom({ ...base, systemMode: 'name' })).toMatchObject({
      system_asset_id: null,
      system_name: 'Payroll',
    });
  });

  it('counts decisions and knows when a review can be completed', () => {
    const items = [
      item({ id: '1', decision: 'keep' }),
      item({ id: '2', decision: 'revoke' }),
      item({ id: '3', decision: 'modify', remediated_at: '2026-11-02T00:00:00' }),
    ];
    const counts = countItems(items);
    expect(counts).toEqual({
      total: 3,
      pending: 0,
      keep: 1,
      revoke: 1,
      modify: 1,
      unremediated: 1,
    });
    const review = { status: 'in_progress', counts } as AccessReviewDetail;
    expect(canComplete(review)).toBe(true);
    expect(canComplete({ ...review, counts: { ...counts, pending: 1 } })).toBe(false);
    expect(canComplete({ ...review, counts: countItems([]) })).toBe(false);
    expect(canComplete({ ...review, status: 'completed' })).toBe(false);
  });
});

describe('change request logic', () => {
  it('only fills empty assessment fields from a suggestion', () => {
    const draft = { ...changeDraftFrom(null), title: 'X', impact_assessment: 'Mine' };
    const next = applyAssessment(draft, {
      risk_level: 'high',
      impact_assessment: 'Suggested',
      rollback_plan: 'Restore backup',
    });
    expect(next.impact_assessment).toBe('Mine');
    expect(next.rollback_plan).toBe('Restore backup');
    expect(next.risk_level).toBe('high');
  });

  it('keeps implementation fields stable when untouched', () => {
    const c = change({ implemented_at: '2026-11-05T13:20:00', status: 'review' });
    const fields = changeFieldsFrom(changeDraftFrom(c));
    expect(fields.implemented_at).toBe('2026-11-05T00:00:00');
    expect(changedFields(changeFieldsFrom(changeDraftFrom(c)), fields)).toEqual({});
  });

  it('creates without implementation fields and with the chosen assets', () => {
    const fields = changeFieldsFrom({ ...changeDraftFrom(null), title: 'X' });
    const body = createChangeBody({ fields, assetIds: ['a-1'], changeReason: null });
    expect(body).not.toHaveProperty('implemented_at');
    expect(body).not.toHaveProperty('owner_user_id');
    expect(body.asset_ids).toEqual(['a-1']);
  });

  it('builds the step patch from the filled values', () => {
    expect(stepPatch({ description: ' New ', reason: '', implemented_at: '2026-11-05' })).toEqual({
      description: 'New',
      implemented_at: '2026-11-05T00:00:00',
    });
  });
});
