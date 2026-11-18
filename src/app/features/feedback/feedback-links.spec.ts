import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, convertToParamMap } from '@angular/router';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { feedbackFilterParams, responseListParams } from './data/feedback-api';
import { FeedbackStats, QuestionResult, SurveyResults } from './data/feedback.models';
import { FeedbackStatsPanel, handlingQuery, monthQuery } from './insights/feedback-stats-panel';
import { FeedbackList, filtersFromParams } from './items/feedback-list';
import { AllAnswersPage, answersScopeFromParams } from './surveys/all-answers-page';
import { answersQuery } from './surveys/survey-answers';
import { answerScopeFor } from './surveys/survey-detail';
import { ResultsDrill, SurveyResultsView, distributionRows } from './surveys/survey-results';

/** U23 QA: every count in the module opens the records (or answers) it counts. */

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key;

function stats(overrides: Partial<FeedbackStats> = {}): FeedbackStats {
  return {
    from_date: '2025-12-01',
    to_date: '2026-11-18',
    total: 6,
    by_kind: { complaint: 3 },
    by_status: {},
    by_channel: {},
    by_sentiment: {},
    open_complaints: 2,
    overdue: 0,
    average_satisfaction: 3.9,
    satisfaction_count: 4,
    average_days_to_resolve: null,
    monthly: [
      { month: '2026-10', total: 4, complaints: 2, compliments: 0, average_satisfaction: null },
      { month: '2026-11', total: 2, complaints: 1, compliments: 1, average_satisfaction: 4 },
    ],
    survey_responses: 4,
    survey_average_score: 70,
    nps: 25,
    complaints: 3,
    complaints_assessed: 2,
    complaints_justified: 1,
    complaints_replied: 1,
    ...overrides,
  };
}

describe('feedback drill-down helpers (U23 QA)', () => {
  it('turns a trend month into its received-on window, clamped to the period', () => {
    const period = { from_date: '2025-12-01', to_date: '2026-11-18' };
    expect(monthQuery('2026-10', period)).toEqual({
      received_from: '2026-10-01',
      received_to: '2026-10-31',
    });
    expect(monthQuery('2026-11', period)).toEqual({
      received_from: '2026-11-01',
      received_to: '2026-11-18',
    });
    expect(monthQuery('2024-02', null)).toEqual({
      received_from: '2024-02-01',
      received_to: '2024-02-29',
    });
  });

  it('opens the complaint-handling rows with the rules the statistics count by', () => {
    expect(handlingQuery('assessed')).toEqual({ kind: 'complaint', assessed: 'true' });
    expect(handlingQuery('justified')).toEqual({ kind: 'complaint', justified: 'yes' });
    expect(handlingQuery('replied')).toEqual({ kind: 'complaint', replied: 'true' });
    const f = filtersFromParams(convertToParamMap({ assessed: 'true', replied: '1' }));
    expect(f.assessed).toBe(true);
    expect(f.replied).toBe(true);
    expect(filtersFromParams(convertToParamMap({})).assessed).toBe(false);
    expect(feedbackFilterParams({ assessed: true, replied: true })).toMatchObject({
      assessed: true,
      replied: true,
    });
  });

  it('sends the answer filters only when they are complete', () => {
    expect(
      responseListParams({ question_id: 'q1', value: '4', nps_group: 'promoter' }),
    ).toMatchObject({ question_id: 'q1', value: '4', nps_group: 'promoter' });
    expect(responseListParams({ question_id: 'q1' })['question_id']).toBeUndefined();
    expect(
      answersQuery('', false, '', {
        question_id: 'q1',
        value: 'yes',
        submitted_from: '2026-01-01',
        label: 'x',
      }),
    ).toMatchObject({ question_id: 'q1', value: 'yes', submitted_from: '2026-01-01' });
  });

  it('maps a results count onto the answers filter and its words', () => {
    const q: QuestionResult = {
      id: 'q1',
      type: 'yes_no',
      label: 'Recommend?',
      answered: 3,
      average: null,
      distribution: { yes: 2, no: 1 },
      nps: null,
      comments: [],
    };
    const [yes] = distributionRows(q);
    expect(yes).toMatchObject({ key: 'yes', count: 2, labelIsKey: true });
    expect(answerScopeFor({ kind: 'answer', question: q, row: yes }, t)).toMatchObject({
      question_id: 'q1',
      value: 'yes',
    });
    expect(answerScopeFor({ kind: 'nps', group: 'detractor' }, t)).toMatchObject({
      nps_group: 'detractor',
      label: 'feedback.answers.scopeNps.detractor',
    });
    expect(answerScopeFor({ kind: 'all' }, t)).toBeNull();
  });

  it('reads the cross-survey scope from a link and ignores junk', () => {
    const scope = answersScopeFromParams(
      convertToParamMap({ submitted_from: '2026-01-01', submitted_to: '2026-11-18' }),
      t,
    );
    expect(scope).toMatchObject({ submitted_from: '2026-01-01', submitted_to: '2026-11-18' });
    expect(answersScopeFromParams(convertToParamMap({ nps_group: 'fans', survey: 'x' }), t)).toBe(
      null,
    );
  });
});

describe('FeedbackStatsPanel links every count (U23 QA)', () => {
  it('links the handling rows, the monthly bars and the trend table counts', async () => {
    const { http } = configureKit(FeedbackStatsPanel, { permissions: ['feedback:read'] });
    const fixture = TestBed.createComponent(FeedbackStatsPanel);
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    for (const req of http.match(() => true)) {
      if (req.request.url === kitUrl('feedback/stats')) {
        req.flush(stats());
      } else {
        req.flush({ items: [], total: 0 });
      }
    }
    await render(fixture);
    const href = (id: string) =>
      el.querySelector<HTMLAnchorElement>(`[data-testid="${id}"]`)?.getAttribute('href') ?? '';
    const period = 'received_from=2025-12-01&received_to=2026-11-18';
    expect(href('handling-assessed')).toBe(`/feedback?${period}&kind=complaint&assessed=true`);
    expect(href('handling-justified')).toBe(`/feedback?${period}&kind=complaint&justified=yes`);
    expect(href('handling-replied')).toBe(`/feedback?${period}&kind=complaint&replied=true`);
    expect(href('month-2026-10')).toBe('/feedback?received_from=2026-10-01&received_to=2026-10-31');
    expect(href('trend-2026-11-complaints')).toBe(
      '/feedback?received_from=2026-11-01&received_to=2026-11-18&kind=complaint',
    );
    expect(href('trend-2026-11-compliments')).toContain('kind=compliment');
    // October had no compliments: a zero is not a link.
    expect(el.querySelector('[data-testid="trend-2026-10-compliments"]')).toBeNull();
    // The survey score's answer count opens those answers in the same period.
    expect(href('tile-surveyScore')).toBe(
      '/feedback/answers?submitted_from=2025-12-01&submitted_to=2026-11-18',
    );
  });
});

describe('FeedbackList scoped by a handling row (U23 QA)', () => {
  it('sends assessed / replied and shows what the list is limited to', async () => {
    const { http } = configureKit(FeedbackList, {
      permissions: ['feedback:read'],
      providers: [
        ...provideFakeGuidance().providers,
        {
          provide: NotificationService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
        },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/?kind=complaint&assessed=true');
    const fixture = TestBed.createComponent(FeedbackList);
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    const req = http.expectOne((r) => r.url === kitUrl('feedback/items'));
    expect(req.request.params.get('assessed')).toBe('true');
    expect(req.request.params.get('replied')).toBeNull();
    req.flush({ items: [], total: 0 });
    for (const other of http.match(() => true)) {
      if (!other.cancelled) {
        other.flush({ items: [], total: 0 });
      }
    }
    await render(fixture);
    expect(el.querySelector('[data-testid="assessed-filter"]')?.textContent).toContain(
      'feedback.list.handlingFilter.assessed',
    );
  });
});

describe('SurveyResultsView opens the answers behind each count (U23 QA)', () => {
  const results: SurveyResults = {
    survey_id: 's-1',
    response_count: 4,
    average_score: 70,
    nps: 25,
    promoters: 2,
    passives: 1,
    detractors: 1,
    first_response_at: null,
    last_response_at: null,
    questions: [
      {
        id: 'q1',
        type: 'rating',
        label: 'Overall?',
        answered: 4,
        average: 3.5,
        distribution: { '1': 0, '4': 2, '5': 2 },
        nps: null,
        comments: [],
      },
    ],
  };

  it('emits the count that was chosen; zeros are not buttons', async () => {
    configureKit(SurveyResultsView);
    const fixture = TestBed.createComponent(SurveyResultsView);
    fixture.componentRef.setInput('results', results);
    const drills: ResultsDrill[] = [];
    fixture.componentInstance.drill.subscribe((d) => drills.push(d));
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="results-responses"]')!.click();
    el.querySelector<HTMLButtonElement>('[data-testid="results-row-q1-4"]')!.click();
    el.querySelector<HTMLButtonElement>('[data-testid="results-promoters"]')!.click();
    el.querySelector<HTMLButtonElement>('[data-testid="results-nps-detractor"]')!.click();
    expect(el.querySelector('[data-testid="results-row-q1-1"]')).toBeNull();
    expect(drills.map((d) => d.kind)).toEqual(['all', 'answer', 'nps', 'nps']);
    const answer = drills[1];
    expect(answer.kind === 'answer' && answer.row.key).toBe('4');
    const detractors = drills[3];
    expect(detractors.kind === 'nps' && detractors.group).toBe('detractor');
  });
});

describe('AllAnswersPage: every survey answer in one table (U23 QA)', () => {
  it('lists answers from all surveys with their survey, scoped by the link', async () => {
    const { http } = configureKit(AllAnswersPage, {
      permissions: ['feedback:read', 'feedback:write'],
      providers: [
        {
          provide: NotificationService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
        },
      ],
    });
    await TestBed.inject(Router).navigateByUrl(
      '/?submitted_from=2025-12-01&submitted_to=2026-11-18',
    );
    const fixture = TestBed.createComponent(AllAnswersPage);
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    const req = http.expectOne((r) => r.url === kitUrl('feedback/survey-responses'));
    expect(req.request.params.get('submitted_from')).toBe('2025-12-01');
    expect(req.request.params.get('submitted_to')).toBe('2026-11-18');
    req.flush({
      items: [
        {
          id: 'r-1',
          submitted_at: '2026-11-01T10:00:00',
          answers: { q1: 2 },
          score: 25,
          nps: null,
          respondent_name: null,
          respondent_email: null,
          feedback_id: null,
          feedback_code: null,
          low_score: true,
          comment: 'Too slow',
          survey_id: 's-1',
          survey_code: 'SV-0001',
          survey_title: 'Customer survey',
        },
      ],
      total: 1,
    });
    await render(fixture);
    const link = el.querySelector<HTMLAnchorElement>('[data-testid="answer-survey-r-1"]');
    expect(link?.getAttribute('href')).toBe('/feedback/surveys/s-1');
    expect(link?.textContent).toContain('SV-0001');
    expect(el.textContent).toContain('Too slow');
    expect(el.querySelector('[data-testid="answers-scope"]')).toBeTruthy();

    // Making feedback from a row uses the row's own survey.
    el.querySelector<HTMLElement>('[data-testid="answer-make-feedback-r-1"] button')!.click();
    await render(fixture);
    const make = http.expectOne(kitUrl('feedback/surveys/s-1/responses/r-1/feedback'));
    make.flush({ id: 'f-9', code: 'FB-0009' });
    await render(fixture);
  });
});
