import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { KIT_BASE, configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { Feedback, FeedbackListItem, PublicSurvey, Survey } from './data/feedback.models';
import { FeedbackDetail } from './items/feedback-detail';
import { FeedbackList } from './items/feedback-list';
import { PublicSurveyPage } from './public/public-survey';
import { SurveyDetail } from './surveys/survey-detail';
import { SurveyForm } from './surveys/survey-form';
import { emptySurveyForm } from './data/survey-form-model';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

function toasts() {
  return { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
}

function makeItem(overrides: Partial<FeedbackListItem> = {}): FeedbackListItem {
  return {
    id: 'f-1',
    code: 'FB-0001',
    kind: 'complaint',
    channel: 'email',
    status: 'in_progress',
    severity: 'high',
    sentiment: 'negative',
    title: 'Delivery two days late',
    category: null,
    tags: ['delivery'],
    customer_name: 'Kari',
    customer_organisation: 'Nordic Retail',
    satisfaction_score: 2,
    received_on: '2026-11-01',
    response_due_on: '2026-11-04',
    overdue: true,
    owner: { id: 'u-1', name: 'Ada' },
    department_id: null,
    survey_id: null,
    url: '/feedback/items/f-1',
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-02T10:00:00',
    ...overrides,
  };
}

function makeFeedback(overrides: Partial<Feedback> = {}): Feedback {
  return {
    ...makeItem(),
    description: 'The parcel arrived late.',
    customer_email: 'kari@example.com',
    customer_phone: null,
    product_or_service: 'Delivery',
    resolution: null,
    customer_informed: false,
    acknowledged_at: '2026-11-01T11:00:00',
    resolved_at: null,
    closed_at: null,
    survey_response_id: null,
    created_by: { id: 'u-1', name: 'Ada' },
    linked_deviations: [],
    open_tasks: 0,
    allowed_actions: ['resolve'],
    can_edit: true,
    can_delete: false,
    ...overrides,
  };
}

function makeSurvey(overrides: Partial<Survey> = {}): Survey {
  return {
    id: 's-1',
    code: 'SV-0001',
    title: 'Customer satisfaction 2026',
    status: 'open',
    anonymous: true,
    question_count: 1,
    response_count: 0,
    average_score: null,
    last_response_at: null,
    opens_on: null,
    closes_on: null,
    owner: { id: 'u-1', name: 'Ada' },
    url: '/feedback/surveys/s-1',
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    description: null,
    questions: [{ id: 'q1', type: 'rating', label: 'Overall?', required: true, scale: 5 }],
    thank_you_message: null,
    low_score_threshold: 40,
    public_token: 'tok12345',
    public_path: '/survey/tok12345',
    accepting_responses: true,
    published_at: '2026-11-01T10:00:00',
    closed_at: null,
    created_by: { id: 'u-1', name: 'Ada' },
    allowed_actions: ['close'],
    can_edit: true,
    questions_locked: true,
    ...overrides,
  };
}

/** Answer the record kit's side requests (entity types, attachments, tasks, links…). */
function flushSideRequests(http: ReturnType<typeof configureKit>['http']) {
  for (const req of http.match(() => true)) {
    if (!req.cancelled) {
      req.flush(
        req.request.url.endsWith('entity-types')
          ? { items: [], link_types: [] }
          : { items: [], total: 0 },
      );
    }
  }
}

describe('FeedbackList', () => {
  function setup(permissions: readonly string[] = ['feedback:read', 'feedback:write']) {
    const { http } = configureKit(FeedbackList, {
      permissions,
      providers: [...provideFakeGuidance().providers],
    });
    const fixture = TestBed.createComponent(FeedbackList);
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  const listUrl = kitUrl('feedback/items');

  it('loads the register and renders each row with its reply date', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('sort')).toBe('-received_on');
    expect(req.request.params.has('open')).toBe(false);
    req.flush({ items: [makeItem()], total: 1 });
    await render(fixture);
    const rows = el.querySelector('[data-testid="feedback-rows"]');
    expect(rows?.textContent).toContain('FB-0001');
    expect(rows?.textContent).toContain('Delivery two days late');
    expect(rows?.textContent).toContain('feedback.kinds.complaint');
    expect(el.querySelector('[data-testid="new-feedback"]')).toBeTruthy();
  });

  it('re-queries with the open flag and the overdue filter', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http.expectOne((r) => r.url === listUrl).flush({ items: [makeItem()], total: 1 });
    await render(fixture);
    const select = el.querySelector<HTMLSelectElement>('[data-testid="filter-status"]')!;
    select.value = 'open';
    select.dispatchEvent(new Event('change'));
    await render(fixture);
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('open')).toBe('true');
    req.flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="no-match"]')).toBeTruthy();

    const overdue = el.querySelector<HTMLInputElement>('[data-testid="filter-overdue"]')!;
    overdue.checked = true;
    overdue.dispatchEvent(new Event('change'));
    await render(fixture);
    expect(http.expectOne((r) => r.url === listUrl).request.params.get('overdue')).toBe('true');
  });

  it('hides "register" without write permission', async () => {
    const { http, fixture, el } = setup(['feedback:read']);
    await render(fixture);
    http.expectOne((r) => r.url === listUrl).flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="new-feedback"]')).toBeNull();
    expect(el.querySelector('[data-testid="feedback-rows"]')).toBeNull();
  });
});

describe('FeedbackDetail', () => {
  function setup(feedback = makeFeedback()) {
    const notify = toasts();
    const { http } = configureKit(FeedbackDetail, {
      permissions: ['feedback:read', 'feedback:write'],
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
      ],
    });
    const fixture = TestBed.createComponent(FeedbackDetail);
    fixture.componentRef.setInput('id', feedback.id);
    return { http, fixture, notify, el: fixture.nativeElement as HTMLElement };
  }

  async function loaded(feedback = makeFeedback()) {
    const ctx = setup(feedback);
    await render(ctx.fixture);
    ctx.http.expectOne(kitUrl(`feedback/items/${feedback.id}`)).flush(feedback);
    await render(ctx.fixture);
    flushSideRequests(ctx.http);
    await render(ctx.fixture);
    return ctx;
  }

  it('renders the record with its kind, status and overdue reply date', async () => {
    const { el } = await loaded();
    expect(el.querySelector('[data-testid="feedback-heading"]')?.textContent).toContain(
      'Delivery two days late',
    );
    expect(el.querySelector('[data-testid="feedback-kind"]')?.textContent).toContain(
      'feedback.kinds.complaint',
    );
    expect(el.querySelector('[data-testid="feedback-due"]')?.classList).toContain('text-fail');
    expect(el.querySelector('[data-testid="action-resolve"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="no-deviations"]')).toBeTruthy();
  });

  it('requires a resolution before resolving a complaint, then posts it', async () => {
    const { el, http, fixture, notify } = await loaded();
    el.querySelector<HTMLElement>('[data-testid="action-resolve"] button')!.click();
    await render(fixture);
    const dialog = document.querySelector('[role="alertdialog"]') ?? el;
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('feedback.actions.resolve'),
    )!;
    expect(confirm.disabled).toBe(true);
    const text = dialog.querySelector<HTMLTextAreaElement>('[data-testid="action-resolution"]')!;
    text.value = 'Refunded the shipping cost';
    text.dispatchEvent(new Event('input'));
    await render(fixture);
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('feedback/items/f-1/actions/resolve'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      resolution: 'Refunded the shipping cost',
      customer_informed: false,
    });
    req.flush(
      makeFeedback({
        status: 'resolved',
        resolution: 'Refunded the shipping cost',
        allowed_actions: ['close', 'reopen'],
      }),
    );
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('feedback.notices.actions.resolve', {
      code: 'FB-0001',
    });
    expect(el.querySelector('[data-testid="feedback-status"]')?.textContent).toContain(
      'feedback.status.resolved',
    );
    expect(el.querySelector('[data-testid="feedback-resolution"]')?.textContent).toContain(
      'Refunded',
    );
  });

  it('shows a coded error when the record cannot be loaded', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http
      .expectOne(kitUrl('feedback/items/f-1'))
      .flush({ detail: { code: 'module_disabled' } }, { status: 404, statusText: 'Not Found' });
    await render(fixture);
    expect(el.textContent).toContain('feedback.errors.module_disabled');
  });
});

describe('SurveyDetail', () => {
  it('shows the public link, the questions and the results', async () => {
    const notify = toasts();
    const { http } = configureKit(SurveyDetail, {
      permissions: ['feedback:read', 'feedback:manage'],
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
      ],
    });
    const fixture = TestBed.createComponent(SurveyDetail);
    fixture.componentRef.setInput('id', 's-1');
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    http.expectOne(kitUrl('feedback/surveys/s-1')).flush(makeSurvey());
    await render(fixture);
    http.expectOne(kitUrl('feedback/surveys/s-1/results')).flush({
      survey_id: 's-1',
      response_count: 0,
      average_score: null,
      nps: null,
      promoters: 0,
      passives: 0,
      detractors: 0,
      first_response_at: null,
      last_response_at: null,
      questions: [],
    });
    http
      .expectOne((r) => r.url === kitUrl('feedback/surveys/s-1/responses'))
      .flush({ items: [], total: 0 });
    flushSideRequests(http);
    await render(fixture);
    expect(el.querySelector<HTMLInputElement>('[data-testid="survey-link"]')?.value).toMatch(
      /\/survey\/tok12345$/,
    );
    expect(el.querySelector('[data-testid="survey-questions"]')?.textContent).toContain('Overall?');
    expect(el.querySelector('[data-testid="results-empty"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="survey-action-close"]')).toBeTruthy();
  });
});

describe('SurveyForm', () => {
  it('adds the starter questions, validates and emits the value', async () => {
    const { http } = configureKit(SurveyForm, { providers: [...provideFakeGuidance().providers] });
    const fixture = TestBed.createComponent(SurveyForm);
    fixture.componentRef.setInput('value', emptySurveyForm());
    const submitted: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((v) => submitted.push(v));
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    flushSideRequests(http);
    await render(fixture);

    el.querySelector<HTMLElement>('[data-testid="add-starter"] button')!.click();
    await render(fixture);
    expect(el.querySelectorAll('[data-testid="question-list"] > li').length).toBe(3);

    el.querySelector<HTMLElement>('[data-testid="survey-save"] button')!.click();
    await render(fixture);
    expect(submitted.length).toBe(0);
    expect(el.textContent).toContain('feedback.surveyForm.errors.titleRequired');

    const title = el.querySelector<HTMLInputElement>('[data-testid="survey-title"]')!;
    title.value = 'Satisfaction';
    title.dispatchEvent(new Event('input'));
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="survey-save"] button')!.click();
    await render(fixture);
    expect(submitted.length).toBe(1);
  });
});

describe('PublicSurveyPage', () => {
  const survey: PublicSurvey = {
    title: 'How did we do?',
    description: null,
    organisation_name: 'Acme',
    anonymous: true,
    closes_on: null,
    questions: [
      { id: 'q1', type: 'rating', label: 'Overall?', required: true, scale: 5 },
      { id: 'q2', type: 'text', label: 'Anything else?' },
    ],
  };
  const publicUrl = `${KIT_BASE}/v1/public/surveys/tok12345`;

  function setup() {
    const { http } = configureKit(PublicSurveyPage);
    const fixture = TestBed.createComponent(PublicSurveyPage);
    fixture.componentRef.setInput('token', 'tok12345');
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('checks required answers, then submits and thanks the respondent', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http.expectOne(publicUrl).flush(survey);
    await render(fixture);
    expect(el.querySelector('[data-testid="public-survey-title"]')?.textContent).toContain(
      'How did we do?',
    );

    el.querySelector<HTMLElement>('[data-testid="public-submit"] button')!.click();
    await render(fixture);
    http.expectNone(`${publicUrl}/responses`);
    expect(el.textContent).toContain('feedback.answer.missing');

    const four = el.querySelectorAll<HTMLInputElement>('[data-testid="question-q1"] input')[3];
    four.click();
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="public-submit"] button')!.click();
    await render(fixture);
    const req = http.expectOne(`${publicUrl}/responses`);
    expect(req.request.body).toEqual({ answers: { q1: 4 } });
    req.flush({ thank_you_message: 'Thanks a lot' });
    await render(fixture);
    expect(el.querySelector('[data-testid="survey-thanks"]')?.textContent).toContain(
      'Thanks a lot',
    );
  });

  it('shows a neutral message for a survey that is not available', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http
      .expectOne(publicUrl)
      .flush(
        { detail: { code: 'survey_not_available' } },
        { status: 404, statusText: 'Not Found' },
      );
    await render(fixture);
    expect(el.querySelector('[data-testid="survey-unavailable"]')).toBeTruthy();
  });
});
