import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { FormControl, FormGroup } from '@angular/forms';
import {
  authErrorCode,
  isWeakPasswordError,
  passwordsMatchValidator,
  retryAfterSeconds,
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
