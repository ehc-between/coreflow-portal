import {
  biaMissing,
  controlledStatusLine,
  exerciseMissing,
  exerciseStatusLine,
  placeControlledActions,
  planMissing,
} from './continuity-anatomy';
import { BiaDetail, ControlledDetail, ExerciseDetail, PlanDetail } from './continuity.models';

const controlled = (over: Partial<ControlledDetail> = {}): ControlledDetail => ({
  id: 'r1',
  code: 'BIA-1',
  title: 'Payroll',
  status: 'draft',
  version: 1,
  review_interval_months: 12,
  last_reviewed_on: null,
  next_review_on: null,
  review_state: 'not_scheduled',
  submitted_at: null,
  submitted_by: null,
  approved_at: null,
  approved_by: null,
  allowed_actions: [],
  can_edit: true,
  can_delete: true,
  ...over,
});

const bia = (over: Partial<BiaDetail> = {}): BiaDetail =>
  ({
    ...controlled(),
    process: { entity_type: 'process', entity_id: 'p', title: 'Pay', url: '/processes/p' },
    owner: { id: 'u', name: 'Kari' },
    plans: [{ id: 'pl', code: 'BCP-1', title: 'Plan', status: 'approved' }],
    dependencies: [],
    mtpd_minutes: 1440,
    rto_minutes: 240,
    rpo_minutes: 60,
    suggested_mtpd_minutes: null,
    ...over,
  }) as unknown as BiaDetail;

const plan = (over: Partial<PlanDetail> = {}): PlanDetail =>
  ({
    ...controlled({ code: 'BCP-1' }),
    owner: { id: 'u', name: 'Kari' },
    bias: [{ id: 'b' }],
    steps: [{ phase: 'activation', title: 'Call' }],
    exercises: [],
    last_exercised_on: '2026-01-01',
    ict_dependencies: [],
    distribution_current: true,
    distributed_version: 1,
    ...over,
  }) as unknown as PlanDetail;

const exercise = (over: Partial<ExerciseDetail> = {}): ExerciseDetail =>
  ({
    id: 'e1',
    code: 'EX-1',
    title: 'Tabletop',
    status: 'planned',
    plan: { id: 'pl', code: 'BCP-1', title: 'Plan' },
    ict_system: null,
    owner: { id: 'u', name: 'Kari' },
    scheduled_on: '2026-12-01',
    overdue: false,
    conducted_on: null,
    outcome: null,
    rto_met: null,
    completed_at: null,
    lessons_need_follow_up: false,
    allowed_actions: ['complete', 'cancel'],
    can_edit: true,
    ...over,
  }) as unknown as ExerciseDetail;

const noop = () => undefined;
const keys = (items: readonly { key: string }[]) => items.map((i) => i.key);

describe('controlledStatusLine', () => {
  it('says approved (green) with the version, date and approver', () => {
    const line = controlledStatusLine(
      controlled({
        status: 'approved',
        version: 3,
        approved_at: '2026-03-01T10:00:00Z',
        approved_by: { id: 'u', name: 'Kari' },
      }),
    );
    expect(line).toEqual(
      expect.objectContaining({ key: 'continuity.detail.status.approvedOn', tone: 'pass' }),
    );
    expect(line.version).toBe(3);
    expect(line.name).toBe('Kari');
  });

  it('treats a draft and one waiting for approval as to-dos, retired as neutral', () => {
    expect(controlledStatusLine(controlled()).tone).toBe('warn');
    expect(controlledStatusLine(controlled({ status: 'in_review' })).key).toBe(
      'continuity.detail.status.inReview',
    );
    expect(
      controlledStatusLine(controlled({ status: 'in_review', submitted_at: '2026-03-01' })).key,
    ).toBe('continuity.detail.status.inReviewOn');
    expect(controlledStatusLine(controlled({ status: 'retired' })).tone).toBe('neutral');
  });
});

describe('placeControlledActions', () => {
  it('makes "Rediger" the primary action when no step is due', () => {
    const placed = placeControlledActions(
      controlled({ status: 'approved', review_state: 'ok', allowed_actions: ['review', 'retire'] }),
    );
    expect(placed).toEqual({ primary: 'edit', secondary: [], overflow: ['review'] });
  });

  it('puts the workflow step first, with Rediger next to it', () => {
    expect(placeControlledActions(controlled({ allowed_actions: ['submit', 'retire'] }))).toEqual({
      primary: 'submit',
      secondary: ['edit'],
      overflow: [],
    });
  });

  it('offers approve with reject beside it, and Rediger in the menu while in review', () => {
    expect(
      placeControlledActions(
        controlled({ status: 'in_review', allowed_actions: ['approve', 'reject'] }),
      ),
    ).toEqual({ primary: 'approve', secondary: ['reject'], overflow: ['edit'] });
  });

  it('makes the review primary when it is due', () => {
    expect(
      placeControlledActions(
        controlled({ status: 'approved', review_state: 'overdue', allowed_actions: ['review'] }),
      ).primary,
    ).toBe('review');
  });

  it('shows nothing to a reader', () => {
    expect(placeControlledActions(controlled({ can_edit: false })).primary).toBeNull();
  });
});

describe('biaMissing', () => {
  const opts = { editLink: ['edit'], review: noop, createPlan: noop };

  it('is empty for a complete analysis', () => {
    expect(biaMissing(bia(), opts)).toEqual([]);
  });

  it('lists a missing plan, targets, process and owner', () => {
    const items = biaMissing(
      bia({ plans: [], rto_minutes: null, process: null, owner: null }),
      opts,
    );
    expect(keys(items)).toEqual(['plan', 'targets', 'process', 'owner']);
  });

  it('flags an overdue review, an MTPD longer than suggested and an ICT gap', () => {
    const items = biaMissing(
      bia({
        status: 'approved',
        review_state: 'overdue',
        suggested_mtpd_minutes: 240,
        dependencies: [
          {
            kind: 'ict',
            name: 'ERP',
            notes: null,
            ict_system_id: 's1',
            ict_system_code: 'ICT-1',
            ict_readiness: 'gap',
          },
        ],
      }),
      opts,
    );
    expect(keys(items)).toEqual(['review', 'mtpd', 'ict']);
    expect(items[2].link).toEqual(['/continuity/ict-systems', 's1']);
  });

  it('asks nothing of a retired analysis', () => {
    expect(biaMissing(bia({ status: 'retired', plans: [] }), opts)).toEqual([]);
  });
});

describe('planMissing', () => {
  const opts = { editLink: ['edit'], review: noop, planExercise: noop, print: noop };

  it('is empty for a complete plan', () => {
    expect(planMissing(plan(), opts)).toEqual([]);
  });

  it('lists the gaps of a new plan', () => {
    const items = planMissing(
      plan({
        status: 'approved',
        bias: [],
        steps: [],
        last_exercised_on: null,
        owner: null,
        distribution_current: false,
        distributed_version: null,
      }),
      opts,
    );
    expect(keys(items)).toEqual(['bias', 'steps', 'exercise', 'print', 'owner']);
    expect(items[3].labelKey).toBe('continuity.detail.missing.planPrint');
  });

  it('names the ICT service that cannot recover in time', () => {
    const items = planMissing(
      plan({
        ict_dependencies: [
          { id: 's1', code: 'ICT-1', name: 'ERP', issues: ['plan_rto_gap'] },
        ] as unknown as PlanDetail['ict_dependencies'],
      }),
      opts,
    );
    expect(items[0]).toEqual(
      expect.objectContaining({ key: 'ict', params: { name: 'ERP', count: 1 } }),
    );
  });
});

describe('exercise anatomy', () => {
  it('says when a planned exercise is held, and flags an overdue one', () => {
    expect(exerciseStatusLine(exercise()).tone).toBe('info');
    expect(exerciseStatusLine(exercise({ scheduled_on: null })).key).toBe(
      'continuity.detail.status.exercise.undated',
    );
    expect(exerciseStatusLine(exercise({ overdue: true })).key).toBe(
      'continuity.detail.status.exercise.overdue',
    );
  });

  it('is green only for a successful exercise that met its target', () => {
    const held = { status: 'completed' as const, conducted_on: '2026-02-01' };
    expect(exerciseStatusLine(exercise({ ...held, outcome: 'successful' })).tone).toBe('pass');
    expect(
      exerciseStatusLine(exercise({ ...held, outcome: 'successful', rto_met: false })).key,
    ).toBe('continuity.detail.status.exercise.conflict');
    expect(exerciseStatusLine(exercise({ ...held, outcome: 'unsuccessful' })).tone).toBe('warn');
  });

  it('lists the result, date, subject and follow-up to-dos', () => {
    const opts = { editLink: ['edit'], complete: noop, followUp: noop };
    expect(keys(exerciseMissing(exercise({ overdue: true }), opts))).toEqual(['result']);
    expect(
      keys(exerciseMissing(exercise({ scheduled_on: null, plan: null, owner: null }), opts)),
    ).toEqual(['date', 'subject', 'owner']);
    expect(
      keys(
        exerciseMissing(
          exercise({ status: 'completed', lessons_need_follow_up: true, allowed_actions: [] }),
          opts,
        ),
      ),
    ).toEqual(['followUp']);
    expect(exerciseMissing(exercise({ status: 'cancelled', owner: null }), opts)).toEqual([]);
  });
});
