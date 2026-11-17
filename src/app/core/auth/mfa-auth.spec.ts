import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector, provideZonelessChangeDetection, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { SelectedOrgService } from '../org/selected-org.service';
import { authInterceptor } from './auth.interceptor';
import { AuthSession, LoginResult, MfaChallenge } from './auth.models';
import { AuthService } from './auth.service';
import { mfaErrorMessage } from './mfa-errors';
import { mfaEnrolmentGuard } from './mfa.guard';

const BASE = 'http://test/api';
const AUTH = `${BASE}/v1/auth`;

const SESSION: AuthSession = {
  access_token: 'tok',
  token_type: 'bearer',
  expires_in: 900,
  mfa_required: false,
  user: {
    id: 'u-1',
    email: 'ada@example.com',
    full_name: 'Ada',
    is_superuser: false,
    orgs: {},
    mfa_enrolled: true,
    mfa_verified: true,
  },
};

const CHALLENGE: MfaChallenge = {
  mfa_required: true,
  mfa_token: 'mfa-tok',
  methods: ['totp', 'recovery_code'],
  expires_in: 300,
};

describe('AuthService second factor', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
        { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('a password alone never signs in an enrolled user: the challenge sets no token', () => {
    let result: LoginResult | undefined;
    auth.login('ada@example.com', 'pw').subscribe((r) => (result = r));
    http.expectOne(`${AUTH}/login`).flush(CHALLENGE);

    expect(result).toEqual({ kind: 'mfa', challenge: CHALLENGE });
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.accessToken()).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('a user without a factor still signs in with the password', () => {
    let result: LoginResult | undefined;
    auth.login('ada@example.com', 'pw').subscribe((r) => (result = r));
    http.expectOne(`${AUTH}/login`).flush(SESSION);

    expect(result?.kind).toBe('session');
    expect(auth.accessToken()).toBe('tok');
  });

  it('verifyMfa posts the code with the cookie and establishes the session', () => {
    auth.verifyMfa({ mfa_token: 'mfa-tok', method: 'totp', code: '123456' }).subscribe();
    const req = http.expectOne(`${AUTH}/mfa/verify`);
    expect(req.request.body).toEqual({ mfa_token: 'mfa-tok', method: 'totp', code: '123456' });
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush(SESSION);

    expect(auth.accessToken()).toBe('tok');
    expect(auth.user()?.mfa_verified).toBe(true);
  });

  it('a rejected code leaves the user signed out', () => {
    let failed = false;
    auth
      .verifyMfa({ mfa_token: 'mfa-tok', method: 'totp', code: '000000' })
      .subscribe({ error: () => (failed = true) });
    http
      .expectOne(`${AUTH}/mfa/verify`)
      .flush(
        { detail: { code: 'invalid_mfa_code', attempts_remaining: 4 } },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(failed).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('passkeySignInOptions sends the mfa token', () => {
    auth.passkeySignInOptions('mfa-tok').subscribe();
    const req = http.expectOne(`${AUTH}/mfa/webauthn/options`);
    expect(req.request.body).toEqual({ mfa_token: 'mfa-tok' });
    req.flush({ public_key: { challenge: 'AA' } });
  });
});

describe('authInterceptor on sign-in step two', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
        { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } },
      ],
    });
    auth = TestBed.inject(AuthService);
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('a 401 for an expired challenge is passed through, never refreshed and retried', () => {
    const refresh = vi.spyOn(auth, 'refresh');
    let status = 0;
    client
      .post(`${AUTH}/mfa/verify`, {})
      .subscribe({ error: (e: HttpErrorResponse) => (status = e.status) });
    const req = http.expectOne(`${AUTH}/mfa/verify`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ detail: { code: 'invalid_mfa_token' } }, { status: 401, statusText: 'x' });

    expect(status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
    http.expectNone(`${AUTH}/refresh`);
  });

  it('leaves the passkey sign-in options untouched but still guards enrolment endpoints', () => {
    auth.adoptSession(SESSION);
    client.post(`${AUTH}/mfa/webauthn/options`, {}).subscribe();
    expect(
      http.expectOne(`${AUTH}/mfa/webauthn/options`).request.headers.has('Authorization'),
    ).toBe(false);
    client.post(`${AUTH}/mfa/webauthn/register/options`, null).subscribe();
    expect(
      http.expectOne(`${AUTH}/mfa/webauthn/register/options`).request.headers.get('Authorization'),
    ).toBe('Bearer tok');
  });
});

describe('mfaEnrolmentGuard', () => {
  function run(url: string, mfaRequired: boolean, superuser = false): boolean | UrlTree {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    TestBed.inject(AuthService).adoptSession({
      ...SESSION,
      user: {
        ...SESSION.user,
        is_superuser: superuser,
        mfa_enrolled: false,
        mfa_verified: false,
        orgs: {
          'org-1': {
            name: 'Acme',
            roles: ['admin'],
            permissions: mfaRequired ? [] : ['dashboard:view'],
            mfa_required: mfaRequired,
          },
        },
      },
    });
    expect(TestBed.inject(SelectedOrgService).currentOrgId()).toBe('org-1');
    return runInInjectionContext(TestBed.inject(Injector), () =>
      mfaEnrolmentGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as boolean | UrlTree;
  }

  it('keeps a member blocked by the org policy on the setup page', () => {
    const result = run('/dashboard', true);
    expect(result instanceof UrlTree).toBe(true);
    expect(String(result)).toBe('/account/security');
  });

  it('lets the blocked member reach their own account pages', () => {
    expect(run('/account/security', true)).toBe(true);
    TestBed.resetTestingModule();
    expect(run('/account/sessions?x=1', true)).toBe(true);
  });

  it('does not let a look-alike path through', () => {
    expect(run('/accounts-export', true) instanceof UrlTree).toBe(true);
  });

  it('lets platform administration through for a super-admin only', () => {
    expect(run('/admin/organizations', true, true)).toBe(true);
    TestBed.resetTestingModule();
    expect(run('/admin/organizations', true, false) instanceof UrlTree).toBe(true);
  });

  it('allows everything when the org does not require MFA of the session', () => {
    expect(run('/dashboard', false)).toBe(true);
  });
});

describe('mfaErrorMessage', () => {
  const error = (status: number, detail: unknown) =>
    new HttpErrorResponse({ status, error: { detail } });

  it('shows attempts left on a wrong code (singular and plural)', () => {
    expect(
      mfaErrorMessage(error(400, { code: 'invalid_mfa_code', attempts_remaining: 3 })),
    ).toEqual({ key: 'auth.mfa.error.invalidCodeRemaining', params: { count: 3 } });
    expect(
      mfaErrorMessage(error(400, { code: 'invalid_mfa_code', attempts_remaining: 1 })),
    ).toEqual({ key: 'auth.mfa.error.invalidCodeRemainingOne', params: { count: 1 } });
  });

  it('maps rate limits, known codes and unknown failures', () => {
    expect(mfaErrorMessage(error(429, { code: 'too_many_attempts', retry_after: 20 }))).toEqual({
      key: 'auth.mfa.error.tooManyAttemptsSeconds',
      params: { seconds: 20 },
    });
    expect(mfaErrorMessage(error(409, { code: 'mfa_required_by_org', org_ids: ['o'] }))).toEqual({
      key: 'auth.mfa.error.requiredByOrg',
    });
    expect(mfaErrorMessage(error(500, null))).toEqual({ key: 'errors.generic' });
  });
});
