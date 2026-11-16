import { HttpErrorResponse } from '@angular/common/http';
import { loginErrorMessage } from './login';

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
