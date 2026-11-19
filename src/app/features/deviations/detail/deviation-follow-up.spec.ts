import { describe, expect, it, vi } from 'vitest';
import { DeviationDetail } from '../../../core/deviations/deviation.models';
import { deviationMissing, deviationState } from './deviation-follow-up';

function dev(overrides: Partial<DeviationDetail> = {}): DeviationDetail {
  return {
    id: 'd1',
    code: 'DEV-1',
    title: 'Leak',
    type_id: 't1',
    standards: [],
    clauses: [],
    tags: [],
    severity: 'medium',
    status: 'action',
    status_category: 'in_progress',
    source: 'internal',
    raised_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    visibility: 'organization',
    data: {},
    actions: [],
    events: [],
    description: 'Valve leaked',
    owner_user_id: 'u1',
    due_at: '2099-01-01',
    ...overrides,
  } as DeviationDetail;
}

const options = (scrollTo = vi.fn()) => ({
  editLink: ['/deviations', 'd1', 'edit'],
  overdue: false,
  canManage: true,
  scrollTo,
});

describe('deviationState', () => {
  it('follows the status category, overdue and the closing checklist', () => {
    expect(deviationState(dev())).toBe('in_progress');
    expect(deviationState(dev({ status_category: 'open' }))).toBe('open');
    expect(deviationState(dev({ due_at: '2000-01-01' }))).toBe('overdue');
    expect(deviationState(dev({ status_category: 'done' }))).toBe('done');
    expect(deviationState(dev({ status_category: 'cancelled' }))).toBe('cancelled');
    expect(
      deviationState(
        dev({
          closure_checklist: [
            { key: 'root_cause', done: true, required: true },
            { key: 'requirements_linked', done: false, required: false },
          ],
        }),
      ),
    ).toBe('ready');
  });
});

describe('deviationMissing', () => {
  it('lists empty basics and the open checklist items, required first', () => {
    const scrollTo = vi.fn();
    const items = deviationMissing(
      dev({
        description: '',
        owner_user_id: undefined,
        due_at: undefined,
        closure_checklist: [
          { key: 'effectiveness_reviewed', done: false, required: false },
          { key: 'root_cause', done: false, required: true },
          { key: 'requirements_linked', done: false, required: false },
          { key: 'authorities_notified', done: false, required: false },
        ],
      }),
      options(scrollTo),
    );
    expect(items.map((i) => i.key)).toEqual([
      'description',
      'due',
      'owner',
      'check:root_cause',
      'check:effectiveness_reviewed',
    ]);
    items.find((i) => i.key === 'check:root_cause')!.action!();
    expect(scrollTo).toHaveBeenCalledWith('dev-why');
  });

  it('says the deadline passed instead of asking for one', () => {
    const items = deviationMissing(dev(), { ...options(), overdue: true });
    expect(items.map((i) => i.key)).toEqual(['overdue']);
  });

  it('needs nothing once the case is closed', () => {
    expect(deviationMissing(dev({ status_category: 'done', description: '' }), options())).toEqual(
      [],
    );
  });
});
