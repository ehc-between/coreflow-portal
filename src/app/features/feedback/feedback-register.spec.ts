import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, convertToParamMap } from '@angular/router';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { feedbackFilterParams, responseListParams } from './data/feedback-api';
import { FeedbackListItem, FeedbackStats, Survey, SurveyResponse } from './data/feedback.models';
import { periodQuery } from './insights/feedback-stats-panel';
import { complaintDeviationTone } from './items/complaint-deviations';
import { KEEP_OWNER, NO_OWNER, bulkBody, bulkErrorKey } from './items/feedback-bulk-bar';
import {
  FeedbackList,
  filterParamsKey,
  filtersFromParams,
  statusQuery,
  statusWord,
} from './items/feedback-list';
import { SurveyAnswers, answersQuery } from './surveys/survey-answers';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

function item(overrides: Partial<FeedbackListItem> = {}): FeedbackListItem {
  return {
    id: 'f-1',
    code: 'FB-0001',
    kind: 'complaint',
    channel: 'survey',
    status: 'acknowledged',
    severity: null,
    sentiment: 'negative',
    title: 'Slow answer',
    category: null,
    tags: [],
    customer_name: null,
    customer_organisation: null,
    satisfaction_score: 2,
    received_on: '2026-10-01',
    response_due_on: null,
    overdue: false,
    owner: null,
    department_id: null,
    survey_id: 's-1',
    source: 'survey',
    customer_informed: false,
    url: '/feedback/items/f-1',
    created_at: '2026-10-01T10:00:00',
    updated_at: '2026-10-01T10:00:00',
    ...overrides,
  };
}

function stats(): FeedbackStats {
  return {
    band: {
      open: 5,
      complaints: 3,
      complaint_deviations: 1,
      unanswered: 1,
      unanswered_days: 14,
      average_satisfaction: 3.94,
    },
    by_source: { manual: 4, survey: 2, public_form: 0 },
    from_date: '2025-12-01',
    to_date: '2026-11-18',
    total: 6,
    by_kind: {},
    by_status: {},
    by_channel: {},
    by_sentiment: {},
    open_complaints: 2,
    overdue: 0,
    average_satisfaction: 3.9,
    satisfaction_count: 4,
    average_days_to_resolve: null,
    monthly: [],
    survey_responses: 4,
    survey_average_score: null,
    nps: null,
  };
}

describe('feedback register helpers (U23)', () => {
  it('maps the statuses onto three plain words and back to queries', () => {
    expect(statusWord('new')).toBe('new');
    expect(statusWord('acknowledged')).toBe('in_work');
    expect(statusWord('in_progress')).toBe('in_work');
    expect(statusWord('resolved')).toBe('done');
    expect(statusWord('closed')).toBe('done');
    expect(statusQuery('in_work')).toEqual({ status: ['acknowledged', 'in_progress'] });
    expect(statusQuery('done')).toEqual({ status: ['resolved', 'closed'] });
    expect(statusQuery('open')).toEqual({ open: true });
    expect(statusQuery('resolved')).toEqual({ status: ['resolved'] });
    expect(statusQuery('all')).toEqual({});
  });

  it('reads source, tone, "no reply" and the period from a link', () => {
    const f = filtersFromParams(
      convertToParamMap({
        source: 'survey',
        sentiment: 'negative',
        unanswered_days: '14',
        received_from: '2026-01-01',
        received_to: 'nonsense',
      }),
    );
    expect(f).toMatchObject({
      source: 'survey',
      sentiment: 'negative',
      unanswered: 14,
      from: '2026-01-01',
      to: '',
    });
    expect(filtersFromParams(convertToParamMap({ unanswered: '1' })).unanswered).toBe(14);
    expect(filtersFromParams(convertToParamMap({ source: 'klage' })).source).toBe('');
  });

  it('ignores the statistics switch when deciding whether the filters changed', () => {
    expect(filterParamsKey(convertToParamMap({ kind: 'complaint', stats: '1' }))).toBe(
      filterParamsKey(convertToParamMap({ kind: 'complaint' })),
    );
  });

  it('sends the new list filters as the backend expects', () => {
    expect(
      feedbackFilterParams({
        sentiment: ['negative'],
        source: ['manual', 'survey'],
        unanswered_days: 14,
      }),
    ).toMatchObject({ sentiment: 'negative', source: 'manual,survey', unanswered_days: 14 });
    expect(responseListParams({ q: ' late ', low: true, has_feedback: false })).toEqual({
      q: 'late',
      low: true,
      has_feedback: false,
      limit: undefined,
      offset: undefined,
    });
    expect(answersQuery('', false, '')).toEqual({
      q: undefined,
      low: undefined,
      has_feedback: undefined,
    });
    expect(answersQuery('x', true, 'no')).toEqual({ q: 'x', low: true, has_feedback: false });
  });

  it('builds the bulk body: keep the owner by leaving it out, null unassigns', () => {
    expect(bulkBody(['a'], '', KEEP_OWNER)).toBeNull();
    expect(bulkBody([], 'close', KEEP_OWNER)).toBeNull();
    expect(bulkBody(['a'], 'close', KEEP_OWNER)).toEqual({ ids: ['a'], action: 'close' });
    expect(bulkBody(['a'], '', NO_OWNER)).toEqual({ ids: ['a'], owner_user_id: null });
    expect(bulkBody(['a', 'b'], 'start', 'u-2')).toEqual({
      ids: ['a', 'b'],
      action: 'start',
      owner_user_id: 'u-2',
    });
    expect(bulkErrorKey('invalid_transition')).toBe('feedback.errors.invalid_transition');
    expect(bulkErrorKey('who_knows')).toBe('errors.generic');
  });

  it('adds the period to the statistics drill-downs and maps deviation categories', () => {
    expect(periodQuery({ from_date: '2026-01-01', to_date: '2026-11-18' })).toEqual({
      received_from: '2026-01-01',
      received_to: '2026-11-18',
    });
    expect(periodQuery(null)).toEqual({});
    expect(complaintDeviationTone('done')).toBe('closed');
    expect(complaintDeviationTone('in_progress')).toBe('in_progress');
  });
});

describe('FeedbackList as one register (U23)', () => {
  const listUrl = kitUrl('feedback/items');

  function setup(permissions: readonly string[] = ['feedback:read', 'feedback:write']) {
    const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const { http } = configureKit(FeedbackList, {
      permissions,
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
      ],
    });
    return { http, notify };
  }

  function flushOthers(http: ReturnType<typeof setup>['http'], band = stats()) {
    for (const req of http.match((r) => r.url !== listUrl)) {
      if (req.cancelled) {
        continue;
      }
      if (req.request.url === kitUrl('feedback/stats')) {
        req.flush(band);
      } else if (req.request.url === kitUrl('feedback/complaint-deviations')) {
        req.flush({
          available: true,
          total: 1,
          items: [
            {
              id: 'd-1',
              code: 'KLG-1',
              title: 'Wrong invoice',
              type_name: 'Customer complaint',
              status: 'open',
              status_category: 'open',
              severity: null,
              raised_at: '2026-10-01T10:00:00',
              due_at: null,
              overdue: false,
              owner: null,
              url: '/deviations/d-1',
              linked_feedback: [{ id: 'f-2', code: 'FB-0002', url: '/feedback/items/f-2' }],
            },
          ],
        });
      } else {
        req.flush({ items: [], total: 0 });
      }
    }
  }

  it('shows a band of four tiles; each count links to the list it counts', async () => {
    const { http } = setup();
    const fixture = TestBed.createComponent(FeedbackList);
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    http.expectOne((r) => r.url === listUrl).flush({ items: [item()], total: 1 });
    flushOthers(http);
    await render(fixture);

    const tiles = el.querySelectorAll('[data-testid^="kpi-"]:not([data-testid^="kpi-band"])');
    expect(tiles.length).toBe(4);
    const href = (key: string) =>
      el.querySelector<HTMLAnchorElement>(`[data-testid="kpi-${key}"]`)?.getAttribute('href');
    expect(href('open')).toBe('/feedback?open=true');
    expect(href('complaints')).toBe('/feedback?kind=complaint');
    expect(href('unanswered')).toBe('/feedback?unanswered_days=14');
    expect(el.querySelector('[data-testid="kpi-open"]')?.textContent).toContain('5');
    // The average has no list: it folds out the statistics instead.
    const satisfaction = el.querySelector<HTMLButtonElement>('[data-testid="kpi-satisfaction"]')!;
    expect(satisfaction.tagName).toBe('BUTTON');
    expect(satisfaction.getAttribute('aria-expanded')).toBe('false');
    // The low score is flagged on the row.
    expect(el.querySelector('[data-testid="low-score"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="filter-source"]')).toBeTruthy();
  });

  it('opens filtered from the URL and cross-lists complaints recorded as deviations', async () => {
    const { http } = setup(['feedback:read', 'deviations:read']);
    await TestBed.inject(Router).navigateByUrl('/?kind=complaint');
    const fixture = TestBed.createComponent(FeedbackList);
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('kind')).toBe('complaint');
    expect(req.request.params.get('sort')).toBe('-received_on');
    req.flush({ items: [item()], total: 1 });
    await render(fixture);
    flushOthers(http);
    await render(fixture);
    const cross = el.querySelector('[data-testid="complaint-deviations"]');
    expect(cross?.textContent).toContain('KLG-1');
    expect(el.querySelector('[data-testid="linked-FB-0002"]')).toBeTruthy();
    // Without write permission there is no selection.
    expect(el.querySelector('[data-testid="select-FB-0001"]')).toBeNull();
  });

  it('selects rows and changes them in one go, keeping the refused ones selected', async () => {
    const { http, notify } = setup();
    const fixture = TestBed.createComponent(FeedbackList);
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    http
      .expectOne((r) => r.url === listUrl)
      .flush({ items: [item(), item({ id: 'f-3', code: 'FB-0003' })], total: 2 });
    flushOthers(http);
    await render(fixture);

    const all = el.querySelector<HTMLInputElement>('[data-testid="select-page"]')!;
    all.checked = true;
    all.dispatchEvent(new Event('change'));
    await render(fixture);
    expect(el.querySelector('[data-testid="bulk-bar"]')?.textContent).toContain(
      'feedback.bulk.selected',
    );
    const action = el.querySelector<HTMLSelectElement>('[data-testid="bulk-action"]')!;
    action.value = 'close';
    action.dispatchEvent(new Event('change'));
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="bulk-apply"] button')!.click();
    await render(fixture);
    const bulk = http.expectOne(kitUrl('feedback/items/bulk'));
    expect(bulk.request.body).toEqual({ ids: ['f-1', 'f-3'], action: 'close' });
    bulk.flush({
      updated: ['f-1'],
      failed: [{ id: 'f-3', code: 'FB-0003', error: 'resolution_required' }],
    });
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('feedback.bulk.done', { count: 1 });
    expect(notify.warning).toHaveBeenCalled();
    http
      .expectOne((r) => r.url === listUrl)
      .flush({
        items: [item({ status: 'closed' }), item({ id: 'f-3', code: 'FB-0003' })],
        total: 2,
      });
    flushOthers(http);
    await render(fixture);
    expect(el.querySelector<HTMLInputElement>('[data-testid="select-FB-0003"]')?.checked).toBe(
      true,
    );
    expect(el.querySelector<HTMLInputElement>('[data-testid="select-FB-0001"]')?.checked).toBe(
      false,
    );
  });
});

describe('SurveyAnswers', () => {
  const survey = {
    id: 's-1',
    code: 'SV-0001',
    questions: [
      { id: 'q1', type: 'rating', label: 'Overall?', required: true, scale: 5 },
      { id: 'q2', type: 'text', label: 'Anything else?' },
    ],
  } as unknown as Survey;

  function response(overrides: Partial<SurveyResponse> = {}): SurveyResponse {
    return {
      id: 'r-1',
      submitted_at: '2026-11-01T10:00:00',
      answers: { q1: 1, q2: 'Too slow' },
      score: 0,
      nps: null,
      respondent_name: null,
      respondent_email: null,
      feedback_id: null,
      feedback_code: null,
      low_score: true,
      comment: 'Too slow',
      ...overrides,
    };
  }

  it('lists answers with low scores flagged and turns one into feedback', async () => {
    const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const { http } = configureKit(SurveyAnswers, {
      permissions: ['feedback:read', 'feedback:write'],
      providers: [{ provide: NotificationService, useValue: notify }],
    });
    const fixture = TestBed.createComponent(SurveyAnswers);
    fixture.componentRef.setInput('survey', survey);
    fixture.componentRef.setInput('canWrite', true);
    const counted: number[] = [];
    fixture.componentInstance.counted.subscribe((n) => counted.push(n));
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    http
      .expectOne((r) => r.url === kitUrl('feedback/surveys/s-1/responses'))
      .flush({
        items: [response(), response({ id: 'r-2', low_score: false, score: 90, comment: null })],
        total: 2,
        low_score_threshold: 40,
      });
    await render(fixture);
    expect(counted).toEqual([2]);
    expect(el.querySelectorAll('[data-testid="answer-low"]').length).toBe(1);
    expect(el.textContent).toContain('Too slow');

    el.querySelector<HTMLElement>('[data-testid="answer-make-feedback-r-1"] button')!.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('feedback/surveys/s-1/responses/r-1/feedback'));
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'f-9', code: 'FB-0009' });
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('feedback.answers.created', { code: 'FB-0009' });
    expect(el.querySelector('[data-testid="answer-feedback-r-1"]')).toBeTruthy();

    const low = el.querySelector<HTMLInputElement>('[data-testid="answers-low"]')!;
    low.checked = true;
    low.dispatchEvent(new Event('change'));
    await render(fixture);
    expect(
      http
        .expectOne((r) => r.url === kitUrl('feedback/surveys/s-1/responses'))
        .request.params.get('low'),
    ).toBe('true');
  });
});
