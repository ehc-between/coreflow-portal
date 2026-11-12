import {
  EMPTY_DRAFT,
  evaluate,
  groupBySection,
  moveItem,
  normaliseQuestion,
  predictedResult,
  progressOf,
  questionProblems,
  toAnswerInput,
  toQuestionInput,
} from './answer-model';
import { QUESTIONS, makeQuestion } from './inspections.testing';

const draft = (value: unknown, extra = {}) => ({ ...EMPTY_DRAFT, value: value as never, ...extra });

describe('answer model', () => {
  it('evaluates yes/no answers against the fail answer', () => {
    const q = makeQuestion();
    expect(evaluate(q, draft('yes'))).toEqual({
      answered: true,
      failed: false,
      earned: 1,
      possible: 1,
    });
    expect(evaluate(q, draft('no')).failed).toBe(true);
    expect(evaluate({ ...q, fail_answer: 'yes' }, draft('yes')).failed).toBe(true);
    expect(evaluate(q, draft(null)).answered).toBe(false);
  });

  it('scores proportionally and fails below the pass score', () => {
    const q = QUESTIONS[1];
    expect(evaluate(q, draft(2))).toMatchObject({ failed: false, earned: 0.5, possible: 1 });
    expect(evaluate(q, draft(1)).failed).toBe(true);
    expect(evaluate(q, draft(9)).answered).toBe(false);
  });

  it('checks number ranges and leaves N/A out of the score', () => {
    const q = QUESTIONS[2];
    expect(evaluate(q, draft(30)).failed).toBe(true);
    expect(evaluate(q, draft(20)).failed).toBe(false);
    expect(evaluate(q, draft(null, { is_na: true }))).toEqual({
      answered: true,
      failed: false,
      earned: null,
      possible: null,
    });
  });

  it('counts photos as answered when one is attached', () => {
    const q = makeQuestion({ type: 'photo' });
    expect(evaluate(q, EMPTY_DRAFT).answered).toBe(false);
    expect(evaluate(q, { ...EMPTY_DRAFT, attachment_ids: ['a-1'] }).answered).toBe(true);
  });

  it('summarises progress, missing required questions and the score', () => {
    const p = progressOf(QUESTIONS, { q1: draft('yes'), q2: draft(4) });
    expect(p).toMatchObject({ total: 4, answered: 2, required: 3, requiredAnswered: 2, failed: 0 });
    expect(p.missingRequired).toEqual(['q3']);
    expect(p.scorePct).toBe(100);
    expect(progressOf(QUESTIONS, {}).scorePct).toBeNull();
  });

  it('predicts the result by pass mark or by failed answers', () => {
    expect(predictedResult(79, 80, 0)).toBe('failed');
    expect(predictedResult(80, 80, 2)).toBe('passed');
    expect(predictedResult(null, null, 1)).toBe('failed');
    expect(predictedResult(50, null, 0)).toBe('passed');
  });

  it('builds response items, clearing empty answers', () => {
    expect(toAnswerInput(QUESTIONS[0], draft('no', { note: ' blocked ' }))).toEqual({
      question_id: 'q1',
      value: 'no',
      is_na: false,
      note: 'blocked',
    });
    expect(toAnswerInput(QUESTIONS[0], EMPTY_DRAFT)).toEqual({ question_id: 'q1', clear: true });
    expect(toAnswerInput(QUESTIONS[0], draft(null, { is_na: true }))).toMatchObject({
      is_na: true,
    });
    expect(
      toAnswerInput(makeQuestion({ type: 'photo' }), { ...EMPTY_DRAFT, attachment_ids: ['a'] }),
    ).toEqual({ question_id: 'q1', attachment_ids: ['a'], note: null });
  });

  it('groups consecutive questions by section', () => {
    const groups = groupBySection(QUESTIONS);
    expect(groups.map((g) => [g.title, g.items.length])).toEqual([
      ['Exits', 2],
      ['Readings', 2],
    ]);
  });

  it('normalises partial questions and reports builder problems', () => {
    const q = normaliseQuestion({ text: 'Check', type: 'bogus' as never, weight: '2' as never });
    expect(q.type).toBe('yes_no');
    expect(q.weight).toBe(2);
    expect(questionProblems({ ...q, text: ' ' })).toContain('textRequired');
    expect(questionProblems({ ...q, type: 'score', scale_min: 3, scale_max: 2 })).toContain(
      'scale',
    );
    expect(questionProblems({ ...q, type: 'number', min: 5, max: 1 })).toContain('range');
    expect(questionProblems({ ...q, id: 'Bad Id' })).toContain('id');
    expect(questionProblems(q)).toEqual([]);
  });

  it('sends only the fields that matter for the type', () => {
    const input = toQuestionInput({ ...QUESTIONS[0], id: '', min: 3, pass_score: 2 });
    expect(input.id).toBeUndefined();
    expect(input.min).toBeNull();
    expect(input.pass_score).toBeNull();
    expect(toQuestionInput(QUESTIONS[2]).unit).toBe('°C');
    expect(toQuestionInput({ ...QUESTIONS[3] }).finding_on_fail).toBe(false);
  });

  it('moves items within bounds', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 2, 3)).toEqual([1, 2, 3]);
  });
});
