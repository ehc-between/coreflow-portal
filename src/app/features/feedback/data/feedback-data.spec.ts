import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { breakdown, categoryRows, periodStart } from '../insights/feedback-stats-panel';
import { filtersFromParams } from '../items/feedback-list';
import { customerFields, primaryAction } from '../items/feedback-detail';
import { defaultReplyChannel } from '../items/feedback-replies';
import { toSettings, validateSettings } from '../settings/feedback-settings';
import { primarySurveyAction } from '../surveys/survey-detail';
import { distributionRows } from '../surveys/survey-results';
import { publicSurveyUrl } from '../surveys/survey-detail';
import { asThemes } from '../themes-panel';
import { FeedbackApi, PublicSurveyApi, feedbackListParams } from './feedback-api';
import {
  exportFileName,
  npsLevel,
  percentOf,
  round1,
  sortKey,
  thresholdOnFive,
  trimmedMonths,
} from './feedback-display';
import { feedbackErrorKey } from './feedback-errors';
import {
  emptyFeedbackForm,
  formFromFeedback,
  parseTags,
  toSubjects,
  toCreateRequest,
  toUpdateRequest,
  validateFeedbackForm,
} from './feedback-form-model';
import { Feedback, Question } from './feedback.models';
import {
  cleanAnswers,
  emptyQuestion,
  emptySurveyForm,
  missingRequired,
  scaleValues,
  toQuestionIn,
  toSurveyCreate,
  toSurveyUpdate,
  validateQuestions,
  validateSurveyForm,
  withType,
} from './survey-form-model';

const BASE = 'http://test/api';
const url = (path: string) => `${BASE}/v1/orgs/org-1/feedback${path}`;

describe('FeedbackApi', () => {
  let api: FeedbackApi;
  let pub: PublicSurveyApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    api = TestBed.inject(FeedbackApi);
    pub = TestBed.inject(PublicSurveyApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists feedback with csv filters and drops unset values', () => {
    api
      .list('org-1', {
        q: ' late ',
        kind: ['complaint', 'other'],
        open: true,
        sort: 'code',
        limit: 25,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('/items'));
    expect(req.request.params.get('q')).toBe('late');
    expect(req.request.params.get('kind')).toBe('complaint,other');
    expect(req.request.params.get('open')).toBe('true');
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.has('owner')).toBe(false);
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ items: [], total: 0 });
  });

  it('uses the documented paths and methods', () => {
    api.create('org-1', { kind: 'complaint', title: 'T' }).subscribe();
    api.update('org-1', 'f-1', { title: 'U' }).subscribe();
    api.delete('org-1', 'f-1').subscribe();
    api.action('org-1', 'f-1', 'resolve', { resolution: 'Refunded' }).subscribe();
    api.linkDeviation('org-1', 'f-1', 'd-1').subscribe();
    api.unlinkDeviation('org-1', 'f-1', 'd-1').subscribe();
    api.stats('org-1', '2026-01-01').subscribe();
    api.replies('org-1', 'f-1').subscribe();
    api.addReply('org-1', 'f-1', { channel: 'phone', body: 'Called back' }).subscribe();
    api.deleteReply('org-1', 'f-1', 'r-9').subscribe();
    api.settings('org-1').subscribe();
    api
      .saveSettings('org-1', {
        response_days: { complaint: 3, compliment: 10, suggestion: 10, inquiry: 5, other: null },
        working_days: true,
        privacy_notice_url: null,
        is_default: true,
      })
      .subscribe();
    api.categories('org-1').subscribe();
    api.responseDue('org-1', 'complaint', '2026-11-16').subscribe();
    api.createSurvey('org-1', { title: 'S' }).subscribe();
    api.surveyAction('org-1', 's-1', 'publish').subscribe();
    api.regenerateLink('org-1', 's-1').subscribe();
    api.results('org-1', 's-1').subscribe();
    api.responses('org-1', 's-1', 10, 20).subscribe();
    api.deleteResponse('org-1', 's-1', 'r-1').subscribe();

    const expectations: [string, string][] = [
      ['POST', url('/items')],
      ['PATCH', url('/items/f-1')],
      ['DELETE', url('/items/f-1')],
      ['POST', url('/items/f-1/actions/resolve')],
      ['POST', url('/items/f-1/deviations')],
      ['DELETE', url('/items/f-1/deviations/d-1')],
      ['GET', url('/stats')],
      ['GET', url('/items/f-1/replies')],
      ['POST', url('/items/f-1/replies')],
      ['DELETE', url('/items/f-1/replies/r-9')],
      ['GET', url('/settings')],
      ['PUT', url('/settings')],
      ['GET', url('/categories')],
      ['GET', url('/response-due')],
      ['POST', url('/surveys')],
      ['POST', url('/surveys/s-1/actions/publish')],
      ['POST', url('/surveys/s-1/regenerate-link')],
      ['GET', url('/surveys/s-1/results')],
      ['GET', url('/surveys/s-1/responses')],
      ['DELETE', url('/surveys/s-1/responses/r-1')],
    ];
    for (const [method, path] of expectations) {
      const req = http.expectOne((r) => r.method === method && r.url === path);
      if (path.endsWith('/deviations')) {
        expect(req.request.body).toEqual({ deviation_id: 'd-1' });
      }
      if (path.endsWith('/stats')) {
        expect(req.request.params.get('from')).toBe('2026-01-01');
        expect(req.request.params.has('to')).toBe(false);
      }
      if (method === 'PUT' && path.endsWith('/settings')) {
        // Only the writable fields are sent.
        expect(Object.keys(req.request.body as object).sort()).toEqual([
          'privacy_notice_url',
          'response_days',
          'working_days',
        ]);
      }
      if (path.endsWith('/response-due')) {
        expect(req.request.params.get('kind')).toBe('complaint');
        expect(req.request.params.get('received_on')).toBe('2026-11-16');
      }
      if (path.endsWith('/responses')) {
        expect(req.request.params.get('limit')).toBe('10');
        expect(req.request.params.get('offset')).toBe('20');
      }
      req.flush(null);
    }
  });

  it('downloads the exports with the list filters and the language', () => {
    api
      .exportLog(
        'org-1',
        { kind: ['complaint'], justified: true, sort: 'code', limit: 5 },
        'csv',
        'nb',
      )
      .subscribe();
    api.exportStats('org-1', 'pdf', 'en', '2026-01-01').subscribe();
    api.exportSurvey('org-1', 's-1', 'xlsx', 'nb').subscribe();
    const log = http.expectOne((r) => r.url === url('/export'));
    expect(log.request.responseType).toBe('blob');
    expect(log.request.params.get('kind')).toBe('complaint');
    expect(log.request.params.get('justified')).toBe('true');
    expect(log.request.params.get('format')).toBe('csv');
    expect(log.request.params.get('lang')).toBe('nb');
    // Paging and sorting do not apply to an export.
    expect(log.request.params.has('limit')).toBe(false);
    expect(log.request.params.has('sort')).toBe(false);
    log.flush(new Blob(['x']));
    const stats = http.expectOne((r) => r.url === url('/stats/export'));
    expect(stats.request.params.get('from')).toBe('2026-01-01');
    stats.flush(new Blob(['x']));
    http.expectOne((r) => r.url === url('/surveys/s-1/export')).flush(new Blob(['x']));
  });

  it('calls the public survey endpoints without an org', () => {
    pub.get('tok/en').subscribe();
    pub.submit('abc12345', { answers: { q1: 5 } }).subscribe();
    http.expectOne(`${BASE}/v1/public/surveys/tok%2Fen`).flush({});
    const req = http.expectOne(`${BASE}/v1/public/surveys/abc12345/responses`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ answers: { q1: 5 } });
    req.flush({ thank_you_message: null });
  });
});

describe('feedback helpers', () => {
  it('builds list params', () => {
    expect(feedbackListParams({ status: ['new'], overdue: true })).toMatchObject({
      status: 'new',
      overdue: true,
    });
  });

  it('maps errors to keys', () => {
    const coded = new HttpErrorResponse({
      status: 409,
      error: { detail: { code: 'complaint_not_resolved' } },
    });
    expect(feedbackErrorKey(coded)).toBe('feedback.errors.complaint_not_resolved');
    expect(feedbackErrorKey(new HttpErrorResponse({ status: 403 }))).toBe(
      'feedback.errors.forbidden',
    );
    expect(feedbackErrorKey(new HttpErrorResponse({ status: 429 }))).toBe(
      'feedback.errors.too_many_attempts',
    );
    expect(feedbackErrorKey('boom')).toBe('errors.generic');
  });

  it('formats display values', () => {
    expect(sortKey('-received_on')).toBe('received_onDesc');
    expect(sortKey('code')).toBe('code');
    expect(round1(3.456)).toBe(3.5);
    expect(round1(null)).toBeNull();
    expect(percentOf(1, 4)).toBe(25);
    expect(percentOf(1, 0)).toBe(0);
    expect(npsLevel(40)).toBe('pass');
    // A low score is something to work on, never shown as a failure.
    expect(npsLevel(-5)).toBe('warn');
    expect(npsLevel(null)).toBe('neutral');
    expect(thresholdOnFive(40)).toBe(3);
    expect(thresholdOnFive(25)).toBe(2);
    expect(thresholdOnFive(null)).toBeNull();
    expect(exportFileName('Logg over kundetilbakemeldinger', 'xlsx', new Date(2026, 10, 17))).toBe(
      'logg-over-kundetilbakemeldinger-2026-11-17.xlsx',
    );
  });

  it('works out the period start and the breakdown rows', () => {
    expect(periodStart(12, new Date(2026, 10, 12))).toBe('2025-12-01');
    expect(periodStart(3, new Date(2026, 0, 15))).toBe('2025-11-01');
    const rows = breakdown({ complaint: 3, other: 1 }, ['complaint', 'compliment', 'other'], 'p');
    expect(rows.map((r) => [r.key, r.count, r.percent])).toEqual([
      ['complaint', 3, 75],
      ['compliment', 0, 0],
      ['other', 1, 25],
    ]);
  });

  it('drops empty months at both ends of the trend but keeps gaps', () => {
    const m = (month: string, total: number) => ({
      month,
      total,
      complaints: 0,
      compliments: 0,
      average_satisfaction: null,
    });
    const rows = trimmedMonths([
      m('2026-01', 0),
      m('2026-02', 2),
      m('2026-03', 0),
      m('2026-04', 1),
      m('2026-05', 0),
    ]);
    expect(rows.map((r) => r.month)).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(trimmedMonths([m('2026-01', 0)])).toEqual([]);
  });

  it('lists the most used categories with a drill-down query', () => {
    const rows = categoryRows({ delivery: 3, invoicing: 1, empty: 0 });
    expect(rows.map((r) => [r.label, r.count, r.percent, r.query['category']])).toEqual([
      ['delivery', 3, 75, 'delivery'],
      ['invoicing', 1, 25, 'invoicing'],
    ]);
  });

  it('reads register filters from a link', () => {
    const params = (q: Record<string, string>) => ({ get: (k: string) => q[k] ?? null }) as never;
    expect(filtersFromParams(params({ kind: 'complaint', status: 'new' }))).toMatchObject({
      kind: 'complaint',
      status: 'new',
      overdue: false,
    });
    expect(
      filtersFromParams(params({ open: 'true', overdue: '1', justified: 'true' })),
    ).toMatchObject({ status: 'open', overdue: true, justified: 'yes' });
    expect(filtersFromParams(params({ kind: 'nonsense', department: 'x' }))).toMatchObject({
      kind: '',
      department: '',
    });
  });

  it('picks one primary step and puts the rest in the menu', () => {
    expect(
      primaryAction({
        allowed_actions: ['acknowledge', 'start', 'resolve', 'close'],
        next_action: 'acknowledge',
      }),
    ).toBe('acknowledge');
    expect(primaryAction({ allowed_actions: ['close', 'reopen'], next_action: null })).toBe(
      'close',
    );
    expect(primaryAction({ allowed_actions: ['reopen'], next_action: 'reopen' })).toBe('reopen');
    expect(primarySurveyAction({ allowed_actions: ['close'] })).toBe('close');
    expect(primarySurveyAction({ allowed_actions: [] })).toBeNull();
    expect(defaultReplyChannel('phone')).toBe('phone');
    expect(defaultReplyChannel('social')).toBe('email');
  });

  it('only shows the customer details that are filled in', () => {
    const rows = customerFields({
      customer_name: 'Kari',
      customer_organisation: null,
      customer_email: 'kari@example.com',
      customer_phone: ' ',
    } as Feedback);
    expect(rows.map((r) => r.key)).toEqual(['name', 'email']);
    expect(rows[1].href).toBe('mailto:kari@example.com');
  });

  it('validates and serialises the module settings', () => {
    const days = { complaint: '3', compliment: '', suggestion: '10', inquiry: '0', other: 'x' };
    expect(Object.keys(validateSettings(days, 'ftp://x')).sort()).toEqual([
      'inquiry',
      'other',
      'privacy_notice_url',
    ]);
    const fixed = { ...days, inquiry: '5', other: '5' };
    expect(validateSettings(fixed, 'https://example.no/p')).toEqual({});
    expect(toSettings(fixed, true, ' ')).toEqual({
      response_days: { complaint: 3, compliment: null, suggestion: 10, inquiry: 5, other: 5 },
      working_days: true,
      privacy_notice_url: null,
    });
  });

  it('builds the public survey url', () => {
    expect(publicSurveyUrl('https://app.example/', '/survey/abc')).toBe(
      'https://app.example/survey/abc',
    );
  });

  it('coerces the themes assist output', () => {
    expect(asThemes(null)).toBeNull();
    const r = asThemes({ summary: 'S', themes: [{ title: 'Late deliveries', count: 3 }, {}] });
    expect(r?.themes.length).toBe(1);
    expect(r?.themes[0].example_codes).toEqual([]);
    expect(r?.trends).toEqual([]);
  });

  it('turns a distribution into rows with translated yes/no labels', () => {
    const rows = distributionRows({
      id: 'q1',
      type: 'yes_no',
      label: 'Q',
      answered: 4,
      average: null,
      distribution: { yes: 3, no: 1 },
      nps: null,
      comments: [],
    });
    expect(rows).toEqual([
      { label: 'feedback.answer.yes', labelIsKey: true, count: 3, percent: 75 },
      { label: 'feedback.answer.no', labelIsKey: true, count: 1, percent: 25 },
    ]);
  });
});

describe('feedback form model', () => {
  it('validates title, email, tags and dates', () => {
    const base = emptyFeedbackForm(new Date(2026, 10, 12));
    expect(validateFeedbackForm(base)['title']).toBeTruthy();
    const errors = validateFeedbackForm({
      ...base,
      title: 'Late',
      customer_email: 'nope',
      response_due_on: '2026-11-01',
    });
    expect(Object.keys(errors).sort()).toEqual(['customer_email', 'response_due_on']);
  });

  it('parses tags', () => {
    expect(parseTags(' a, b ,a,, c')).toEqual(['a', 'b', 'c']);
  });

  it('creates a request with nulls for empty fields', () => {
    const body = toCreateRequest({
      ...emptyFeedbackForm(new Date(2026, 10, 12)),
      title: ' Late ',
      satisfaction_score: '2',
      tags: 'delivery',
    });
    expect(body).toMatchObject({
      kind: 'complaint',
      title: 'Late',
      satisfaction_score: 2,
      tags: ['delivery'],
      received_on: '2026-11-12',
      customer_email: null,
      owner_user_id: null,
    });
  });

  it('sends the complaint assessment and the related records', () => {
    const ref = (entity_type: string, entity_id: string) => ({
      entity_type,
      entity_id,
      title: entity_id,
      code: null,
      url: null,
      status: null,
      module: null,
      label_key: null,
    });
    const base = {
      ...emptyFeedbackForm(new Date(2026, 10, 12)),
      title: 'Late',
      complaint_justified: 'yes' as const,
      root_cause: ' Carrier ',
      subjects: [ref('supplier', 's-1'), ref('supplier', 's-1'), ref('deviation', 'd-1')],
    };
    expect(toCreateRequest(base)).toMatchObject({
      complaint_justified: true,
      root_cause: 'Carrier',
      corrective_action_required: null,
      subjects: [{ entity_type: 'supplier', entity_id: 's-1' }],
    });
    // A compliment has no assessment.
    expect(toCreateRequest({ ...base, kind: 'compliment' }).complaint_justified).toBeNull();
    expect(toSubjects([ref('process', 'p-1')])).toEqual([
      { entity_type: 'process', entity_id: 'p-1' },
    ]);
    // Only a changed set of subjects is sent, and then in full.
    const original = { ...base, subjects: [ref('supplier', 's-1')] };
    expect(toUpdateRequest(original, { ...original }, '')).toEqual({});
    expect(
      toUpdateRequest(
        original,
        { ...original, subjects: [ref('supplier', 's-1'), ref('contract', 'c-1')] },
        '',
      ),
    ).toEqual({
      subjects: [
        { entity_type: 'supplier', entity_id: 's-1' },
        { entity_type: 'contract', entity_id: 'c-1' },
      ],
    });
  });

  it('reads the assessment back into the form', () => {
    const v = formFromFeedback({
      kind: 'complaint',
      title: 'T',
      description: null,
      channel: 'email',
      severity: null,
      sentiment: null,
      category: null,
      tags: [],
      customer_name: null,
      customer_organisation: null,
      customer_email: null,
      customer_phone: null,
      product_or_service: null,
      satisfaction_score: null,
      received_on: '2026-11-01',
      response_due_on: null,
      owner: null,
      department_id: null,
      department: { id: 'dep-1', name: 'Kundeservice' },
      resolution: null,
      customer_informed: false,
      complaint_justified: false,
      root_cause: null,
      corrective_action_required: null,
      customer_accepted: true,
      subjects: [],
    } as unknown as Feedback);
    expect(v.complaint_justified).toBe('no');
    expect(v.corrective_action_required).toBe('');
    expect(v.customer_accepted).toBe('yes');
    expect(v.department_id).toBe('dep-1');
  });

  it('only sends changed fields on update and never clears the owner', () => {
    const original = {
      ...emptyFeedbackForm(new Date(2026, 10, 12)),
      title: 'Late',
      owner_user_id: 'u-1',
    };
    expect(toUpdateRequest(original, original, '')).toEqual({});
    const body = toUpdateRequest(
      original,
      { ...original, title: 'Very late', owner_user_id: '', customer_informed: true },
      ' typo ',
    );
    expect(body).toEqual({ title: 'Very late', customer_informed: true, change_reason: 'typo' });
  });
});

describe('survey form model', () => {
  it('validates questions like the server', () => {
    const problems = validateQuestions([
      { ...emptyQuestion('rating'), label: 'Q1' },
      { ...emptyQuestion('single_choice'), label: 'Q2', options: ['A', 'A'] },
      { ...emptyQuestion('text'), label: ' ' },
      { ...emptyQuestion('rating'), label: 'Q4', scale: 11 },
    ]);
    expect(problems.map((p) => [p.position, p.key.split('.').pop()])).toEqual([
      [2, 'options'],
      [3, 'labelRequired'],
      [4, 'scale'],
    ]);
  });

  it('validates survey fields', () => {
    const v = { ...emptySurveyForm(), opens_on: '2026-02-01', closes_on: '2026-01-01' };
    expect(Object.keys(validateSurveyForm({ ...v, low_score_threshold: '101' })).sort()).toEqual([
      'closes_on',
      'low_score_threshold',
      'title',
    ]);
  });

  it('keeps options when switching between choice types and drops them otherwise', () => {
    const q = { ...emptyQuestion('single_choice'), options: ['A', 'B', 'C'] };
    expect(withType(q, 'multi_choice').options).toEqual(['A', 'B', 'C']);
    expect(withType(q, 'text').options).toEqual([]);
    expect(withType(emptyQuestion('text'), 'single_choice').options).toEqual(['', '']);
  });

  it('serialises questions with distinct options and a scale only for ratings', () => {
    expect(
      toQuestionIn({
        ...emptyQuestion('multi_choice'),
        label: ' Pick ',
        options: ['A', ' A', 'B', ''],
      }),
    ).toEqual({
      type: 'multi_choice',
      label: 'Pick',
      help: null,
      required: false,
      options: ['A', 'B'],
      scale: null,
    });
    expect(toQuestionIn({ ...emptyQuestion('rating'), id: 'q1', label: 'R' })).toMatchObject({
      id: 'q1',
      scale: 5,
    });
  });

  it('starts a new survey in Norwegian with a follow-up at 40', () => {
    const v = emptySurveyForm();
    expect(v.low_score_threshold).toBe('40');
    expect(toSurveyCreate({ ...v, title: 'S', language: 'en' })).toMatchObject({
      low_score_threshold: 40,
      language: 'en',
    });
  });

  it('leaves locked questions out of an update', () => {
    const original = {
      ...emptySurveyForm(),
      title: 'S',
      questions: [{ ...emptyQuestion(), label: 'Q' }],
    };
    const next = { ...original, title: 'S2', questions: [] };
    expect(toSurveyUpdate(original, next, '', true)).toEqual({ title: 'S2' });
    expect(Object.keys(toSurveyUpdate(original, next, '', false)).sort()).toEqual([
      'questions',
      'title',
    ]);
  });

  it('checks required answers and cleans them', () => {
    const questions: Question[] = [
      { id: 'q1', type: 'rating', label: 'R', required: true, scale: 5 },
      { id: 'q2', type: 'text', label: 'T' },
      { id: 'q3', type: 'multi_choice', label: 'M', options: ['A', 'B'], required: true },
    ];
    expect(missingRequired(questions, { q1: 4, q3: [] })).toEqual(['q3']);
    expect(cleanAnswers(questions, { q1: 4, q2: '  hi ', q3: ['A'] })).toEqual({
      q1: 4,
      q2: 'hi',
      q3: ['A'],
    });
    expect(cleanAnswers(questions, { q2: '   ' })).toEqual({});
  });

  it('lists scale values', () => {
    expect(scaleValues({ type: 'nps', scale: null })).toHaveLength(11);
    expect(scaleValues({ type: 'rating', scale: 3 })).toEqual([1, 2, 3]);
  });
});
