import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { LoginResult } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { Login, loginErrorMessage } from './login';

function httpError(status: number, error: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({ status, error });
}

describe('loginErrorMessage', () => {
  it('maps bad credentials', () => {
    expect(loginErrorMessage(httpError(401))).toEqual({ key: 'auth.error.invalidCredentials' });
  });

  it('shows the wait time in seconds for short rate limits', () => {
    const err = httpError(429, { detail: { code: 'too_many_attempts', retry_after: 30 } });
    expect(loginErrorMessage(err)).toEqual({
      key: 'auth.error.tooManyAttemptsSeconds',
      params: { seconds: 30 },
    });
  });

  it('shows the wait time in minutes (rounded up) for longer rate limits', () => {
    const err = httpError(429, { detail: { code: 'too_many_attempts', retry_after: 61 } });
    expect(loginErrorMessage(err)).toEqual({
      key: 'auth.error.tooManyAttemptsMinutes',
      params: { minutes: 2 },
    });
  });

  it('falls back to a generic rate-limit message without retry_after', () => {
    expect(loginErrorMessage(httpError(429))).toEqual({ key: 'auth.error.tooManyAttempts' });
  });

  it('shows "temporarily unavailable" when the limiter backend is down (503)', () => {
    const err = httpError(503, { detail: { code: 'rate_limiter_unavailable', retry_after: 30 } });
    expect(loginErrorMessage(err)).toEqual({
      key: 'errors.temporarilyUnavailableSeconds',
      params: { seconds: 30 },
    });
  });

  it('keeps the generic API throttle separate from the sign-in lockout', () => {
    const err = httpError(429, { detail: { code: 'rate_limited', retry_after: 20 } });
    expect(loginErrorMessage(err)).toEqual({
      key: 'errors.rateLimitedSeconds',
      params: { seconds: 20 },
    });
  });

  it('uses the generic error for server failures', () => {
    expect(loginErrorMessage(httpError(500))).toEqual({ key: 'errors.generic' });
  });
});

describe('Login with a second factor', () => {
  function setup() {
    const login$ = new Subject<LoginResult>();
    const auth = { login: vi.fn(() => login$) };
    TestBed.configureTestingModule({
      imports: [Login, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: ThemeService, useValue: { theme: () => 'light', toggle: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const fill = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    fill('#login-email', 'ada@example.com');
    fill('#login-password', 'correct horse battery');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    return { fixture, el, auth, login$, navigate };
  }

  it('asks for the second step instead of entering the app, and forgets the password', () => {
    const { fixture, el, auth, login$, navigate } = setup();
    expect(auth.login).toHaveBeenCalledWith('ada@example.com', 'correct horse battery');
    login$.next({
      kind: 'mfa',
      challenge: { mfa_required: true, mfa_token: 't', methods: ['totp'], expires_in: 300 },
    });
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('app-mfa-step')).not.toBeNull();
    expect(el.querySelector('#login-password')).toBeNull();
    expect(el.textContent).toContain('auth.mfa.signIn.title');
  });

  it('enters the app straight away when no second factor is needed', () => {
    const { login$, navigate } = setup();
    login$.next({
      kind: 'session',
      user: { id: 'u', email: 'a@x.no', full_name: 'A', is_superuser: false, orgs: {} },
    });
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });
});
