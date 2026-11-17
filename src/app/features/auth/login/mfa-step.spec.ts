import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MfaChallenge } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import { MfaStep } from './mfa-step';

const BASE = 'http://test/api';
const VERIFY = `${BASE}/v1/auth/mfa/verify`;

const CHALLENGE: MfaChallenge = {
  mfa_required: true,
  mfa_token: 'mfa-tok',
  methods: ['totp', 'recovery_code'],
  expires_in: 300,
};

const SESSION = {
  access_token: 'tok',
  token_type: 'bearer',
  expires_in: 900,
  mfa_required: false,
  user: { id: 'u', email: 'a@x.no', full_name: 'A', is_superuser: false, orgs: {} },
};

async function setup(challenge: MfaChallenge = CHALLENGE) {
  TestBed.configureTestingModule({
    imports: [MfaStep, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } },
    ],
  });
  const fixture: ComponentFixture<MfaStep> = TestBed.createComponent(MfaStep);
  fixture.componentRef.setInput('challenge', challenge);
  const verified = vi.fn();
  const expired = vi.fn();
  fixture.componentInstance.verified.subscribe(verified);
  fixture.componentInstance.expired.subscribe(expired);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);
  const enter = async (code: string) => {
    const input = root.querySelector<HTMLInputElement>('[data-testid="mfa-code"]')!;
    input.value = code;
    input.dispatchEvent(new Event('input'));
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { fixture, root, http, verified, expired, enter };
}

describe('MfaStep', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('submits the authenticator code (spaces removed) and reports success', async () => {
    const { http, verified, enter } = await setup();
    await enter('123 456');
    const req = http.expectOne(VERIFY);
    expect(req.request.body).toEqual({ mfa_token: 'mfa-tok', method: 'totp', code: '123456' });
    req.flush(SESSION);
    expect(verified).toHaveBeenCalled();
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
  });

  it('shows the attempts left after a wrong code and stays signed out', async () => {
    const { fixture, root, http, verified, enter } = await setup();
    await enter('000000');
    http
      .expectOne(VERIFY)
      .flush(
        { detail: { code: 'invalid_mfa_code', attempts_remaining: 2 } },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    expect(root.textContent).toContain('auth.mfa.error.invalidCodeRemaining');
    expect(verified).not.toHaveBeenCalled();
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
  });

  it('sends the user back to the password step when the challenge is burned', async () => {
    const { http, expired, enter } = await setup();
    await enter('000000');
    http
      .expectOne(VERIFY)
      .flush({ detail: { code: 'invalid_mfa_token' } }, { status: 401, statusText: 'x' });
    expect(expired).toHaveBeenCalledWith({ key: 'auth.mfa.error.invalidToken' });
  });

  it('switches to a recovery code', async () => {
    const { fixture, root, http, enter } = await setup();
    root.querySelector<HTMLButtonElement>('[data-testid="mfa-switch-recovery_code"]')!.click();
    await fixture.whenStable();
    expect(root.querySelector('#mfa-recovery')).not.toBeNull();
    await enter('ABCD-EFGH-JKLM-NPQR');
    const req = http.expectOne(VERIFY);
    expect(req.request.body).toEqual({
      mfa_token: 'mfa-tok',
      method: 'recovery_code',
      code: 'ABCD-EFGH-JKLM-NPQR',
    });
    req.flush(SESSION);
  });

  it('does not offer passkeys where the browser cannot use them', async () => {
    const { root } = await setup({ ...CHALLENGE, methods: ['webauthn', 'recovery_code'] });
    // jsdom has no PublicKeyCredential, so the recovery code is the only method.
    expect(root.querySelector('[data-testid="mfa-passkey"]')).toBeNull();
    expect(root.querySelector('#mfa-recovery')).not.toBeNull();
  });
});
