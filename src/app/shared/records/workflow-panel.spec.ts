import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TransitionOption, WorkflowInstance } from '../../core/records/record.models';
import { WorkflowPanel, categoryTone, needsPrompt } from './workflow-panel';

const BASE = 'http://test/api';
const ORG = 'org-1';
const URL = `${BASE}/v1/orgs/${ORG}/workflow-instances/deviation/d1`;

function option(overrides: Partial<TransitionOption> = {}): TransitionOption {
  return {
    key: 'start',
    to: 'work',
    label: { en: 'Start work', nb: 'Start' },
    needs_approval: false,
    required_fields: [],
    require_comment: false,
    to_category: 'in_progress',
    missing_fields: [],
    blocked_by: null,
    ...overrides,
  };
}

function instance(overrides: Partial<WorkflowInstance> = {}): WorkflowInstance {
  return {
    id: 'i1',
    entity_type: 'deviation',
    entity_id: 'd1',
    state: 'open',
    state_label: { en: 'Open' },
    state_category: 'open',
    state_entered_at: '2026-01-01T00:00:00',
    sla_due_at: null,
    closed_at: null,
    transitions: [option()],
    approvals: [],
    definition_version: { workflow_id: 'w', workflow_version_id: 'wv', version: 2, name: 'Flow' },
    definition: {
      initial_state: 'open',
      states: [{ key: 'open', label: 'Open', category: 'open' }],
      transitions: [{ key: 'start', from: ['open'], to: 'work', label: 'Start work' }],
    },
    ...overrides,
  };
}

async function setup(first: WorkflowInstance | 'not-started') {
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [
      WorkflowPanel,
      TranslocoTestingModule.forRoot({ langs: { en: {}, 'records/en': {} } }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: NotificationService, useValue: toasts },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions: [] }).asReadonly(),
        },
      },
      { provide: AuthService, useValue: { user: signal({ id: 'u1' }).asReadonly() } },
    ],
  });
  const fixture = TestBed.createComponent(WorkflowPanel);
  const ref = fixture.componentRef as ComponentRef<WorkflowPanel>;
  ref.setInput('entityType', 'deviation');
  ref.setInput('entityId', 'd1');
  ref.setInput('data', { title: 'Leak' });
  ref.setInput('fields', [{ key: 'root_cause', label: 'Root cause', type: 'text' }]);
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  const get = http.expectOne(URL);
  if (first === 'not-started') {
    get.flush(
      { detail: { code: 'workflow_not_started' } },
      { status: 404, statusText: 'Not Found' },
    );
  } else {
    get.flush(first);
  }
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as
      | HTMLButtonElement
      | undefined;
  return { fixture, http, toasts, root, button };
}

describe('workflow panel helpers', () => {
  it('maps categories to badge tones', () => {
    expect(categoryTone('done')).toBe('pass');
    expect(categoryTone('in_progress')).toBe('warn');
    expect(categoryTone('cancelled')).toBe('neutral');
    expect(categoryTone('open')).toBe('info');
  });

  it('prompts only when a comment, missing fields or an approval is involved', () => {
    expect(needsPrompt(option())).toBe(false);
    expect(needsPrompt(option({ require_comment: true }))).toBe(true);
    expect(needsPrompt(option({ missing_fields: ['x'] }))).toBe(true);
    expect(needsPrompt(option({ needs_approval: true }))).toBe(true);
  });
});

describe('WorkflowPanel', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('says so when the record has no workflow', async () => {
    const { root } = await setup('not-started');
    expect(root.textContent).toContain('records.panel.notStarted');
  });

  it('runs a simple transition directly and emits the result', async () => {
    const { fixture, http, toasts, button } = await setup(instance());
    const emitted: unknown[] = [];
    fixture.componentInstance.transitioned.subscribe((e) => emitted.push(e));

    button('Start work')!.click();
    await fixture.whenStable();
    const post = http.expectOne(`${URL}/transitions/start`);
    expect(post.request.body).toEqual({ data: { title: 'Leak' }, comment: null, lang: 'en' });
    post.flush({
      state: 'work',
      pending_approval_ids: [],
      created_task_ids: [],
      instance: instance({ state: 'work', transitions: [] }),
    });
    await fixture.whenStable();

    expect(toasts.success).toHaveBeenCalledWith('records.panel.transitionedToast');
    expect(emitted).toHaveLength(1);
  });

  it('asks for the comment and missing fields before running', async () => {
    const { fixture, http, root, button } = await setup(
      instance({
        transitions: [option({ require_comment: true, missing_fields: ['root_cause'] })],
      }),
    );
    button('Start work')!.click();
    await fixture.whenStable();
    http.expectNone(`${URL}/transitions/start`);

    const confirm = button('records.panel.confirm')!;
    expect(confirm.disabled).toBe(true);
    const textarea = root.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = 'Because';
    textarea.dispatchEvent(new Event('input'));
    const field = root.querySelector<HTMLInputElement>('[data-field="root_cause"] input')!;
    field.value = 'Valve';
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(confirm.disabled).toBe(false);

    confirm.click();
    await fixture.whenStable();
    const post = http.expectOne(`${URL}/transitions/start`);
    expect(post.request.body).toEqual({
      data: { title: 'Leak', root_cause: 'Valve' },
      comment: 'Because',
      lang: 'en',
    });
    post.flush(
      { detail: { code: 'guard_failed', guard: 'no_open_tasks' } },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();
  });

  it('disables blocked transitions and explains why', async () => {
    const { root, button } = await setup(
      instance({ transitions: [option({ blocked_by: 'no_open_tasks' })] }),
    );
    expect(button('Start work')!.disabled).toBe(true);
    expect(root.textContent).toContain('records.guards.no_open_tasks');
  });

  it('lets an approver decide and the requester withdraw', async () => {
    const approval = {
      id: 'ap1',
      request_id: 'r1',
      transition_key: 'start',
      decision: 'pending' as const,
      requested_by: 'u1',
      requested_by_name: 'Ann',
      approver_user_id: null,
      approver_role_key: 'quality_manager',
      eligible_roles: ['quality_manager'],
      eligible_user_ids: [],
      decided_by: null,
      decided_by_name: null,
      decided_at: null,
      comment: null,
      created_at: '2026-01-01T00:00:00',
      can_decide: true,
    };
    const { fixture, http, toasts, button } = await setup(
      instance({ transitions: [], approvals: [approval] }),
    );
    expect(button('records.panel.withdraw')).toBeTruthy();

    button('records.panel.approve')!.click();
    await fixture.whenStable();
    const post = http.expectOne(`${BASE}/v1/orgs/${ORG}/workflow-approvals/ap1/decision`);
    expect(post.request.body).toEqual({ approve: true });
    post.flush({ state: 'work', pending_approval_ids: [], created_task_ids: [] });
    await fixture.whenStable();
    expect(toasts.success).toHaveBeenCalledWith('records.panel.approvedToast');
    http.expectOne(URL).flush(instance({ state: 'work', transitions: [] }));
    await fixture.whenStable();
  });
});
