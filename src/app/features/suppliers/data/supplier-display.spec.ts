import { HttpErrorResponse } from '@angular/common/http';
import { Question } from './supplier.models';
import {
  allowedTargets,
  answerValue,
  changedFields,
  dayToWire,
  needsApproval,
  previewScore,
  ratePercent,
  recommend,
  splitList,
  wireToDay,
} from './supplier-display';
import { supplierErrorKey, unansweredIds } from './supplier-errors';
import { SUPPLIER_STATUSES } from './supplier.models';
import { draftFrom, fieldsFrom } from '../supplier-form';
import { filtersFromView, toQuery } from '../suppliers-list';
import { entryBody, entryDraft } from '../detail/supplier-performance-panel';
import { defaultKind, questionnaireLang } from '../detail/supplier-evaluations-panel';
import { answersBody } from '../evaluations/evaluation-detail';
import { decisionValid } from '../evaluations/decide-dialog';
import { groupQuestions } from '../evaluations/questionnaire-answers';
import { toEditable, toQuestionIn } from '../shared/question-editor';

const q = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  text: id,
  help: null,
  category: 'general',
  type: 'yes_no',
  weight: 1,
  max_score: 5,
  critical: false,
  required: true,
  ...over,
});

describe('supplier scoring preview', () => {
  it('weights yes/no and score answers and skips text and n/a', () => {
    const questions = [
      q('a', { weight: 2 }),
      q('b', { type: 'score', max_score: 4 }),
      q('c', { type: 'text' }),
      q('d'),
    ];
    const result = previewScore(
      questions,
      { a: { value: 'yes' }, b: { value: 2 }, c: { value: 'fine' }, d: { value: 'na' } },
      70,
    );
    // (2*1 + 1*0.5) / 3 = 83.3 %
    expect(result.score).toBe(83.3);
    expect(result.answered).toBe(4);
    expect(result.total).toBe(4);
    expect(result.unanswered).toEqual([]);
    expect(result.recommendation).toBe('approve');
  });

  it('flags critical failures and caps the recommendation at conditional', () => {
    const result = previewScore(
      [q('a', { critical: true }), q('b', { weight: 9 })],
      { a: { value: 'no' }, b: { value: 'yes' } },
      70,
    );
    expect(result.score).toBe(90);
    expect(result.criticalFailures).toEqual(['a']);
    expect(result.recommendation).toBe('conditional');
  });

  it('lists required questions without an answer and returns no score when nothing is scored', () => {
    const result = previewScore([q('a'), q('b', { required: false })], {}, 70);
    expect(result.score).toBeNull();
    expect(result.recommendation).toBeNull();
    expect(result.unanswered).toEqual(['a']);
  });

  it('recommends like the backend', () => {
    expect(recommend(70, false, 70)).toBe('approve');
    expect(recommend(50, false, 70)).toBe('conditional');
    expect(recommend(49.9, false, 70)).toBe('reject');
    expect(recommend(95, true, 70)).toBe('conditional');
    expect(recommend(null, false, 70)).toBeNull();
  });

  it('normalises answer values from controls', () => {
    expect(answerValue(q('a', { type: 'score' }), '3')).toBe(3);
    expect(answerValue(q('a', { type: 'score' }), 'na')).toBe('na');
    expect(answerValue(q('a'), '')).toBeNull();
    expect(answerValue(q('a', { type: 'text' }), 'ok')).toBe('ok');
  });
});

describe('supplier status rules', () => {
  it('needs approval into or out of an approval status', () => {
    expect(needsApproval('prospective', 'under_evaluation')).toBe(false);
    expect(needsApproval('prospective', 'approved')).toBe(true);
    expect(needsApproval('suspended', 'inactive')).toBe(true);
  });

  it('offers only non-approval targets without approval rights', () => {
    expect(allowedTargets('prospective', SUPPLIER_STATUSES, false)).toEqual([
      'under_evaluation',
      'inactive',
    ]);
    expect(allowedTargets('approved', SUPPLIER_STATUSES, false)).toEqual([]);
    expect(allowedTargets('approved', SUPPLIER_STATUSES, true)).not.toContain('approved');
  });
});

describe('supplier form helpers', () => {
  it('round-trips a supplier through the form draft', () => {
    const fields = fieldsFrom({
      ...draftFrom(null),
      name: '  Acme  ',
      country: 'no',
      data_locations: 'Norway, Ireland, Norway',
      certifications: '',
      evaluation_interval_months: '12',
      next_evaluation_at: '2027-01-31',
      processes_personal_data: true,
    });
    expect(fields).toMatchObject({
      name: 'Acme',
      country: 'NO',
      data_locations: ['Norway', 'Ireland'],
      certifications: [],
      evaluation_interval_months: 12,
      next_evaluation_at: '2027-01-31T00:00:00',
      processes_personal_data: true,
      legal_name: null,
      owner_user_id: null,
    });
  });

  it('sends only changed fields', () => {
    const base = fieldsFrom(draftFrom(null));
    const next = { ...base, name: 'B', data_locations: ['NO'] };
    expect(changedFields(base, next)).toEqual({ name: 'B', data_locations: ['NO'] });
    expect(changedFields(base, { ...base })).toEqual({});
  });

  it('splits lists and converts days', () => {
    expect(splitList('a, b\nc,,a')).toEqual(['a', 'b', 'c']);
    expect(dayToWire('2026-05-01')).toBe('2026-05-01T00:00:00');
    expect(dayToWire('bad')).toBeNull();
    expect(wireToDay('2026-05-01T10:00:00')).toBe('2026-05-01');
    expect(ratePercent(66.67)).toBe(67);
    expect(ratePercent(null)).toBeNull();
  });
});

describe('supplier list query', () => {
  it('restores known filter values from a saved view', () => {
    const f = filtersFromView({
      status: 'approved',
      sort: 'bogus',
      flag: 'provides_ai',
      owner: 'x',
    });
    expect(f).toEqual({
      status: 'approved',
      criticality: '',
      category: '',
      due: '',
      flag: 'provides_ai',
      owner: '',
      sort: 'name',
    });
  });

  it('maps filters to the API query, flag as a boolean param', () => {
    const query = toQuery(
      'acme',
      { ...filtersFromView({}), flag: 'provides_ai', due: 'overdue' },
      25,
    );
    expect(query).toMatchObject({
      q: 'acme',
      provides_ai: true,
      evaluation_due: 'overdue',
      sort: 'name',
      offset: 25,
    });
    expect(query.status).toBeUndefined();
  });
});

describe('performance, evaluation and questionnaire helpers', () => {
  it('builds a performance body from a draft', () => {
    const body = entryBody({
      ...entryDraft(null),
      title: ' Late delivery ',
      rating: '2',
      on_time: 'no',
      quality_ok: '',
      deviation: { id: 'd-1', label: 'DEV-1' },
    });
    expect(body).toMatchObject({
      kind: 'delivery',
      title: 'Late delivery',
      rating: 2,
      on_time: false,
      quality_ok: null,
      deviation_id: 'd-1',
      occurred_on: null,
    });
  });

  it('sends answered or commented questions only', () => {
    expect(
      answersBody({
        a: { value: 'yes', comment: '' },
        b: { value: null, comment: ' see audit ' },
        c: { value: null, comment: '' },
      }),
    ).toEqual({ a: { value: 'yes', comment: null }, b: { value: null, comment: 'see audit' } });
  });

  it('requires conditions for a conditional decision', () => {
    expect(decisionValid('', '')).toBe(false);
    expect(decisionValid('approved', '')).toBe(true);
    expect(decisionValid('conditional', ' ')).toBe(false);
    expect(decisionValid('conditional', 'Sign the DPA')).toBe(true);
  });

  it('picks the evaluation kind and questionnaire language', () => {
    expect(defaultKind({ approved_at: null, status: 'prospective' })).toBe('initial');
    expect(defaultKind({ approved_at: '2026-01-01T00:00:00', status: 'suspended' })).toBe(
      'periodic',
    );
    expect(questionnaireLang('nb')).toBe('nb');
    expect(questionnaireLang('de')).toBe('en');
  });

  it('groups questions by section and keeps their numbers', () => {
    const groups = groupQuestions([
      q('a', { category: 'x' }),
      q('b', { category: 'y' }),
      q('c', { category: 'x' }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(['x', 'y']);
    expect(groups[0].questions.map((i) => i.n)).toEqual([1, 3]);
  });

  it('edits questions and drops blank ones on save', () => {
    const rows = [toEditable({ text: 'Has ISO 27001?', weight: 40 }), toEditable({ text: '  ' })];
    expect(rows[0].weight).toBe(10);
    expect(toQuestionIn(rows)).toEqual([
      {
        text: 'Has ISO 27001?',
        help: null,
        category: 'general',
        type: 'yes_no',
        weight: 10,
        max_score: 5,
        critical: false,
        required: true,
      },
    ]);
  });
});

describe('supplier errors', () => {
  const err = (status: number, detail: unknown) =>
    new HttpErrorResponse({ status, error: { detail } });

  it('maps coded errors, 403 and other 422s', () => {
    expect(supplierErrorKey(err(409, { code: 'status_unchanged' }))).toBe(
      'suppliers.errors.status_unchanged',
    );
    expect(supplierErrorKey(err(403, { code: 'whatever' }))).toBe('suppliers.errors.forbidden');
    expect(supplierErrorKey(err(422, [{ loc: ['body'] }]))).toBe('suppliers.errors.invalid');
    expect(supplierErrorKey(new Error('x'))).toBe('suppliers.errors.generic');
  });

  it('reads the unanswered question ids', () => {
    expect(unansweredIds(err(422, { code: 'unanswered_questions', ids: ['q1', 2] }))).toEqual([
      'q1',
    ]);
    expect(unansweredIds(err(422, { code: 'other' }))).toEqual([]);
  });
});
