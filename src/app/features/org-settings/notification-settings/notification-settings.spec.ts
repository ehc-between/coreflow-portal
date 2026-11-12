import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import {
  DepartmentLead,
  NotificationRule,
  NotificationSettings,
} from '../../../core/notifications/activity.models';
import { NotificationRulesApi } from '../../../core/notifications/notification-rules-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgMembersApi } from '../../../core/org/org-members-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { NotificationSettingsPage } from './notification-settings';

function makeRule(event_kind: string, extra: Partial<NotificationRule> = {}): NotificationRule {
  return {
    event_kind,
    module: 'events',
    category: 'reminders',
    title_key: 'notifications.x',
    notify: true,
    recipients: [{ type: 'owner' }, { type: 'assignee' }],
    channels: ['in_app', 'digest'],
    enabled: true,
    is_default: true,
    ...extra,
  };
}

const RULES: NotificationRule[] = [
  makeRule('reminder.due_soon'),
  makeRule('reminder.overdue', {
    is_default: false,
    recipients: [{ type: 'role', value: 'auditor' }],
  }),
  makeRule('module.enabled', { notify: false, category: 'system', recipients: [], channels: [] }),
];
const SETTINGS: NotificationSettings = {
  reminder_days: 3,
  escalation_days: 3,
  escalation_role_key: null,
  escalate_to_department_lead: true,
};
const LEADS: DepartmentLead[] = [
  { department_id: 'dep-1', name: 'Quality', lead_user_id: null, lead_name: null },
];

function setup(listRules: () => ReturnType<NotificationRulesApi['listRules']> = () => of(RULES)) {
  const setRule$ = new Subject<NotificationRule>();
  const api = {
    listRules: vi.fn(listRules),
    getSettings: vi.fn(() => of(SETTINGS)),
    listDepartmentLeads: vi.fn(() => of(LEADS)),
    setRule: vi.fn(() => setRule$),
    resetRule: vi.fn(() => of(undefined)),
    updateSettings: vi.fn((_org: string, body: NotificationSettings) => of(body)),
    setDepartmentLead: vi.fn((_org: string, id: string, user: string | null) =>
      of({ department_id: id, name: 'Quality', lead_user_id: user, lead_name: 'Ada' }),
    ),
  };
  const members = {
    listRoles: vi.fn(() =>
      of([{ key: 'auditor', name: 'Auditor', permissions: [], grantable: true }]),
    ),
    listMembers: vi.fn(() =>
      of([{ user_id: 'u-1', email: 'ada@x.test', full_name: 'Ada', is_active: true, roles: [] }]),
    ),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  const ask = { showWith: vi.fn() };
  TestBed.configureTestingModule({
    imports: [NotificationSettingsPage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: NotificationRulesApi, useValue: api },
      { provide: OrgMembersApi, useValue: members },
      { provide: NotificationService, useValue: toasts },
      { provide: AskPanelService, useValue: ask },
      { provide: SelectedOrgService, useValue: { currentOrgId: signal('org-1') } },
    ],
  });
  const fixture = TestBed.createComponent(NotificationSettingsPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(sel: string) => el.querySelector<T>(sel);
  const qa = (sel: string) => Array.from(el.querySelectorAll<HTMLElement>(sel));
  return { fixture, el, api, ask, toasts, setRule$, q, qa, render: () => fixture.detectChanges() };
}

describe('NotificationSettingsPage', () => {
  it('loads the rules matrix, settings and leads for the org', () => {
    const { api, qa, el } = setup();
    expect(api.listRules).toHaveBeenCalledWith('org-1');
    expect(qa('[data-testid="rule-row"]')).toHaveLength(3);
    // Timeline-only kinds cannot be edited.
    expect(qa('[data-testid="rule-edit"]')).toHaveLength(2);
    expect(el.textContent).toContain('activity.rules.status.custom');
    expect(el.querySelector('[data-testid="reminder-settings"]')).not.toBeNull();
    expect(qa('[data-testid="lead-select"]')).toHaveLength(1);
    expect(el.querySelector('[data-testid="activity-guide"]')).not.toBeNull();
  });

  it('filters the rules and offers to clear the filters', () => {
    const { q, qa, render } = setup();
    const search = q<HTMLInputElement>('[data-testid="rules-search"]')!;
    search.value = 'module.enabled';
    search.dispatchEvent(new Event('input'));
    render();
    expect(qa('[data-testid="rule-row"]')).toHaveLength(1);
    search.value = 'nothing-matches';
    search.dispatchEvent(new Event('input'));
    render();
    expect(q('[data-testid="rules-no-match"]')).not.toBeNull();
  });

  it('teaches with an empty state when no kinds are registered', () => {
    const { q } = setup(() => of([]));
    expect(q('[data-testid="rules-empty"]')).not.toBeNull();
  });

  it('shows a retry on load failure', () => {
    const { el } = setup(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(el.textContent).toContain('activity.page.loadError');
  });

  it('edits a rule and saves the PUT body', () => {
    const { q, qa, render, api, setRule$, toasts } = setup();
    qa('[data-testid="rule-edit"]')[0].querySelector('button')!.click();
    render();
    expect(q('[data-testid="rule-editor"]')).not.toBeNull();

    q<HTMLInputElement>('[data-testid="recipient-watchers"]')!.click();
    q<HTMLInputElement>('[data-testid="channel-email"]')!.click();
    render();
    q('[data-testid="rule-save"]')!.querySelector('button')!.click();
    render();
    expect(api.setRule).toHaveBeenCalledWith('org-1', 'reminder.due_soon', {
      recipients: [{ type: 'owner' }, { type: 'assignee' }, { type: 'watchers' }],
      channels: ['in_app', 'email', 'digest'],
      enabled: true,
    });
    setRule$.next(
      makeRule('reminder.due_soon', {
        is_default: false,
        recipients: [{ type: 'owner' }, { type: 'assignee' }, { type: 'watchers' }],
      }),
    );
    render();
    expect(toasts.success).toHaveBeenCalledWith('activity.rules.saved');
    expect(q('[data-testid="rule-editor"]')).toBeNull();
  });

  it('shows the backend error in the editor', () => {
    const { q, qa, render, setRule$ } = setup();
    qa('[data-testid="rule-edit"]')[0].querySelector('button')!.click();
    render();
    q('[data-testid="rule-save"]')!.querySelector('button')!.click();
    render();
    setRule$.error(
      new HttpErrorResponse({ status: 422, error: { detail: { code: 'invalid_recipient' } } }),
    );
    render();
    expect(q('[data-testid="rule-error"]')?.textContent).toContain(
      'activity.errors.invalid_recipient',
    );
  });

  it('saves reminder and escalation settings', () => {
    const { q, render, api } = setup();
    const days = q<HTMLInputElement>('#escalation-days')!;
    days.value = '5';
    days.dispatchEvent(new Event('input'));
    render();
    q('[data-testid="settings-save"]')!.querySelector('button')!.click();
    render();
    expect(api.updateSettings).toHaveBeenCalledWith('org-1', { ...SETTINGS, escalation_days: 5 });
  });

  it('rejects out-of-range settings without calling the API', () => {
    const { q, render, api, el } = setup();
    const days = q<HTMLInputElement>('#reminder-days')!;
    days.value = '400';
    days.dispatchEvent(new Event('input'));
    render();
    q('[data-testid="settings-save"]')!.querySelector('button')!.click();
    render();
    expect(api.updateSettings).not.toHaveBeenCalled();
    expect(el.textContent).toContain('activity.reminders.invalid');
  });

  it('sets a department lead', () => {
    const { q, render, api } = setup();
    const select = q<HTMLSelectElement>('[data-testid="lead-select"]')!;
    select.value = 'u-1';
    select.dispatchEvent(new Event('change'));
    render();
    expect(api.setDepartmentLead).toHaveBeenCalledWith('org-1', 'dep-1', 'u-1');
  });

  it('opens the assistant from the AI buttons', () => {
    const { q, ask } = setup();
    q('[data-testid="ai-suggest"]')!.querySelector('button')!.click();
    expect(ask.showWith).toHaveBeenCalledWith(expect.stringContaining('activity.ai.suggestPrompt'));
    q('[data-testid="ai-explain"]')!.querySelector('button')!.click();
    expect(ask.showWith).toHaveBeenLastCalledWith(
      expect.stringContaining('activity.ai.explainPagePrompt'),
    );
  });
});
