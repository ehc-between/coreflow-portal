import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { HomeApi } from '../data/home-api';
import { WorkspaceSettings } from '../data/home.models';
import { HomeWorkspaceSettings } from './home-workspace-settings';

const SETTINGS: WorkspaceSettings = {
  workspaces: ['employee', 'owner', 'quality_lead', 'management', 'auditor'],
  roles: [
    {
      role: 'member',
      name: 'Member',
      workspace: 'employee',
      default_workspace: 'employee',
      overridden: false,
    },
    {
      role: 'dpo',
      name: 'DPO',
      workspace: 'owner',
      default_workspace: 'owner',
      overridden: false,
    },
  ],
};

function setup(permissions: string[], save: 'ok' | 'error' = 'ok') {
  const api = {
    workspaces: vi.fn(() => of(SETTINGS)),
    setWorkspaces: vi.fn(() =>
      save === 'ok'
        ? of({
            ...SETTINGS,
            roles: [{ ...SETTINGS.roles[0], workspace: 'owner', overridden: true }],
          })
        : throwError(() => new Error('no')),
    ),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [HomeWorkspaceSettings, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      { provide: HomeApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(HomeWorkspaceSettings);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, api, toasts };
}

describe('HomeWorkspaceSettings', () => {
  it('renders nothing and loads nothing without org:manage', () => {
    const { el, api } = setup(['dashboard:view']);
    expect(el.querySelector('[data-testid="settings-home-workspaces"]')).toBeNull();
    expect(api.workspaces).not.toHaveBeenCalled();
  });

  it('lists a template per role and saves an override (default resets)', () => {
    const { el, fixture, api, toasts } = setup(['org:manage']);
    expect(api.workspaces).toHaveBeenCalledWith('org-1');
    const select = el.querySelector<HTMLSelectElement>('[data-testid="home-ws-select-member"]')!;
    expect(select.value).toBe('employee');
    select.value = 'owner';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.setWorkspaces).toHaveBeenCalledWith('org-1', { member: 'owner' });
    expect(toasts.success).toHaveBeenCalled();

    const dpo = el.querySelector<HTMLSelectElement>('[data-testid="home-ws-select-member"]')!;
    dpo.value = 'employee';
    dpo.dispatchEvent(new Event('change'));
    expect(api.setWorkspaces).toHaveBeenLastCalledWith('org-1', { member: null });
  });

  it('reverts and says so when saving fails', () => {
    const { el, fixture, toasts } = setup(['org:manage'], 'error');
    const select = el.querySelector<HTMLSelectElement>('[data-testid="home-ws-select-dpo"]')!;
    select.value = 'auditor';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(toasts.error).toHaveBeenCalledWith('home.workspace.settings.saveFailed');
    expect(el.querySelector<HTMLSelectElement>('[data-testid="home-ws-select-dpo"]')!.value).toBe(
      'owner',
    );
  });
});
