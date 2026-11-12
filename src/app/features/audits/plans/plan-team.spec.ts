import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { PlanDetail } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { PlanTeam } from './plan-team';

function plan(overrides: Partial<PlanDetail> = {}): PlanDetail {
  return {
    id: 'p-1',
    org_id: 'org-1',
    code: 'AUD-2026-001',
    title: 'Purchasing',
    kind: 'internal',
    external_party_type: null,
    external_party_name: null,
    programme: null,
    certification_id: null,
    scope: null,
    criteria: null,
    objectives: null,
    frameworks: ['iso9001'],
    clause_refs: [],
    auditee_department_ids: [],
    risk_level: 'medium',
    status: 'planned',
    status_reason: null,
    planned_start: null,
    planned_end: null,
    actual_start: null,
    actual_end: null,
    owner: null,
    lead_auditor: null,
    report_summary: null,
    report_conclusion: null,
    report_submitted_at: null,
    report_submitted_by: null,
    report_approved_at: null,
    report_approved_by: null,
    created_by: null,
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    url: '/audits/plans/p-1',
    findings_total: 0,
    findings_open: 0,
    checklist_total: 0,
    checklist_answered: 0,
    auditors: [],
    findings_by_type: {},
    available_actions: [],
    ...overrides,
  };
}

function setup(api: Partial<Record<keyof AuditsApi, unknown>>) {
  const notifications = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [PlanTeam, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      ...provideFakeGuidance().providers,
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({
            id: 'org-1',
            name: 'Acme',
            roles: [],
            permissions: ['audits:write'],
          }),
        },
      },
      { provide: AuthService, useValue: { user: () => ({ id: 'u-1' }) } },
      {
        provide: AssigneeOptionsService,
        useValue: {
          options: signal({
            users: [
              { value: 'user:u-1', label: 'Ada', labelIsKey: false },
              { value: 'user:u-2', label: 'Ola', labelIsKey: false },
            ],
            roles: [],
            departments: [],
          }),
          ensureLoaded: () => undefined,
        },
      },
      { provide: AuditsApi, useValue: api },
      { provide: NotificationService, useValue: notifications },
    ],
  });
  const fixture = TestBed.createComponent(PlanTeam);
  fixture.componentRef.setInput('plan', plan());
  fixture.componentRef.setInput('editable', true);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const choose = async (userId: string, role = 'auditor') => {
    const role$ = el.querySelector<HTMLSelectElement>('#team-role')!;
    role$.value = role;
    role$.dispatchEvent(new Event('change'));
    const user = el.querySelector<HTMLSelectElement>('#team-user')!;
    user.value = userId;
    user.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };
  const addButton = () =>
    Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('audits.team.addButton'),
    )!;
  return { fixture, el, notifications, choose, addButton };
}

describe('PlanTeam', () => {
  it('previews a failed check and requires an override reason before assigning', async () => {
    const api = {
      checkAuditor: vi.fn(() =>
        of({
          user_id: 'u-2',
          competence_ok: false,
          independence_ok: true,
          issues: ['competence_no_profile'],
        }),
      ),
      assignAuditor: vi.fn(() => of({})),
    };
    const { el, fixture, choose, addButton } = setup(api);
    await choose('u-2', 'lead');
    expect(api.checkAuditor).toHaveBeenCalledWith('org-1', 'p-1', 'u-2', 'lead');
    expect(el.textContent).toContain('audits.auditorIssue.competence_no_profile');
    expect(addButton().disabled).toBe(true);

    const reason = el.querySelector<HTMLInputElement>('#team-override')!;
    reason.value = 'Only certified auditor available';
    reason.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(addButton().disabled).toBe(false);
    addButton().click();
    expect(api.assignAuditor).toHaveBeenCalledWith('org-1', 'p-1', {
      user_id: 'u-2',
      role: 'lead',
      override_reason: 'Only certified auditor available',
    });
  });

  it('shows the issues returned by a 409 together with the coded message', async () => {
    const api = {
      checkAuditor: vi.fn(() =>
        of({ user_id: 'u-2', competence_ok: true, independence_ok: true, issues: [] }),
      ),
      assignAuditor: vi.fn(() =>
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: {
                detail: { code: 'auditor_check_failed', issues: ['independence_own_department'] },
              },
            }),
        ),
      ),
    };
    const { el, fixture, choose, addButton, notifications } = setup(api);
    await choose('u-2');
    expect(el.textContent).toContain('audits.team.checkPassed');
    addButton().click();
    await fixture.whenStable();
    expect(el.textContent).toContain('audits.auditorIssue.independence_own_department');
    expect(notifications.error).toHaveBeenCalledWith('audits.errors.auditor_check_failed');
  });
});
