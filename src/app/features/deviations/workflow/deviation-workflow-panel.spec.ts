import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NEVER, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DeviationDetail, DeviationWorkflow } from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RecordsApi } from '../../../core/records/records-api';
import { DeviationWorkflowPanel } from './deviation-workflow-panel';

function workflow(overrides: Partial<DeviationWorkflow> = {}): DeviationWorkflow {
  return {
    state: 'received',
    state_label: { en: 'Received', nb: 'Mottatt' },
    state_category: 'open',
    state_entered_at: '2026-11-01T10:00:00',
    sla_due_at: null,
    closed_at: null,
    transitions: [
      {
        key: 'investigate',
        to: 'investigating',
        label: { en: 'Start investigation' },
        needs_approval: false,
        required_fields: [],
        require_comment: false,
        to_category: 'in_progress',
        missing_fields: [],
        blocked_by: null,
      },
      {
        key: 'close',
        to: 'closed',
        label: { en: 'Close' },
        needs_approval: false,
        required_fields: ['root_cause'],
        require_comment: false,
        to_category: 'done',
        missing_fields: ['root_cause'],
        blocked_by: null,
      },
      {
        key: 'verify',
        to: 'verified',
        label: { en: 'Verify' },
        needs_approval: false,
        required_fields: [],
        require_comment: false,
        to_category: 'done',
        missing_fields: [],
        blocked_by: 'deviation_closure',
      },
    ],
    approvals: [],
    definition_version: { workflow_id: 'w1', workflow_version_id: 'wv1', version: 2, name: 'NC' },
    definition: { initial_state: 'received', states: [], transitions: [] },
    ...overrides,
  };
}

function deviation(wf = workflow()): DeviationDetail {
  return {
    id: 'd1',
    code: 'NC-1',
    title: 'Wrong label',
    type_id: 't1',
    standards: [],
    clauses: [],
    tags: [],
    severity: 'medium',
    status: wf.state,
    status_category: 'open',
    source: 'internal',
    raised_at: '2026-11-01T10:00:00',
    created_at: '2026-11-01T10:00:00',
    visibility: 'organization',
    data: { lot: 'A' },
    actions: [],
    events: [],
    record_type_id: 'rt1',
    record_type_version_id: 'v1',
    record_type_version: 1,
    workflow: wf,
  };
}

async function setup(dev = deviation()) {
  const api = {
    transition: vi.fn(() => of(deviation(workflow({ state: 'investigating' })))),
    updateDeviation: vi.fn(() => of(dev)),
    getDeviation: vi.fn(() => of(dev)),
  };
  const records = { decide: vi.fn(() => of({})), withdraw: vi.fn(() => of(undefined)) };
  const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.configureTestingModule({
    imports: [DeviationWorkflowPanel, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      { provide: DeviationsApi, useValue: api },
      { provide: RecordsApi, useValue: records },
      { provide: NotificationService, useValue: notify },
      { provide: AuthService, useValue: { user: signal({ id: 'u1' }) } },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal('org1'), currentOrg: signal({ permissions: [] }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeviationWorkflowPanel);
  fixture.componentRef.setInput('deviation', dev);
  fixture.componentRef.setInput('canWrite', true);
  fixture.componentRef.setInput('fields', [{ key: 'lot', label: 'Lot', type: 'text' }]);
  const changed = vi.fn();
  fixture.componentInstance.changed.subscribe(changed);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement, api, notify, changed };
}

const button = (root: HTMLElement, key: string) =>
  root.querySelector<HTMLElement>(`[data-transition="${key}"] button`) ??
  root.querySelector<HTMLElement>(`[data-transition="${key}"]`)!;

describe('DeviationWorkflowPanel', () => {
  it('shows the state, version and the transitions, blocked ones explained', async () => {
    const { root } = await setup();
    expect(root.querySelector('[data-testid="workflow-state"]')?.textContent).toContain('Received');
    expect(root.textContent).toContain('Start investigation');
    expect(root.textContent).toContain('records.guards.deviation_closure');
  });

  it('runs a plain transition through the deviation endpoint and emits the result', async () => {
    const { fixture, root, api, changed } = await setup();
    button(root, 'investigate').click();
    await fixture.whenStable();
    expect(api.transition).toHaveBeenCalledWith('org1', 'd1', 'investigate', {
      comment: null,
      lang: 'en',
    });
    expect(api.updateDeviation).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalled();
  });

  it('asks for missing core fields, saves them, then transitions', async () => {
    const { fixture, root, api } = await setup();
    button(root, 'close').click();
    await fixture.whenStable();
    const step = root.querySelector<HTMLElement>('[data-testid="transition-step"]')!;
    const textarea = step.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = 'Old label template';
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    root.querySelector<HTMLElement>('[data-testid="transition-confirm"] button')!.click();
    await fixture.whenStable();
    expect(api.updateDeviation).toHaveBeenCalledWith('org1', 'd1', {
      root_cause: 'Old label template',
    });
    expect(api.transition).toHaveBeenCalledWith('org1', 'd1', 'close', {
      comment: null,
      lang: 'en',
    });
  });

  it('keeps the step open with the server-reported missing fields', async () => {
    const { fixture, root, api } = await setup();
    api.transition.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { detail: { code: 'required_fields', fields: ['lot'] } },
          }),
      ),
    );
    button(root, 'investigate').click();
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="transition-step"]')).toBeTruthy();
  });

  it('hides the steps from users without write access', async () => {
    const { fixture, root } = await setup();
    fixture.componentRef.setInput('canWrite', false);
    await fixture.whenStable();
    expect(root.querySelector('[data-transition]')).toBeNull();
  });

  it('renders nothing for a legacy deviation', async () => {
    const legacy = { ...deviation(), workflow: null };
    const { root, api } = await setup(legacy);
    api.getDeviation.mockReturnValue(NEVER);
    expect(root.querySelector('[data-testid="deviation-workflow-panel"]')).toBeNull();
  });
});
