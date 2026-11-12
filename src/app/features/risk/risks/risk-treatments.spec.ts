import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { AiAssistApi } from '../../../core/ai/ai-assist-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { RiskApi } from '../data/risk-api';
import { Risk, Treatment } from '../data/risk.models';
import { RiskTreatments } from './risk-treatments';

const RISK = {
  id: 'r-1',
  code: 'RSK-0001',
  title: 'Stolen laptop',
  owner: { id: 'u-1', name: 'Ada' },
} as unknown as Risk;

function treatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    id: 't-1',
    org_id: 'org-1',
    risk_id: 'r-1',
    title: 'Encrypt disks',
    description: null,
    control_refs: ['iso27001-2022:A.8.24'],
    owner: { id: 'u-1', name: 'Ada' },
    due_at: '2026-12-01T00:00:00',
    status: 'planned',
    overdue: false,
    task_id: 'task-1',
    task_status: 'open',
    completed_at: null,
    url: '/risk/risks/r-1?treatment=t-1',
    created_by: 'u-1',
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    ...overrides,
  };
}

function setup(items: Treatment[] = [treatment()], focusId: string | null = null) {
  const api = {
    listTreatments: vi.fn(() => of({ items, total: items.length })),
    createTreatment: vi.fn(() => of(treatment({ id: 't-2', title: 'Backups' }))),
    updateTreatment: vi.fn(() => of(treatment({ status: 'done' }))),
    deleteTreatment: vi.fn(() => of(undefined)),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [RiskTreatments, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: RiskApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
      { provide: AiAssistApi, useValue: { run: vi.fn() } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions: ['risk:write'] }),
        },
      },
      {
        provide: AssigneeOptionsService,
        useValue: {
          options: signal({
            users: [{ value: 'user:u-1', label: 'Ada', labelIsKey: false }],
            roles: [],
            departments: [],
          }),
          ensureLoaded: () => undefined,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(RiskTreatments);
  fixture.componentRef.setInput('risk', RISK);
  fixture.componentRef.setInput('canEdit', true);
  fixture.componentRef.setInput('focusId', focusId);
  const changed = vi.fn();
  fixture.componentInstance.changed.subscribe(changed);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, api, toasts, changed };
}

describe('RiskTreatments', () => {
  it('lists the treatments of the risk with their task', () => {
    const { el, api } = setup();
    expect(api.listTreatments).toHaveBeenCalledWith('org-1', 'r-1');
    expect(el.textContent).toContain('Encrypt disks');
    expect(el.querySelector('a[href="/tasks/task-1"]')).toBeTruthy();
  });

  it('changes a treatment status and tells the risk', () => {
    const { el, fixture, api, changed } = setup();
    const select = el.querySelector<HTMLSelectElement>('#treatment-status-t-1')!;
    select.value = 'done';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.updateTreatment).toHaveBeenCalledWith('org-1', 't-1', { status: 'done' });
    expect(changed).toHaveBeenCalled();
  });

  it('adds a treatment owned by the risk owner by default', () => {
    const { el, fixture, api } = setup([]);
    const add = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('risk.treatments.add'),
    )!;
    add.click();
    fixture.detectChanges();
    const title = document.querySelector<HTMLInputElement>('#treatment-title')!;
    title.value = 'Backups';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const form = title.closest('form')!;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.createTreatment).toHaveBeenCalledWith('org-1', 'r-1', {
      title: 'Backups',
      description: null,
      control_refs: [],
      owner_user_id: 'u-1',
      due_at: null,
    });
  });

  it('opens the treatment named in the URL', () => {
    setup([treatment()], 't-1');
    const title = document.querySelector<HTMLInputElement>('#treatment-title');
    expect(title?.value).toBe('Encrypt disks');
  });
});
