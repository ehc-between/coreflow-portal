import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AttachmentsApi } from '../../core/attachments/attachments-api';
import { AuthService } from '../../core/auth/auth.service';
import { DeviationDetail as DeviationDetailModel } from '../../core/deviations/deviation.models';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { DeviationDetail } from './deviation-detail';

function deviation(overrides: Partial<DeviationDetailModel> = {}): DeviationDetailModel {
  return {
    id: 'd1',
    code: 'DEV-1',
    title: 'Leak',
    type_id: 't1',
    standards: ['iso9001'],
    clauses: [],
    tags: [],
    severity: 'medium',
    status: 'verification',
    source: 'internal',
    raised_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    visibility: 'organization',
    data: {},
    actions: [
      {
        id: 'a1',
        deviation_id: 'd1',
        kind: 'corrective',
        description: 'Replace valve',
        status: 'open',
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    events: [],
    allowed_transitions: [
      { to: 'closed', requires_reason: false, blocked_by: 'open_actions' },
      { to: 'action', requires_reason: false },
      { to: 'cancelled', requires_reason: true },
    ],
    ...overrides,
  };
}

interface ApiMock {
  getDeviation: ReturnType<typeof vi.fn>;
  getType: ReturnType<typeof vi.fn>;
  getAccess: ReturnType<typeof vi.fn>;
  listAccessSubjects: ReturnType<typeof vi.fn>;
  changeStatus: ReturnType<typeof vi.fn>;
  updateDeviation: ReturnType<typeof vi.fn>;
  deleteDeviation: ReturnType<typeof vi.fn>;
}

async function setup(
  dev = deviation(),
  permissions: readonly string[] = ['deviations:write', 'deviations:manage'],
): Promise<{
  fixture: ComponentFixture<DeviationDetail>;
  root: HTMLElement;
  api: ApiMock;
  notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
}> {
  const api: ApiMock = {
    getDeviation: vi.fn(() => of(dev)),
    getType: vi.fn(() => NEVER),
    getAccess: vi.fn(() => NEVER),
    listAccessSubjects: vi.fn(() =>
      of({ users: [], departments: [{ id: 'dep1', name: 'Plant' }] }),
    ),
    changeStatus: vi.fn((): Observable<DeviationDetailModel> => NEVER),
    updateDeviation: vi.fn((): Observable<DeviationDetailModel> => NEVER),
    deleteDeviation: vi.fn((): Observable<void> => NEVER),
  };
  const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
  const org = {
    id: 'org1',
    name: 'Org',
    roles: [],
    permissions,
  };
  TestBed.configureTestingModule({
    imports: [DeviationDetail, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: 'deviations', children: [] }]),
      { provide: DeviationsApi, useValue: api },
      { provide: AttachmentsApi, useValue: { list: () => NEVER } },
      { provide: NotificationService, useValue: notify },
      { provide: AuthService, useValue: { orgs: signal({}) } },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal('org1'), currentOrg: signal(org) },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeviationDetail);
  fixture.componentRef.setInput('id', 'd1');
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement, api, notify };
}

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    b.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`no button "${text}"`);
  }
  return button;
}

async function openStatusMenu(fixture: ComponentFixture<DeviationDetail>, root: HTMLElement) {
  buttonByText(root, 'deviations.detail.changeStatus').click();
  await fixture.whenStable();
  return root.querySelector<HTMLElement>('[data-testid="status-menu"]')!;
}

describe('DeviationDetail status workflow', () => {
  afterEach(() => document.body.replaceChildren());

  it('offers only allowed transitions; blocked ones are disabled and explained', async () => {
    const { fixture, root } = await setup();
    const menu = await openStatusMenu(fixture, root);

    const options = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[data-status]'));
    expect(options.map((b) => b.dataset['status'])).toEqual(['closed', 'action', 'cancelled']);

    const closed = options[0];
    expect(closed.disabled).toBe(true);
    expect(closed.textContent).toContain('deviations.workflow.reasons.open_actions');
    expect(options[1].disabled).toBe(false);
    expect(options[2].textContent).toContain('deviations.workflow.reasonHint');
  });

  it('changes status directly when no reason is required', async () => {
    const { fixture, root, api } = await setup();
    const menu = await openStatusMenu(fixture, root);
    menu.querySelector<HTMLButtonElement>('button[data-status="action"]')!.click();
    await fixture.whenStable();
    expect(api.changeStatus).toHaveBeenCalledWith('org1', 'd1', 'action', undefined);
  });

  it('asks for a reason and sends it as status_reason', async () => {
    const { fixture, root, api } = await setup();
    const menu = await openStatusMenu(fixture, root);
    menu.querySelector<HTMLButtonElement>('button[data-status="cancelled"]')!.click();
    await fixture.whenStable();

    const dialog = root.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(dialog).toBeTruthy();
    const confirm = buttonByText(dialog, 'deviations.workflow.reasonConfirm');
    expect(confirm.disabled).toBe(true);
    expect(api.changeStatus).not.toHaveBeenCalled();

    const textarea = dialog.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = 'Duplicate of DEV-0';
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await fixture.whenStable();

    expect(api.changeStatus).toHaveBeenCalledWith('org1', 'd1', 'cancelled', 'Duplicate of DEV-0');
  });

  it('explains a 409 and highlights the blocking actions', async () => {
    const { fixture, root, api, notify } = await setup(
      deviation({
        allowed_transitions: [{ to: 'closed', requires_reason: false }],
      }),
    );
    api.changeStatus.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              detail: {
                code: 'open_actions',
                message: 'Close all actions first',
                blocking: [{ action_id: 'a1', description: 'Replace valve' }],
              },
            },
          }),
      ),
    );
    const menu = await openStatusMenu(fixture, root);
    menu.querySelector<HTMLButtonElement>('button[data-status="closed"]')!.click();
    await fixture.whenStable();

    const alert = root.querySelector<HTMLElement>('[data-testid="workflow-error"]')!;
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('deviations.workflow.rejected');
    expect(alert.textContent).toContain('Replace valve');
    expect(root.querySelector('li[data-blocking="true"]')).toBeTruthy();
    // Explained inline only: no toast on top of the alert.
    expect(notify.error).not.toHaveBeenCalled();
    // Re-fetches so the menu reflects the current workflow state.
    expect(api.getDeviation).toHaveBeenCalledTimes(2);
  });

  it('opens the reason dialog when the server says a reason is required', async () => {
    const { fixture, root, api } = await setup(
      deviation({ allowed_transitions: [{ to: 'cancelled', requires_reason: false }] }),
    );
    api.changeStatus.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { detail: { code: 'reason_required', message: 'Reason needed' } },
          }),
      ),
    );
    const menu = await openStatusMenu(fixture, root);
    menu.querySelector<HTMLButtonElement>('button[data-status="cancelled"]')!.click();
    await fixture.whenStable();

    expect(root.querySelector('[role="alertdialog"] textarea')).toBeTruthy();
    expect(root.querySelector('[data-testid="workflow-error"]')).toBeNull();
  });
});

describe('DeviationDetail delete', () => {
  afterEach(() => document.body.replaceChildren());

  it('confirms through the in-app dialog, not window.confirm', async () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm');
    const { fixture, root, api } = await setup();
    api.deleteDeviation.mockReturnValue(of(undefined));

    buttonByText(root, 'deviations.detail.delete').click();
    await fixture.whenStable();
    const dialog = root.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('deviations.detail.deleteTitle');
    expect(api.deleteDeviation).not.toHaveBeenCalled();

    const buttons = dialog.querySelectorAll<HTMLButtonElement>('button');
    buttons[buttons.length - 1].click();
    await fixture.whenStable();

    expect(api.deleteDeviation).toHaveBeenCalledWith('org1', 'd1');
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe('DeviationDetail edit classification', () => {
  afterEach(() => document.body.replaceChildren());

  it('sends changed standards, tags and department', async () => {
    const { fixture, root, api } = await setup(deviation({ department_id: undefined }));
    buttonByText(root, 'deviations.detail.edit').click();
    await fixture.whenStable();

    const iso14001 = Array.from(
      root.querySelectorAll<HTMLInputElement>(
        'app-deviation-classification-fields input[type=checkbox]',
      ),
    )[1];
    iso14001.click();
    const tag = root.querySelector<HTMLInputElement>('#edit-tag')!;
    tag.value = 'leak';
    tag.dispatchEvent(new Event('input'));
    tag.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const dept = root.querySelector<HTMLSelectElement>('#edit-dept')!;
    dept.value = 'dep1';
    dept.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    buttonByText(root, 'deviations.detail.save').click();
    await fixture.whenStable();

    expect(api.updateDeviation).toHaveBeenCalledWith('org1', 'd1', {
      standards: ['iso9001', 'iso14001'],
      tags: ['leak'],
      department_id: 'dep1',
    });
  });
});

describe('DeviationDetail QA follow-ups', () => {
  afterEach(() => document.body.replaceChildren());

  function reject(code: string, blocking: unknown[] = []) {
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 409,
          error: { detail: { code, message: 'server text', blocking } },
        }),
    );
  }

  async function openReasonDialog(fixture: ComponentFixture<DeviationDetail>, root: HTMLElement) {
    const menu = await openStatusMenu(fixture, root);
    menu.querySelector<HTMLButtonElement>('button[data-status="cancelled"]')!.click();
    await fixture.whenStable();
  }

  it('caps the reason at 2000 chars with a live counter', async () => {
    const { fixture, root } = await setup();
    await openReasonDialog(fixture, root);

    const textarea = root.querySelector<HTMLTextAreaElement>('#status-reason')!;
    expect(textarea.maxLength).toBe(2000);
    expect(textarea.getAttribute('aria-describedby')).toBe('status-reason-count');
    textarea.value = 'abc';
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const counter = root.querySelector<HTMLElement>('#status-reason-count')!;
    expect(counter.textContent).toContain('deviations.workflow.reasonCount');
  });

  it('focuses the reason textarea on open and returns focus to Change status on close', async () => {
    const { fixture, root } = await setup();
    await openReasonDialog(fixture, root);
    expect(document.activeElement?.id).toBe('status-reason');

    buttonByText(root.querySelector('[role="alertdialog"]')!, 'deviations.detail.cancel').click();
    await fixture.whenStable();
    expect(root.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(buttonByText(root, 'deviations.detail.changeStatus'));
  });

  it('disables Change status with an explanation when no transitions are offered', async () => {
    const { fixture, root } = await setup(
      deviation({ status: 'closed', allowed_transitions: [] }),
      ['deviations:write'],
    );
    const trigger = root.querySelector<HTMLElement>('[data-testid="status-trigger"]')!;
    expect(trigger.getAttribute('title')).toContain('deviations.workflow.noTransitions');
    const button = buttonByText(root, 'deviations.detail.changeStatus');
    expect(button.disabled).toBe(true);
    button.click();
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="status-menu"]')).toBeNull();
  });

  it('reloads into the locked state when a save hits deviation_closed', async () => {
    const { fixture, root, api, notify } = await setup();
    buttonByText(root, 'deviations.detail.edit').click();
    await fixture.whenStable();
    const title = root.querySelector<HTMLInputElement>('#edit-title')!;
    title.value = 'Leak (updated)';
    title.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    // Someone else closed it meanwhile.
    api.updateDeviation.mockReturnValueOnce(reject('deviation_closed'));
    api.getDeviation.mockReturnValue(
      of(
        deviation({
          status: 'closed',
          allowed_transitions: [{ to: 'investigating', requires_reason: true }],
        }),
      ),
    );
    buttonByText(root, 'deviations.detail.save').click();
    await fixture.whenStable();

    expect(notify.error).toHaveBeenCalledWith(
      'deviations.workflow.reasons.deviation_closed',
      undefined,
    );
    expect(root.querySelector('[data-testid="edit-lock-note"]')?.textContent).toContain(
      'deviations.workflow.closedNote',
    );
    expect(() => buttonByText(root, 'deviations.detail.save')).toThrow();
  });

  it('hides edit controls on a closed deviation and says why', async () => {
    const { root } = await setup(
      deviation({
        status: 'closed',
        allowed_transitions: [{ to: 'investigating', requires_reason: true }],
      }),
    );
    expect(root.querySelector('[data-testid="edit-lock-note"]')?.textContent).toContain(
      'deviations.workflow.closedNote',
    );
    expect(() => buttonByText(root, 'deviations.detail.edit')).toThrow();
    expect(() => buttonByText(root, 'deviations.actions.add')).toThrow();
    // Reopening stays possible.
    expect(buttonByText(root, 'deviations.detail.changeStatus').disabled).toBe(false);
  });

  it('hides edit controls without edit reach (empty transitions on an open deviation)', async () => {
    const { root } = await setup(deviation({ status: 'open', allowed_transitions: [] }), [
      'deviations:write',
    ]);
    expect(root.querySelector('[data-testid="edit-lock-note"]')?.textContent).toContain(
      'deviations.workflow.noEditAccess',
    );
    expect(() => buttonByText(root, 'deviations.detail.edit')).toThrow();
    expect(() => buttonByText(root, 'deviations.actions.add')).toThrow();
    const trigger = root.querySelector<HTMLElement>('[data-testid="status-trigger"]')!;
    expect(trigger.getAttribute('title')).toContain('deviations.workflow.noEditAccess');
  });

  it('keeps edit controls on an open deviation with transitions', async () => {
    const { root } = await setup();
    expect(root.querySelector('[data-testid="edit-lock-note"]')).toBeNull();
    expect(buttonByText(root, 'deviations.detail.edit')).toBeTruthy();
    expect(buttonByText(root, 'deviations.actions.add')).toBeTruthy();
  });

  it('phrases a non-manager reopen rejection as a permission message', async () => {
    const { fixture, root, api } = await setup(
      deviation({
        status: 'closed',
        allowed_transitions: [{ to: 'investigating', requires_reason: false }],
      }),
      ['deviations:write'],
    );
    api.changeStatus.mockReturnValue(reject('invalid_transition'));
    const menu = await openStatusMenu(fixture, root);
    menu.querySelector<HTMLButtonElement>('button[data-status="investigating"]')!.click();
    await fixture.whenStable();
    const alert = root.querySelector<HTMLElement>('[data-testid="workflow-error"]')!;
    expect(alert.textContent).toContain('deviations.workflow.rejected');
    const component = fixture.componentInstance as unknown as {
      workflowError: () => { reasonKey: string } | null;
    };
    expect(component.workflowError()?.reasonKey).toBe(
      'deviations.workflow.reasons.reopen_requires_manage',
    );
  });

  it('clears the 409 explanation once reloaded transitions unblock the target', async () => {
    const { fixture, root, api } = await setup(
      deviation({ allowed_transitions: [{ to: 'closed', requires_reason: false }] }),
    );
    api.changeStatus.mockReturnValue(
      reject('open_actions', [{ action_id: 'a1', description: 'Replace valve' }]),
    );
    api.getDeviation.mockReturnValue(
      of(
        deviation({
          allowed_transitions: [
            { to: 'closed', requires_reason: false, blocked_by: 'open_actions' },
          ],
        }),
      ),
    );
    const menu = await openStatusMenu(fixture, root);
    menu.querySelector<HTMLButtonElement>('button[data-status="closed"]')!.click();
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="workflow-error"]')).toBeTruthy();
    expect(root.querySelector('li[data-blocking="true"]')).toBeTruthy();

    // An action change reloads transitions; closing is no longer blocked.
    api.getDeviation.mockReturnValue(
      of(deviation({ allowed_transitions: [{ to: 'closed', requires_reason: false }] })),
    );
    (fixture.componentInstance as unknown as { reloadEvents: () => void }).reloadEvents();
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="workflow-error"]')).toBeNull();
    expect(root.querySelector('li[data-blocking="true"]')).toBeNull();
  });

  it('toasts non-workflow failures with the shared error mapping', async () => {
    const { fixture, root, api, notify } = await setup();
    api.changeStatus.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    const menu = await openStatusMenu(fixture, root);
    menu.querySelector<HTMLButtonElement>('button[data-status="action"]')!.click();
    await fixture.whenStable();
    expect(notify.error).toHaveBeenCalledWith('errors.server');
  });
});
