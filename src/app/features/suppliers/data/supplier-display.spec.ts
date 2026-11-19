import { HttpErrorResponse } from '@angular/common/http';
import { Question } from './supplier.models';
import {
  allowedTargets,
  answerValue,
  attentionAction,
  certificatesBody,
  changedFields,
  criticalityBadge,
  decisionBadge,
  dayToWire,
  needsApproval,
  previewScore,
  ratePercent,
  recommend,
  scoreParams,
  splitList,
  supplierStatusBadge,
  wireToDay,
} from './supplier-display';
import { supplierErrorKey, unansweredIds } from './supplier-errors';
import { SUPPLIER_STATUSES } from './supplier.models';
import { draftFrom, fieldsFrom } from '../supplier-form';
import { filtersFromView, moreFiltersCount, toQuery } from '../suppliers-list';
import { entryBody, entryDraft, needsDeviation } from '../detail/supplier-performance-panel';
import {
  defaultKind,
  offeredKinds,
  questionnaireLang,
  recommendedKind,
} from '../detail/start-evaluation-dialog';
import { statusChipCount } from '../evaluations/evaluations-list';
import { certificateRows } from '../shared/certificates-editor';
import { answersBody } from '../evaluations/evaluation-detail';
import { decisionValid } from '../evaluations/decide-dialog';
import { categoryKey, groupQuestions } from '../evaluations/questionnaire-answers';
import { categoryChoice, toEditable, toQuestionIn } from '../shared/question-editor';

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
      data_locations: ['NO', 'ie', 'NO'],
      certificates: [
        { standard: 'iso27001', label: '', number: ' C-1 ', issuer: '', valid_until: '2027-01-01' },
        { standard: null, label: '  ', number: '', issuer: '', valid_until: '' },
      ],
      evaluation_interval_months: '12',
      next_evaluation_at: '2027-01-31',
      processes_personal_data: true,
    });
    expect(fields).toMatchObject({
      name: 'Acme',
      country: 'NO',
      data_locations: ['NO', 'IE'],
      certificates: [
        {
          standard: 'iso27001',
          label: null,
          number: 'C-1',
          issuer: null,
          valid_until: '2027-01-01',
          attachment_id: null,
        },
      ],
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
    const certs = { ...base, certificates: [{ standard: 'iso9001' as const }] };
    expect(changedFields(base, certs)).toEqual({ certificates: [{ standard: 'iso9001' }] });
  });

  it('turns stored or legacy certificates into edit rows', () => {
    expect(certificateRows(undefined, ['ISO 9001'])).toEqual([
      {
        standard: null,
        label: 'ISO 9001',
        number: '',
        issuer: '',
        valid_until: '',
        attachment_id: null,
      },
    ]);
    const rows = certificateRows(
      [
        {
          id: 'c1',
          standard: 'iso27001',
          label: 'ISO/IEC 27001',
          number: 'N',
          valid_until: '2027-01-01',
        },
      ],
      ['ISO/IEC 27001'],
    );
    expect(rows[0]).toMatchObject({ id: 'c1', standard: 'iso27001', label: '', number: 'N' });
    expect(certificatesBody([{ standard: null, label: ' ' }])).toEqual([]);
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
      attention: '',
      criticality: '',
      category: '',
      due: '',
      flag: 'provides_ai',
      dpa: '',
      owner: '',
      sort: 'name',
    });
    expect(filtersFromView({ dpa_status: 'missing' }).dpa).toBe('missing');
    expect(toQuery('', filtersFromView({ dpa: 'covered' }), 0).dpa_status).toEqual(['covered']);
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

  it('reads the follow-up filter from links and maps it to the API', () => {
    expect(filtersFromView({ attention: '1' }).attention).toBe('any');
    expect(filtersFromView({ attention_code: 'dpa_missing' }).attention).toBe('dpa_missing');
    expect(filtersFromView({ attention: 'bogus' }).attention).toBe('');
    expect(toQuery('', { ...filtersFromView({}), attention: 'any' }, 0).attention).toBe(true);
    expect(
      toQuery('', { ...filtersFromView({}), attention: 'dpa_missing' }, 0).attention_code,
    ).toEqual(['dpa_missing']);
    expect(moreFiltersCount({ ...filtersFromView({}), category: 'cloud', owner: 'me' })).toBe(2);
  });
});

describe('supplier badges and follow-up actions', () => {
  it('maps statuses onto the shared tone map', () => {
    expect(supplierStatusBadge('approved')).toEqual({ meaning: 'lifecycle', value: 'approved' });
    expect(supplierStatusBadge('conditional')).toEqual({ meaning: 'compliance', value: 'partial' });
    expect(criticalityBadge('critical')).toEqual({ meaning: 'severity', value: 'critical' });
    expect(decisionBadge('reject')).toEqual({ meaning: 'lifecycle', value: 'rejected' });
  });

  it('offers the action that closes a follow-up flag', () => {
    expect(attentionAction('not_approved', false)).toEqual({
      kind: 'evaluate',
      evaluation: 'initial',
    });
    expect(attentionAction('weak_performance', true)).toEqual({
      kind: 'evaluate',
      evaluation: 'ad_hoc',
    });
    expect(attentionAction('dpa_missing', true)).toMatchObject({
      kind: 'flow',
      flow: 'supplier.to_dpa',
    });
    expect(attentionAction('certificate_expired', true)).toEqual({ kind: 'edit' });
  });

  it('formats a score against its pass mark', () => {
    expect(scoreParams(64, 70, 'en')).toEqual({ score: '64', pass: 70 });
    expect(scoreParams(90.83, null, 'en')).toEqual({ score: '90.8', pass: null });
    expect(scoreParams(null, 70, 'en')).toBeNull();
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

  it('recommends and offers kinds from the risk profile', () => {
    const base = { latest: null, open_evaluation_id: null };
    const required = [
      { ...base, kind: 'initial' as const, reason: 'always' as const, done: true },
      { ...base, kind: 'privacy' as const, reason: 'personal_data' as const, done: false },
    ];
    expect(
      recommendedKind({ approved_at: null, status: 'approved', required_assessments: required }),
    ).toBe('privacy');
    expect(
      recommendedKind({ approved_at: null, status: 'prospective', required_assessments: [] }),
    ).toBe('initial');
    expect(offeredKinds(required, false)).toEqual(['initial', 'periodic', 'ad_hoc', 'privacy']);
    expect(offeredKinds(required, true)).toHaveLength(6);
  });

  it('flags performance entries that need a deviation', () => {
    const entry = { deviation_id: null, on_time: false, quality_ok: null, kind: 'delivery' };
    expect(needsDeviation(entry as never)).toBe(true);
    expect(needsDeviation({ ...entry, deviation_id: 'd' } as never)).toBe(false);
    expect(needsDeviation({ ...entry, on_time: true } as never)).toBe(false);
  });

  it('counts the evaluation status chips', () => {
    const counts = { draft: 1, submitted: 2, completed: 5, cancelled: 0 };
    expect(statusChipCount(counts, 'open')).toBe(3);
    expect(statusChipCount(counts, '')).toBe(8);
    expect(statusChipCount(counts, 'completed')).toBe(5);
    expect(statusChipCount(undefined, 'open')).toBeNull();
  });

  it('translates known question sections and keeps custom ones', () => {
    expect(categoryKey('Security')).toBe('suppliers.questionCategory.security');
    expect(categoryKey('other')).toBe('suppliers.questionCategory.other');
    expect(categoryKey('Logistics partners')).toBeNull();
    expect(categoryChoice('privacy')).toBe('privacy');
    expect(categoryChoice('Logistics partners')).toBe('other');
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
        requirement_refs: [],
      },
    ]);
    const many = Array.from({ length: 10 }, (_, i) => 'iso27001:A.5.' + i);
    expect(toEditable({ text: 'Q', requirement_refs: many }).requirement_refs).toHaveLength(8);
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
