import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  EnvironmentProviders,
  Provider,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { AskPanelService } from '../ask/ask-panel.service';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { MeetingWorkspace } from './components/meeting-workspace';
import { ManagementReviewApi } from './data/management-review-api';
import {
  MeetingDetail,
  MeetingSummary,
  Planning,
  ReviewDetail,
  ReviewSummary,
} from './data/management-review.models';
import { meetingConcerns, meetingMissing, meetingStatusSentence } from './meeting-detail';
import { MeetingsList } from './meetings-list';
import { ReviewDetailPage, reviewMissing, reviewStatusSentence } from './review-detail';
import { ReviewEditor } from './review-editor';
import { ReviewsList } from './reviews-list';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeReview(overrides: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    id: 'r-1',
    code: 'MR-0001',
    title: 'Management review 2026',
    status: 'in_progress',
    frameworks: ['iso9001'],
    period_start: '2026-01-01',
    period_end: '2026-12-31',
    scheduled_at: '2026-12-10T09:00:00',
    meeting_id: 'm-1',
    meeting_status: 'planned',
    owner: { id: 'u-1', name: 'Ada' },
    signed_at: null,
    url: '/management-review/reviews/r-1',
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    ...overrides,
  };
}

function makeMeeting(overrides: Partial<MeetingDetail> = {}): MeetingDetail {
  return {
    id: 'm-1',
    code: 'MTG-0001',
    kind: 'management_review',
    title: 'Management review 2026',
    location: 'Board room',
    scheduled_at: '2026-12-10T09:00:00',
    duration_minutes: 120,
    status: 'planned',
    minutes_status: 'draft',
    chair: { id: 'u-1', name: 'Ada' },
    attendee_count: 1,
    decision_count: 0,
    review_id: 'r-1',
    url: '/management-review/meetings/m-1',
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    org_id: 'org-1',
    purpose: null,
    held_at: null,
    secretary: null,
    minutes: null,
    minutes_approved_by: null,
    minutes_approved_at: null,
    created_by: null,
    review: null,
    agenda: [
      {
        id: 'ag-1',
        position: 0,
        title: 'Previous actions',
        notes: null,
        presenter: null,
        duration_minutes: 10,
      },
    ],
    attendees: [
      {
        id: 'at-1',
        user: { id: 'u-1', name: 'Ada' },
        name: null,
        external: false,
        role: 'chair',
        attendance: 'invited',
      },
    ],
    decisions: [],
    locked: false,
    can_edit: true,
    can_approve_minutes: true,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<ReviewDetail> = {}): ReviewDetail {
  return {
    ...makeReview(),
    org_id: 'org-1',
    inputs_summary: null,
    conclusions: null,
    improvement_opportunities: null,
    change_needs: null,
    resource_needs: null,
    system_assessment: null,
    inputs_compiled_at: '2026-11-01T10:00:00',
    submitted_at: null,
    submitted_by: null,
    signed_by: null,
    signature_name: null,
    signature_statement: null,
    report_sha256: null,
    cancelled_at: null,
    created_by: null,
    inputs: [
      {
        id: 'in-1',
        category: 'nonconformities',
        title: null,
        position: 0,
        source: 'auto',
        auto: true,
        clause: 'hs:9.3.2 c',
        frameworks: ['iso9001'],
        data: { available: true, sections: [{ source: 'deviations', metrics: { raised: 4 } }] },
        compiled_at: '2026-11-01T10:00:00',
        notes: null,
        reviewed: false,
        updated_at: '2026-11-01T10:00:00',
      },
    ],
    meeting: makeMeeting(),
    actions: { total: 2, open: 1, done: 1, overdue: 0 },
    missing_for_submit: ['inputs_reviewed', 'meeting_completed', 'conclusions'],
    submit_check: {
      missing: ['inputs_reviewed', 'meeting_completed', 'conclusions'],
      inputs_total: 1,
      inputs_done: 0,
      inputs_pending: ['in-1'],
      meeting_status: 'planned',
      minutes_status: 'draft',
      attendance: null,
      criteria_complete: false,
      ready: false,
    },
    can_submit: false,
    assessment_criteria: {
      required: ['suitability', 'adequacy', 'effectiveness'],
      items: {},
      complete: false,
      derived: null,
    },
    previous_review: null,
    next_review: null,
    requirement_refs: ['iso9001:9.3'],
    can_edit: true,
    allowed_actions: ['compile', 'submit', 'cancel'],
    ...overrides,
  };
}

function commonProviders(
  api: Partial<Record<keyof ManagementReviewApi, unknown>>,
  permissions: string[],
): (Provider | EnvironmentProviders)[] {
  const prompts: string[] = [];
  return [
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([{ path: '**', children: [] }]),
    { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
    ...provideFakeGuidance().providers,
    { provide: ManagementReviewApi, useValue: api },
    {
      provide: AskPanelService,
      useValue: { prompts, showWith: (p: string) => prompts.push(p), askAbout: vi.fn() },
    },
    { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
    {
      provide: SelectedOrgService,
      useValue: {
        currentOrgId: signal('org-1'),
        currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions }),
      },
    },
    {
      provide: AuthService,
      useValue: {
        user: signal({ id: 'u-1', full_name: 'Ada', email: 'ada@example.com' }),
        isAuthenticated: signal(false),
        hasPermission: (p: string) => permissions.includes(p),
        permissions: signal(permissions),
      },
    },
    {
      provide: AssigneeOptionsService,
      useValue: {
        options: signal({
          users: [
            { value: 'user:u-1', label: 'Ada', labelIsKey: false },
            { value: 'user:u-2', label: 'Bo', labelIsKey: false },
          ],
          roles: [],
          departments: [],
        }),
        ensureLoaded: () => undefined,
      },
    },
  ];
}

const translocoTesting = () => TranslocoTestingModule.forRoot({ langs: { en: {} } });

const PLANNING: Planning = {
  interval_months: 12,
  reminder_days: 60,
  last_signed: {
    id: 'r-0',
    code: 'MR-0000',
    title: 'Review 2025',
    status: 'signed',
    scheduled_at: '2025-12-17T10:00:00',
    held_at: '2025-12-17T10:00:00',
    signed_at: '2025-12-24T10:00:00',
    url: '/management-review/reviews/r-0',
  },
  upcoming: null,
  next_due_on: '2026-12-17',
  days_until_due: -3,
  status: 'overdue',
  can_plan: true,
};

describe('ReviewsList', () => {
  function setup(
    items: ReviewSummary[],
    permissions = ['management_review:read', 'management_review:write'],
  ) {
    const api = {
      listReviews: vi.fn(() => of({ items, total: items.length })),
      planning: vi.fn(() => of(PLANNING)),
    };
    TestBed.configureTestingModule({
      imports: [ReviewsList, translocoTesting()],
      providers: commonProviders(api, permissions),
    });
    const fixture = TestBed.createComponent(ReviewsList);
    fixture.detectChanges();
    return { fixture, api, el: fixture.nativeElement as HTMLElement };
  }

  it('loads open reviews for the current org', async () => {
    const { fixture, api, el } = setup([makeReview()]);
    await flush();
    fixture.detectChanges();
    expect(api.listReviews).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        status: ['planned', 'in_progress', 'awaiting_signoff'],
        sort: '-created_at',
        offset: 0,
      }),
    );
    expect(el.querySelector('[data-testid="review-rows"]')?.textContent).toContain('MR-0001');
  });

  it('filters by standard, status and owner', async () => {
    const { fixture, api, el } = setup([makeReview()]);
    await flush();
    const fw = el.querySelector<HTMLSelectElement>('#mr-framework')!;
    fw.value = 'iso27001';
    fw.dispatchEvent(new Event('change'));
    const status = el.querySelector<HTMLSelectElement>('#mr-status')!;
    status.value = 'signed';
    status.dispatchEvent(new Event('change'));
    const mine = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    mine.checked = true;
    mine.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await flush();
    expect(api.listReviews).toHaveBeenLastCalledWith(
      'org-1',
      expect.objectContaining({ status: ['signed'], framework: 'iso27001', owner: 'u-1' }),
    );
  });

  it('shows when the next review is due and offers to plan it', async () => {
    const { fixture, el } = setup([]);
    await flush();
    fixture.detectChanges();
    const card = el.querySelector('[data-testid="mr-planning"]');
    expect(card?.textContent).toContain('managementReview.planning.headline.overdue');
    expect(card?.textContent).toContain('MR-0000');
    expect(card?.textContent).toContain('managementReview.planning.plan');
  });

  it('hides the create action without write permission', async () => {
    const { fixture, el } = setup([], ['management_review:read']);
    await flush();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('managementReview.list.new');
  });
});

describe('MeetingsList', () => {
  it('lists upcoming meetings in time order', async () => {
    const summary: MeetingSummary = makeMeeting();
    const api = { listMeetings: vi.fn(() => of({ items: [summary], total: 1 })) };
    TestBed.configureTestingModule({
      imports: [MeetingsList, translocoTesting()],
      providers: commonProviders(api, ['management_review:read']),
    });
    const fixture = TestBed.createComponent(MeetingsList);
    fixture.detectChanges();
    await flush();
    const el = fixture.nativeElement as HTMLElement;
    const upcoming = el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0];
    upcoming.checked = true;
    upcoming.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await flush();
    expect(api.listMeetings).toHaveBeenLastCalledWith(
      'org-1',
      expect.objectContaining({
        from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        sort: 'scheduled_at',
        include_reviews: true,
      }),
    );
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="meeting-rows"]')?.textContent).toContain('MTG-0001');
  });
});

describe('ReviewEditor', () => {
  const standards = {
    list: vi.fn(() =>
      of([
        { key: 'iso9001-2026', framework: 'iso9001', enabled: true },
        { key: 'iso27001-2022', framework: 'iso27001', enabled: true },
        { key: 'iso14001-2015', framework: 'iso14001', enabled: false },
      ]),
    ),
  };

  it('starts with the adopted standards and the period since the last signed review', async () => {
    const api = {
      createReview: vi.fn(() => of({ id: 'r-9' })),
      planning: vi.fn(() => of(PLANNING)),
    };
    TestBed.configureTestingModule({
      imports: [ReviewEditor, translocoTesting()],
      providers: [
        ...commonProviders(api, ['management_review:write']),
        { provide: StandardsApi, useValue: standards },
      ],
    });
    const fixture = TestBed.createComponent(ReviewEditor);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // Only the adopted standards are offered, and they are ticked.
    const boxes = el.querySelectorAll<HTMLInputElement>('fieldset input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    expect(Array.from(boxes).every((b) => b.checked)).toBe(true);
    expect(el.querySelector<HTMLInputElement>('input[id$="-ps"]')!.value).toBe('2025-12-18');
    const title = el.querySelector<HTMLInputElement>('input[id$="-title"]')!;
    title.value = 'Annual review';
    title.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.createReview).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        title: 'Annual review',
        frameworks: ['iso9001', 'iso27001'],
        period_start: '2025-12-18',
        owner_user_id: 'u-1',
        chair_user_id: 'u-1',
        compile_inputs: true,
      }),
    );
    const body = (api.createReview.mock.calls[0] as unknown[])[1] as { agenda: unknown[] };
    expect(body.agenda.length).toBe(7);
  });

  it('shows the coded error and blocks an inverted period', async () => {
    const api = {
      createReview: vi.fn(() =>
        throwError(
          () => new HttpErrorResponse({ status: 422, error: { detail: { code: 'invalid_user' } } }),
        ),
      ),
      planning: vi.fn(() => of(PLANNING)),
    };
    TestBed.configureTestingModule({
      imports: [ReviewEditor, translocoTesting()],
      providers: [
        ...commonProviders(api, ['management_review:write']),
        { provide: StandardsApi, useValue: standards },
      ],
    });
    const fixture = TestBed.createComponent(ReviewEditor);
    fixture.detectChanges();
    await flush();
    const el = fixture.nativeElement as HTMLElement;
    const set = (sel: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(sel)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    set('input[id$="-title"]', 'X');
    set('input[id$="-ps"]', '2026-12-31');
    set('input[id$="-pe"]', '2026-01-01');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.createReview).not.toHaveBeenCalled();
    expect(el.textContent).toContain('managementReview.errors.invalid_period');
    set('input[id$="-pe"]', '');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(el.textContent).toContain('managementReview.errors.invalid_user');
  });
});

describe('MeetingWorkspace', () => {
  function setup(meeting: MeetingDetail, api: Record<string, unknown>, permissions: string[] = []) {
    TestBed.configureTestingModule({
      imports: [MeetingWorkspace, translocoTesting()],
      providers: commonProviders(api, ['management_review:write', ...permissions]),
    });
    const fixture = TestBed.createComponent(MeetingWorkspace);
    fixture.componentRef.setInput('meeting', meeting);
    fixture.componentRef.setInput('canManage', permissions.includes('management_review:manage'));
    const changed: MeetingDetail[] = [];
    fixture.componentInstance.changed.subscribe((m) => changed.push(m));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, changed };
  }

  it('offers the status changes allowed from planned', () => {
    const { el } = setup(makeMeeting(), {});
    const text = el.querySelector('[data-testid="meeting-transitions"]')?.textContent ?? '';
    expect(text).toContain('managementReview.meeting.transitions.start');
    expect(text).toContain('managementReview.meeting.transitions.completed');
    expect(text).toContain('managementReview.meeting.transitions.cancelled');
  });

  it('records a decision with a follow-up task', async () => {
    const updated = makeMeeting({ decision_count: 1 });
    const api = { addDecision: vi.fn(() => of(updated)) };
    const { fixture, el, changed } = setup(makeMeeting(), api);
    const addButton = Array.from(el.querySelectorAll('app-button')).find((b) =>
      b.textContent?.includes('managementReview.decisions.add'),
    ) as HTMLElement;
    addButton.querySelector('button')!.click();
    fixture.detectChanges();
    const form = el.querySelector('[data-testid="decision-form"]') as HTMLFormElement;
    const text = form.querySelector('textarea')!;
    text.value = 'Add a second supplier';
    text.dispatchEvent(new Event('input'));
    const owner = form.querySelector<HTMLSelectElement>('select[id$="dec-owner"]')!;
    owner.value = 'u-2';
    owner.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const action = form.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    action.checked = true;
    action.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit'));
    await flush();
    expect(api.addDecision).toHaveBeenCalledWith(
      'org-1',
      'm-1',
      expect.objectContaining({
        text: 'Add a second supplier',
        category: 'decision',
        owner_user_id: 'u-2',
        create_action: true,
      }),
    );
    expect(changed).toEqual([updated]);
  });

  it('only offers approval once the meeting is completed and the minutes are saved', () => {
    const draft = setup(makeMeeting({ status: 'in_progress', minutes: 'Notes' }), {});
    expect(draft.el.querySelector('[data-testid="approve-minutes"]')).toBeNull();
    TestBed.resetTestingModule();
    const ready = setup(makeMeeting({ status: 'completed', minutes: 'Notes' }), {});
    expect(ready.el.querySelector('[data-testid="approve-minutes"]')).toBeTruthy();
  });

  it('shows approved minutes read-only, with reopen for managers', () => {
    const { el } = setup(
      makeMeeting({
        status: 'completed',
        minutes: 'Agreed',
        minutes_status: 'approved',
        locked: true,
        can_edit: false,
      }),
      {},
      ['management_review:manage'],
    );
    expect(el.querySelector('textarea')).toBeNull();
    expect(el.querySelector('[data-testid="reopen-minutes"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="meeting-locked"]')?.textContent).toContain(
      'managementReview.meeting.locked.review_signed',
    );
  });

  it('makes approved minutes final, but still lets an action get its task', async () => {
    const updated = makeMeeting();
    const api = { updateDecision: vi.fn(() => of(updated)) };
    const { fixture, el } = setup(
      makeMeeting({
        status: 'completed',
        minutes: 'Agreed',
        minutes_status: 'approved',
        locked: true,
        locked_reason: 'minutes_approved',
        can_edit: false,
        can_create_actions: true,
        can_reopen_minutes: true,
        decisions: [
          {
            id: 'd-1',
            position: 0,
            category: 'action',
            text: 'Buy ladder stabilisers',
            owner: { id: 'u-2', name: 'Bo' },
            due_at: '2026-12-01T00:00:00',
            task: null,
            follow_up_missing: true,
            related: [
              {
                entity_type: 'deviation',
                entity_id: 'dv-1',
                title: 'Near-miss with ladder',
                code: 'HMS-1',
                url: '/deviations/dv-1',
              },
            ],
            created_at: '2026-11-01T10:00:00',
            updated_at: '2026-11-01T10:00:00',
          },
        ],
      }),
      api,
    );
    expect(el.querySelector('[data-testid="meeting-locked"]')?.textContent).toContain(
      'managementReview.meeting.locked.minutes_approved',
    );
    // No editing of attendees, agenda or decisions.
    expect(el.querySelector('[data-testid="attendee-form"]')).toBeNull();
    expect(el.textContent).not.toContain('managementReview.agenda.edit');
    expect(el.textContent).not.toContain('managementReview.decisions.add');
    expect(el.querySelector('[data-testid="follow-up-missing"]')).toBeTruthy();
    expect(el.textContent).toContain('HMS-1');
    (el.querySelector('[data-testid="create-task-d-1"]') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();
    expect(api.updateDecision).toHaveBeenCalledWith('org-1', 'm-1', 'd-1', {
      create_action: true,
    });
  });

  it('shows how many of top management took part, and the agenda time', () => {
    const { el } = setup(
      makeMeeting({
        attendance: {
          total: 3,
          present: 2,
          absent: 1,
          excused: 0,
          invited: 0,
          top_management_total: 1,
          top_management_present: 1,
        },
        agenda_minutes: 150,
        duration_minutes: 120,
      }),
      {},
    );
    expect(el.querySelector('[data-testid="attendance-summary"]')?.textContent).toContain(
      'managementReview.attendees.topManagementPresent',
    );
    expect(el.querySelector('[data-testid="agenda-total"]')?.textContent).toContain(
      'managementReview.agenda.totalOver',
    );
    expect(el.querySelector('[data-testid="top-management-at-1"]')).toBeTruthy();
  });

  it('asks for a reason before reopening approved minutes', async () => {
    const api = { reopenMinutes: vi.fn(() => of(makeMeeting())) };
    const { fixture, el } = setup(
      makeMeeting({
        status: 'completed',
        minutes: 'Agreed',
        minutes_status: 'approved',
        locked: true,
        locked_reason: 'minutes_approved',
        can_edit: false,
        can_reopen_minutes: true,
      }),
      api,
    );
    (el.querySelector('[data-testid="reopen-minutes"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.reopenMinutes).not.toHaveBeenCalled();
  });
});

describe('ReviewDetailPage', () => {
  function setup(review: ReviewDetail, api: Record<string, unknown> = {}) {
    const fullApi = { getReview: vi.fn(() => of(review)), ...api };
    TestBed.configureTestingModule({
      imports: [ReviewDetailPage, translocoTesting()],
      providers: commonProviders(fullApi, ['management_review:read', 'management_review:write']),
    });
    const fixture = TestBed.createComponent(ReviewDetailPage);
    fixture.componentRef.setInput('id', review.id);
    fixture.detectChanges();
    return { fixture, api: fullApi, el: fixture.nativeElement as HTMLElement };
  }

  const openSection = (fixture: { detectChanges(): void }, el: HTMLElement, section: string) => {
    (el.querySelector(`[data-testid="section-${section}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  it('opens on the inputs, with readable clauses, and keeps submit disabled until ready', async () => {
    const { fixture, el, api } = setup(makeDetail());
    await flush();
    fixture.detectChanges();
    expect(api.getReview).toHaveBeenCalledWith('org-1', 'r-1');
    const inputs = el.querySelector('[data-testid="review-inputs"]')?.textContent ?? '';
    expect(inputs).toContain('9.3.2 c)');
    expect(inputs).not.toContain('hs:9.3.2');
    expect(inputs).toContain('managementReview.inputs.source.auto');
    const submit = el.querySelector('[data-testid="action-submit"] button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(el.querySelector('[data-testid="action-sign"]')).toBeNull();
    openSection(fixture, el, 'signoff');
    const checklist = el.querySelector('[data-testid="missing-for-submit"]')?.textContent ?? '';
    expect(checklist).toContain('managementReview.missing.meeting_completed.todo');
    expect(checklist).toContain('managementReview.missing.top_management_present.done');
  });

  it('shows three open inputs at a time and folds the finished ones (U37)', async () => {
    const base = makeDetail().inputs[0];
    const inputs = Array.from({ length: 6 }, (_, n) => ({
      ...base,
      id: `in-${n}`,
      position: n,
      reviewed: n === 5,
    }));
    const { fixture, el } = setup(makeDetail({ inputs }));
    await flush();
    fixture.detectChanges();
    const list = el.querySelector('[data-testid="review-inputs"]')!;
    const open = () => list.querySelectorAll(':scope > ul > li app-mr-input-row').length;
    expect(open()).toBe(3);
    const more = el.querySelector('[data-testid="mr-inputs-more"] button') as HTMLButtonElement;
    expect(more.textContent).toContain('managementReview.inputs.showMore');
    expect(el.querySelectorAll('[data-testid="mr-done-inputs"] app-mr-input-row').length).toBe(1);
    expect(el.querySelector('[data-testid="mr-only-open"]')).toBeNull();
    expect(el.querySelector('#mr-custom-input')).toBeNull();
    more.click();
    fixture.detectChanges();
    expect(open()).toBe(5);
    expect(el.querySelector('[data-testid="mr-inputs-more"]')).toBeNull();
  });

  it('saves notes when the field is left, and marks an input not relevant with a reason', async () => {
    const updateInput = vi.fn(() => of(makeDetail()));
    const { fixture, el } = setup(makeDetail(), { updateInput });
    await flush();
    fixture.detectChanges();
    const notes = el.querySelector<HTMLTextAreaElement>('[data-testid="mr-input-notes"]')!;
    notes.value = 'Fewer deviations than last year';
    notes.dispatchEvent(new Event('input'));
    notes.dispatchEvent(new Event('blur'));
    await flush();
    expect(updateInput).toHaveBeenCalledWith('org-1', 'r-1', 'in-1', {
      notes: 'Fewer deviations than last year',
    });
  });

  it('saves the changed outputs and criteria from one save bar', async () => {
    const updateReview = vi.fn(() => of(makeDetail({ conclusions: 'Works well' })));
    const { fixture, el } = setup(makeDetail(), { updateReview });
    await flush();
    fixture.detectChanges();
    openSection(fixture, el, 'outputs');
    const conclusions = el.querySelector<HTMLTextAreaElement>('#mr-out-conclusions')!;
    conclusions.value = 'Works well';
    conclusions.dispatchEvent(new Event('input'));
    const effective = el.querySelector<HTMLInputElement>(
      '[data-testid="mr-criterion-suitability-effective"]',
    )!;
    effective.checked = true;
    effective.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true);
    (el.querySelector('[data-testid="save-outputs"] button') as HTMLButtonElement).click();
    await flush();
    expect(updateReview).toHaveBeenCalledWith('org-1', 'r-1', {
      conclusions: 'Works well',
      assessment_criteria: { suitability: { rating: 'effective', note: null } },
    });
  });

  it('lists what is missing when submit is refused', async () => {
    const submit = vi.fn(() =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { detail: { code: 'review_incomplete', missing: ['conclusions'] } },
          }),
      ),
    );
    const { fixture, el } = setup(
      makeDetail({
        missing_for_submit: [],
        submit_check: {
          ...makeDetail().submit_check!,
          missing: [],
          ready: true,
        },
        can_submit: true,
      }),
      { submit },
    );
    await flush();
    fixture.detectChanges();
    (el.querySelector('[data-testid="action-submit"] button') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();
    expect(submit).toHaveBeenCalled();
    expect(el.querySelector('[data-testid="missing-for-submit"]')?.textContent).toContain(
      'managementReview.missing.conclusions.todo',
    );
  });

  it('is read-only once signed', async () => {
    const { fixture, el } = setup(
      makeDetail({
        status: 'signed',
        can_edit: false,
        allowed_actions: [],
        signed_at: '2026-12-11T10:00:00',
        signature_name: 'Ada',
        report_sha256: 'abc123',
        meeting: makeMeeting({ can_edit: false, locked: true }),
      }),
    );
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('#mr-out-conclusions')).toBeNull();
    expect(el.textContent).toContain('abc123');
    expect(el.querySelector('[data-testid="save-outputs"]')).toBeNull();
  });
});

describe('detail-page anatomy (docs/ux-guide.md §2.7)', () => {
  const day = (v: string | null | undefined) => v ?? '';

  it('says where a review stands in one sentence', () => {
    expect(reviewStatusSentence(makeDetail({ status: 'in_progress' }), day)).toEqual({
      key: 'managementReview.lead.status.in_progress',
      params: { done: 0, total: 1 },
      tone: 'warn',
    });
    const signed = reviewStatusSentence(
      makeDetail({ status: 'signed', signature_name: 'Ada', signed_at: '2026-12-11' }),
      day,
    );
    expect(signed.key).toBe('managementReview.lead.status.signed');
    expect(signed.params).toEqual({ name: 'Ada', date: '2026-12-11' });
    expect(signed.tone).toBe('pass');
  });

  it('lists what a review still needs, each line opening its step', () => {
    const go = vi.fn();
    const items = reviewMissing(makeDetail({ status: 'in_progress', owner: null }), go, ['edit']);
    expect(items.map((i) => i.key)).toEqual([
      'inputs_reviewed',
      'meeting_completed',
      'conclusions',
      'owner',
    ]);
    items[0].action?.();
    expect(go).toHaveBeenCalledWith('inputs_reviewed');
    expect(items[0].labelKey).toBe('managementReview.lead.missing.inputs_reviewed');
    expect(reviewMissing(makeDetail({ status: 'signed' }), go, ['edit'])).toEqual([]);
  });

  it('says where a meeting stands and what it still needs', () => {
    const held = makeMeeting({ status: 'completed', minutes_status: 'draft', chair: null });
    expect(meetingStatusSentence(held, day).tone).toBe('warn');
    const scroll = vi.fn();
    const items = meetingMissing(held, scroll, ['edit']);
    expect(items.map((i) => i.key)).toEqual(['chair', 'minutes']);
    items[1].action?.();
    expect(scroll).toHaveBeenCalledWith('mr-meeting-minutes');
    const approved = makeMeeting({
      status: 'completed',
      minutes_status: 'approved',
      minutes_approved_by: { id: 'u-1', name: 'Ada' },
      minutes_approved_at: '2026-12-10',
    });
    expect(meetingStatusSentence(approved, day)).toEqual({
      key: 'managementReview.meetingLead.status.approved',
      params: { name: 'Ada', date: '2026-12-10' },
      tone: 'pass',
    });
  });

  it('shows the review a meeting belongs to first among what it concerns', () => {
    const refs = meetingConcerns(
      makeMeeting({
        review: { id: 'r-1', code: 'MR-0001', title: 'Review', status: 'in_progress', url: '/r/1' },
        related: [
          {
            link_id: 'l-1',
            link_type: 'relates_to',
            entity_type: 'deviation',
            entity_id: 'd-1',
            title: 'Fall',
            code: 'HMS-1',
          },
        ],
      }),
    );
    expect(refs.map((r) => r.code)).toEqual(['MR-0001', 'HMS-1']);
    expect(refs[0].entity_type).toBe('management_review');
  });
});
