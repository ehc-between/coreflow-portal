import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { FormControl, FormGroup } from '@angular/forms';
import {
  authErrorCode,
  isWeakPasswordError,
  passwordsMatchValidator,
  retryAfterSeconds,
  slowDownMessage,
  throttleMessage,
} from './auth-errors';

function httpError(status: number, error: unknown, headers?: HttpHeaders): HttpErrorResponse {
  return new HttpErrorResponse({ status, error, headers });
}

describe('auth-errors', () => {
  it('extracts the structured error code', () => {
    expect(authErrorCode(httpError(400, { detail: { code: 'invalid_or_expired_token' } }))).toBe(
      'invalid_or_expired_token',
    );
    expect(authErrorCode(httpError(400, { detail: 'Current password is incorrect' }))).toBeNull();
    expect(authErrorCode(httpError(500, null))).toBeNull();
    expect(authErrorCode(new Error('x'))).toBeNull();
  });

  it('recognises weak-password 422s', () => {
    expect(
      isWeakPasswordError(httpError(422, { detail: { code: 'weak_password', message: 'm' } })),
    ).toBe(true);
    // Plain request-validation 422 (no structured code) is treated as a policy failure too.
    expect(isWeakPasswordError(httpError(422, { detail: [{ loc: ['body'] }] }))).toBe(true);
    expect(isWeakPasswordError(httpError(422, { detail: { code: 'other' } }))).toBe(false);
    expect(isWeakPasswordError(httpError(400, { detail: { code: 'weak_password' } }))).toBe(false);
  });

  it('reads retry_after from the 429 body, falling back to the header', () => {
    expect(
      retryAfterSeconds(
        httpError(429, { detail: { code: 'too_many_attempts', retry_after: 42.2 } }),
      ),
    ).toBe(43);
    expect(retryAfterSeconds(httpError(429, null, new HttpHeaders({ 'Retry-After': '120' })))).toBe(
      120,
    );
    expect(retryAfterSeconds(httpError(429, null))).toBeNull();
    expect(retryAfterSeconds(httpError(401, { detail: { code: 'x', retry_after: 5 } }))).toBeNull();
  });

  it('maps a 503 rate_limiter_unavailable to "temporarily unavailable" with the wait', () => {
    const err = httpError(
      503,
      { detail: { code: 'rate_limiter_unavailable', retry_after: 30 } },
      new HttpHeaders({ 'Retry-After': '30' }),
    );
    expect(throttleMessage(err)).toEqual({
      key: 'errors.temporarilyUnavailableSeconds',
      params: { seconds: 30 },
    });
    expect(
      throttleMessage(httpError(503, { detail: { code: 'rate_limiter_unavailable' } })),
    ).toEqual({ key: 'errors.temporarilyUnavailable' });
  });

  it('maps a 429 rate_limited to the generic "slow down" message', () => {
    expect(
      throttleMessage(httpError(429, { detail: { code: 'rate_limited', retry_after: 540 } })),
    ).toEqual({ key: 'errors.rateLimitedMinutes', params: { minutes: 9 } });
    expect(
      throttleMessage(
        httpError(
          429,
          { detail: { code: 'rate_limited' } },
          new HttpHeaders({ 'Retry-After': '5' }),
        ),
      ),
    ).toEqual({ key: 'errors.rateLimitedSeconds', params: { seconds: 5 } });
  });

  it('leaves lockouts and other errors to the caller', () => {
    expect(throttleMessage(httpError(429, { detail: { code: 'too_many_attempts' } }))).toBeNull();
    expect(throttleMessage(httpError(503, { detail: 'AI is not configured' }))).toBeNull();
    expect(throttleMessage(httpError(503, null))).toBeNull();
    expect(throttleMessage(httpError(401, { detail: { code: 'rate_limited' } }))).toBeNull();
    expect(throttleMessage(null)).toBeNull();
  });

  it('builds the slow-down message from a raw wait', () => {
    expect(slowDownMessage(null)).toEqual({ key: 'errors.rateLimited' });
    expect(slowDownMessage(Number.NaN)).toEqual({ key: 'errors.rateLimited' });
    expect(slowDownMessage(0.2)).toEqual({
      key: 'errors.rateLimitedSeconds',
      params: { seconds: 1 },
    });
    expect(slowDownMessage(600)).toEqual({
      key: 'errors.rateLimitedMinutes',
      params: { minutes: 10 },
    });
  });

  it('flags mismatched new/confirm passwords', () => {
    const group = new FormGroup(
      { newPassword: new FormControl('a'), confirmPassword: new FormControl('') },
      { validators: passwordsMatchValidator },
    );
    expect(group.errors).toBeNull();
    group.controls.confirmPassword.setValue('b');
    expect(group.errors).toEqual({ passwordMismatch: true });
    group.controls.confirmPassword.setValue('a');
    expect(group.errors).toBeNull();
  });
});
