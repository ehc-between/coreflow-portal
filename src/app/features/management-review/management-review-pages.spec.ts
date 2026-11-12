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
import { AskPanelService } from '../ask/ask-panel.service';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { MeetingWorkspace } from './components/meeting-workspace';
import { ManagementReviewApi } from './data/management-review-api';
import {
  MeetingDetail,
  MeetingSummary,
  ReviewDetail,
  ReviewSummary,
} from './data/management-review.models';
import { MeetingsList } from './meetings-list';
import { ReviewDetailPage } from './review-detail';
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
    missing_for_submit: ['conclusions', 'system_assessment', 'meeting_completed'],
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

describe('ReviewsList', () => {
  function setup(
    items: ReviewSummary[],
    permissions = ['management_review:read', 'management_review:write'],
  ) {
    const api = { listReviews: vi.fn(() => of({ items, total: items.length })) };
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
  it('creates a review with the standard agenda and the meeting details', async () => {
    const api = { createReview: vi.fn(() => of({ id: 'r-9' })) };
    TestBed.configureTestingModule({
      imports: [ReviewEditor, translocoTesting()],
      providers: commonProviders(api, ['management_review:write']),
    });
    const fixture = TestBed.createComponent(ReviewEditor);
    fixture.detectChanges();
    await flush();
    const el = fixture.nativeElement as HTMLElement;
    const title = el.querySelector<HTMLInputElement>('input[id$="-title"]')!;
    title.value = 'Annual review';
    title.dispatchEvent(new Event('input'));
    const boxes = el.querySelectorAll<HTMLInputElement>('fieldset input[type="checkbox"]');
    boxes[1].checked = true;
    boxes[1].dispatchEvent(new Event('change'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.createReview).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        title: 'Annual review',
        frameworks: ['iso27001'],
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
    };
    TestBed.configureTestingModule({
      imports: [ReviewEditor, translocoTesting()],
      providers: commonProviders(api, ['management_review:write']),
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
    expect(el.textContent).toContain('managementReview.meeting.lockedNotice');
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

  it('shows the inputs, the submit checklist and the allowed actions', async () => {
    const { fixture, el, api } = setup(makeDetail());
    await flush();
    fixture.detectChanges();
    expect(api.getReview).toHaveBeenCalledWith('org-1', 'r-1');
    expect(el.querySelector('[data-testid="review-inputs"]')?.textContent).toContain('hs:9.3.2 c');
    expect(el.querySelector('[data-testid="missing-for-submit"]')?.textContent).toContain(
      'managementReview.missing.meeting_completed',
    );
    expect(el.querySelector('[data-testid="action-submit"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="action-sign"]')).toBeNull();
  });

  it('saves only the changed outputs', async () => {
    const updateReview = vi.fn(() => of(makeDetail({ conclusions: 'Works well' })));
    const { fixture, el } = setup(makeDetail(), { updateReview });
    await flush();
    fixture.detectChanges();
    const conclusions = el.querySelector<HTMLTextAreaElement>('#mr-out-conclusions')!;
    conclusions.value = 'Works well';
    conclusions.dispatchEvent(new Event('input'));
    const effective = el.querySelector<HTMLInputElement>(
      'input[name="mr-assessment"][value="effective"]',
    )!;
    effective.checked = true;
    effective.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (el.querySelector('[data-testid="save-outputs"] button') as HTMLButtonElement).click();
    await flush();
    expect(updateReview).toHaveBeenCalledWith('org-1', 'r-1', {
      conclusions: 'Works well',
      system_assessment: 'effective',
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
    const { fixture, el } = setup(makeDetail({ missing_for_submit: [] }), { submit });
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="missing-for-submit"]')).toBeNull();
    (el.querySelector('[data-testid="action-submit"] button') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();
    expect(submit).toHaveBeenCalled();
    expect(el.querySelector('[data-testid="missing-for-submit"]')?.textContent).toContain(
      'managementReview.missing.conclusions',
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
