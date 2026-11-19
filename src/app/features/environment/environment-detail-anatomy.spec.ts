import { aspectMissing, aspectStatusKey } from './aspect-detail';
import { makeAspect, makeMetric } from './environment.testing';
import { metricMissing, metricStatusKey } from './metric-detail';

const aspectActions = {
  editLink: ['/environment/aspects', 'a-1', 'edit'],
  linkControl: vi.fn(),
  makePlan: vi.fn(),
  review: vi.fn(),
};

describe('aspect detail anatomy', () => {
  it('says whether the aspect is significant, unscored or retired', () => {
    expect(aspectStatusKey(makeAspect())).toBe('significant');
    expect(aspectStatusKey(makeAspect({ significant: false }))).toBe('notSignificant');
    expect(aspectStatusKey(makeAspect({ significant: false, evaluated: false }))).toBe('unscored');
    expect(aspectStatusKey(makeAspect({ status: 'retired' }))).toBe('retired');
  });

  it('lists what is missing as actions, most important first', () => {
    expect(aspectMissing(makeAspect(), aspectActions)).toEqual([]);
    const items = aspectMissing(
      makeAspect({
        controls_missing: true,
        needs_emergency_plan: true,
        review_overdue: true,
        legal_requirement: true,
        owner_user_id: null,
      }),
      aspectActions,
    );
    expect(items.map((i) => i.key)).toEqual(['controls', 'plan', 'review', 'obligations', 'owner']);
    items[0].action?.();
    expect(aspectActions.linkControl).toHaveBeenCalled();
    expect(items[3].fragment).toBe('obligations');
  });
});

describe('metric detail anatomy', () => {
  it('says how the indicator is doing against its target', () => {
    expect(metricStatusKey(makeMetric())).toBe('no_target');
    expect(metricStatusKey(makeMetric({ target_value: 10, target_status: 'on_track' }))).toBe(
      'on_track',
    );
    expect(metricStatusKey(makeMetric({ target_value: 10, target_status: 'off_track' }))).toBe(
      'off_track',
    );
    expect(metricStatusKey(makeMetric({ target_value: 10 }))).toBe('no_data');
    expect(metricStatusKey(makeMetric({ status: 'retired' }))).toBe('retired');
  });

  it('lists the missing target, objective, owner and reminders', () => {
    const record = vi.fn();
    const actions = { editLink: ['x'], record, makeObjective: vi.fn() };
    const items = metricMissing(
      makeMetric({ measurement_count: 0, owner_user_id: null, collection_rrule: null }),
      actions,
    );
    expect(items.map((i) => i.key)).toEqual(['first', 'target', 'objective', 'owner', 'reminders']);
    items[0].action?.();
    expect(record).toHaveBeenCalled();
    expect(
      metricMissing(
        makeMetric({
          target_value: 5,
          objectives: [{ entity_type: 'objective', id: 'o', code: 'O', title: 'T' }],
        }),
        { ...actions, record: null },
      ),
    ).toEqual([]);
    expect(metricMissing(makeMetric({ status: 'retired' }), actions)).toEqual([]);
  });
});
