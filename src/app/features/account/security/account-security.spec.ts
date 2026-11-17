import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { MfaStatus } from '../../../core/auth/mfa.models';
import { APP_CONFIG } from '../../../core/config/app-config';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AccountSecurity } from './account-security';
import { groupSecret } from './totp-setup';

const BASE = 'http://test/api';
const MFA = `${BASE}/v1/auth/mfa`;

const NONE: MfaStatus = {
  enrolled: false,
  session_verified: false,
  factors: [],
  recovery_codes_remaining: 0,
  required_by_orgs: ['org-1'],
};

const FACTOR = {
  id: 'f-1',
  kind: 'totp' as const,
  label: '',
  created_at: '2026-11-01T10:00:00Z',
  last_used_at: null,
};

const ENROLLED: MfaStatus = {
  enrolled: true,
  session_verified: true,
  factors: [FACTOR],
  recovery_codes_remaining: 10,
  required_by_orgs: [],
};

async function setup(status: MfaStatus) {
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [AccountSecurity, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: NotificationService, useValue: toasts },
    ],
  });
  const auth = TestBed.inject(AuthService);
  const refresh = vi.spyOn(auth, 'refresh').mockReturnValue(of(true));
  const fixture = TestBed.createComponent(AccountSecurity);
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  const get = http.expectOne(MFA);
  expect(get.request.withCredentials).toBe(true);
  get.flush(status);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(id: string) =>
    root.querySelector<T>(`[data-testid="${id}"]`);
  const type = async (selector: string, value: string) => {
    const input = root.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  return { fixture, root, http, toasts, refresh, q, type };
}

describe('AccountSecurity', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('explains the org requirement and offers setup when nothing is enrolled', async () => {
    const { q } = await setup(NONE);
    expect(q('mfa-required-banner')?.textContent).toContain('auth.mfa.required.enrol');
    expect(q('mfa-none')).not.toBeNull();
    expect(q('mfa-recovery')).toBeNull();
  });

  it('enrols an authenticator app: refreshes the session and shows the recovery codes once', async () => {
    const { fixture, http, refresh, q, type } = await setup(NONE);
    q<HTMLButtonElement>('mfa-add-totp')!.querySelector('button')!.click();
    await fixture.whenStable();

    q('totp-setup')!.querySelector('form')!.dispatchEvent(new Event('submit'));
    const start = http.expectOne(`${MFA}/totp/setup`);
    expect(start.request.body).toEqual({ label: null });
    start.flush({
      factor_id: 'f-1',
      secret: 'JBSWY3DPEHPK3PXP',
      otpauth_uri: 'otpauth://totp/CoreFlow:ada?secret=JBSWY3DPEHPK3PXP&issuer=CoreFlow',
    });
    await fixture.whenStable();
    expect(q('totp-secret')?.textContent).toContain('JBSW Y3DP EHPK 3PXP');
    expect(q('totp-setup')!.querySelector('app-qr-code svg path')).not.toBeNull();

    await type('#totp-code', '123456');
    q('totp-setup')!.querySelector('form')!.dispatchEvent(new Event('submit'));
    const confirm = http.expectOne(`${MFA}/totp/confirm`);
    expect(confirm.request.body).toEqual({ factor_id: 'f-1', code: '123456' });
    confirm.flush({
      factor: FACTOR,
      recovery_codes: ['AAAA-BBBB', 'CCCC-DDDD'],
      reauthenticate: true,
    });
    await fixture.whenStable();

    expect(refresh).toHaveBeenCalledTimes(1);
    http.expectOne(MFA).flush(ENROLLED);
    await fixture.whenStable();
    expect(q('recovery-codes')?.textContent).toContain('AAAA-BBBB');

    q('recovery-codes-done')!.querySelector('button')!.click();
    await fixture.whenStable();
    expect(q('recovery-codes')).toBeNull();
  });

  it('keeps the setup open with an error when the code is wrong', async () => {
    const { fixture, root, http, refresh, q, type } = await setup(NONE);
    q('mfa-add-totp')!.querySelector('button')!.click();
    await fixture.whenStable();
    q('totp-setup')!.querySelector('form')!.dispatchEvent(new Event('submit'));
    http
      .expectOne(`${MFA}/totp/setup`)
      .flush({ factor_id: 'f-1', secret: 'JBSWY3DPEHPK3PXP', otpauth_uri: 'otpauth://totp/x' });
    await fixture.whenStable();
    await type('#totp-code', '000000');
    q('totp-setup')!.querySelector('form')!.dispatchEvent(new Event('submit'));
    http
      .expectOne(`${MFA}/totp/confirm`)
      .flush({ detail: { code: 'invalid_mfa_code' } }, { status: 400, statusText: 'x' });
    await fixture.whenStable();
    expect(root.textContent).toContain('auth.mfa.error.invalidCode');
    expect(q('totp-secret')).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('removes a factor only with the password', async () => {
    const { fixture, root, http, toasts, type } = await setup(ENROLLED);
    const remove = [
      ...root.querySelectorAll<HTMLButtonElement>('[data-testid="mfa-factor"] button'),
    ].find((b) => b.textContent?.includes('auth.mfa.action.remove'))!;
    remove.click();
    await fixture.whenStable();

    await type('#mfa-confirm-password', 'wrong');
    root
      .querySelector<HTMLInputElement>('#mfa-confirm-password')!
      .form!.dispatchEvent(new Event('submit'));
    const bad = http.expectOne(`${MFA}/factors/f-1/remove`);
    expect(bad.request.body).toEqual({ password: 'wrong' });
    bad.flush({ detail: { code: 'invalid_password' } }, { status: 400, statusText: 'x' });
    await fixture.whenStable();
    expect(root.textContent).toContain('auth.mfa.error.invalidPassword');

    await type('#mfa-confirm-password', 'right');
    root
      .querySelector<HTMLInputElement>('#mfa-confirm-password')!
      .form!.dispatchEvent(new Event('submit'));
    http
      .expectOne(`${MFA}/factors/f-1/remove`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(toasts.success).toHaveBeenCalledWith('auth.mfa.removedToast');
    http.expectOne(MFA).flush({ ...NONE, required_by_orgs: [] });
  });

  it('reports when the org blocks removing the last factor', async () => {
    const { fixture, root, http, toasts, type } = await setup(ENROLLED);
    [...root.querySelectorAll<HTMLButtonElement>('[data-testid="mfa-factor"] button')]
      .find((b) => b.textContent?.includes('auth.mfa.action.remove'))!
      .click();
    await fixture.whenStable();
    await type('#mfa-confirm-password', 'right');
    root
      .querySelector<HTMLInputElement>('#mfa-confirm-password')!
      .form!.dispatchEvent(new Event('submit'));
    http
      .expectOne(`${MFA}/factors/f-1/remove`)
      .flush(
        { detail: { code: 'mfa_required_by_org', org_ids: ['org-1'] } },
        { status: 409, statusText: 'x' },
      );
    await fixture.whenStable();
    expect(toasts.error).toHaveBeenCalledWith('auth.mfa.error.requiredByOrg', undefined);
  });

  it('regenerates recovery codes after the password and shows the new set', async () => {
    const { fixture, root, http, q, type } = await setup(ENROLLED);
    q('recovery-regenerate')!.querySelector('button')!.click();
    await fixture.whenStable();
    await type('#mfa-confirm-password', 'right');
    root
      .querySelector<HTMLInputElement>('#mfa-confirm-password')!
      .form!.dispatchEvent(new Event('submit'));
    const req = http.expectOne(`${MFA}/recovery-codes`);
    expect(req.request.body).toEqual({ password: 'right' });
    req.flush({ recovery_codes: ['NEW1-CODE'] });
    await fixture.whenStable();
    http.expectOne(MFA).flush(ENROLLED);
    await fixture.whenStable();
    expect(q('recovery-codes')?.textContent).toContain('NEW1-CODE');
  });

  it('asks an enrolled but unverified session to sign in again and disables changes', async () => {
    const { q } = await setup({
      ...ENROLLED,
      session_verified: false,
      required_by_orgs: ['org-1'],
    });
    expect(q('mfa-required-banner')?.textContent).toContain('auth.mfa.required.signInAgain');
    expect(q('mfa-add-totp')!.querySelector('button')!.disabled).toBe(true);
    expect(q('recovery-regenerate')!.querySelector('button')!.disabled).toBe(true);
  });
});

describe('groupSecret', () => {
  it('groups the key in fours for manual entry', () => {
    expect(groupSecret('JBSWY3DPEHPK3PXPAB')).toBe('JBSW Y3DP EHPK 3PXP AB');
  });
});
