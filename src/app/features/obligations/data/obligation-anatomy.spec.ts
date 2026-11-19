import { makeObligation } from '../obligations.testing';
import { obligationSentence, obligationTodos } from './obligation-anatomy';

describe('obligation detail anatomy', () => {
  const today = new Date(2026, 10, 17);
  const all = { canRecord: true, canEdit: true };

  it('states compliance in plain words, lifecycle first', () => {
    expect(obligationSentence(makeObligation({ compliance_status: 'compliant' }))).toEqual({
      kind: 'compliant',
      tone: 'pass',
    });
    expect(obligationSentence(makeObligation({ compliance_status: 'non_compliant' })).tone).toBe(
      'warn',
    );
    expect(obligationSentence(makeObligation({ compliance_status: 'not_evaluated' })).kind).toBe(
      'not_evaluated',
    );
    expect(obligationSentence(makeObligation({ status: 'retired' })).kind).toBe('retired');
    expect(obligationSentence(makeObligation({ status: 'draft' })).kind).toBe('draft');
  });

  it('lists the open steps the user can act on, and a missing owner', () => {
    const o = makeObligation({
      evaluation_count: 0,
      next_evaluation: null,
      needs_schedule: true,
      evaluation_rrule: null,
      latest_evaluation: null,
      owner: null,
    });
    expect(obligationTodos(o, all, today).map((t) => t.kind)).toEqual([
      'firstEvaluation',
      'noSchedule',
      'owner',
    ]);
    // Without write access only the evaluation is theirs.
    expect(
      obligationTodos(o, { canRecord: true, canEdit: false }, today).map((t) => t.kind),
    ).toEqual(['firstEvaluation']);
    // An all-good obligation has nothing to do.
    expect(obligationTodos(makeObligation(), all, today)).toEqual([]);
    expect(obligationTodos(makeObligation({ status: 'retired', owner: null }), all, today)).toEqual(
      [],
    );
  });
});
