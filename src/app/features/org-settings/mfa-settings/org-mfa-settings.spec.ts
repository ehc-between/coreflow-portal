import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgSettingsDto } from '../../../core/org/org.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { OrgMfaSettings, mfaPolicyErrorKey } from './org-mfa-settings';

const BASE = 'http://test/api';
const ORG = 'org-1';
const SETTINGS = `${BASE}/v1/orgs/${ORG}/settings`;
const ROLES = `${BASE}/v1/orgs/${ORG}/roles`;

const OFF: OrgSettingsDto = {
  require_document_segregation: false,
  mfa_policy: 'off',
  mfa_required_roles: [],
};

async function setup(initial: OrgSettingsDto = OFF) {
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [OrgMfaSettings, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: NotificationService, useValue: toasts },
      { provide: SelectedOrgService, useValue: { currentOrgId: signal(ORG).asReadonly() } },
    ],
  });
  const fixture = TestBed.createComponent(OrgMfaSettings);
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(SETTINGS).flush(initial);
  http.expectOne(ROLES).flush([
    { key: 'admin', name: 'Admin', permissions: [], grantable: true },
    { key: 'member', name: 'Member', permissions: [], grantable: true },
  ]);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`)!;
  const choose = async (id: string) => {
    el<HTMLInputElement>(id).click();
    await fixture.whenStable();
  };
  const save = async () => {
    el('mfa-policy-save').querySelector('button')!.click();
    await fixture.whenStable();
  };
  return { fixture, root, http, toasts, el, choose, save };
}

describe('OrgMfaSettings', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows the saved policy and nothing to save yet', async () => {
    const { el } = await setup({ ...OFF, mfa_policy: 'roles', mfa_required_roles: ['admin'] });
    expect(el<HTMLInputElement>('mfa-policy-roles').checked).toBe(true);
    expect(el<HTMLInputElement>('mfa-role-admin').checked).toBe(true);
    expect(el<HTMLInputElement>('mfa-role-member').checked).toBe(false);
    expect(el('mfa-policy-save').querySelector('button')!.disabled).toBe(true);
  });

  it('requires MFA of chosen roles', async () => {
    const { http, toasts, choose, save } = await setup();
    await choose('mfa-policy-roles');
    await choose('mfa-role-admin');
    await save();
    const put = http.expectOne(SETTINGS);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ mfa_policy: 'roles', mfa_required_roles: ['admin'] });
    put.flush({ ...OFF, mfa_policy: 'roles', mfa_required_roles: ['admin'] });
    await Promise.resolve();
    expect(toasts.success).toHaveBeenCalledWith('settings.mfa.saved');
  });

  it('will not send "roles" without a role', async () => {
    const { root, http, choose, save } = await setup();
    await choose('mfa-policy-roles');
    await save();
    http.expectNone(SETTINGS);
    expect(root.textContent).toContain('settings.mfa.error.rolesRequired');
  });

  it('explains when the admin would lock themselves out', async () => {
    const { fixture, root, http, choose, save } = await setup();
    await choose('mfa-policy-all');
    await save();
    const put = http.expectOne(SETTINGS);
    expect(put.request.body).toEqual({ mfa_policy: 'all', mfa_required_roles: [] });
    put.flush({ detail: { code: 'mfa_verification_required' } }, { status: 409, statusText: 'x' });
    await fixture.whenStable();
    expect(root.textContent).toContain('settings.mfa.error.verifySelf');
    expect(root.querySelector('a[href="/account/security"]')).not.toBeNull();
  });
});

describe('mfaPolicyErrorKey', () => {
  it('maps server codes', () => {
    const err = (code: string) =>
      new HttpErrorResponse({ status: 422, error: { detail: { code } } });
    expect(mfaPolicyErrorKey(err('mfa_roles_required'))).toBe('settings.mfa.error.rolesRequired');
    expect(mfaPolicyErrorKey(err('unknown_roles'))).toBe('settings.mfa.error.unknownRoles');
    expect(mfaPolicyErrorKey(new HttpErrorResponse({ status: 500 }))).toBe(
      'settings.mfa.error.saveFailed',
    );
  });
});
