import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { AuthErrorDetail } from './auth.models';

/** Minimum password length enforced by the backend password policy. */
export const PASSWORD_MIN_LENGTH = 12;

/** Known structured error codes returned by the auth endpoints. */
export const AUTH_ERROR = {
  weakPassword: 'weak_password',
  invalidOrExpiredToken: 'invalid_or_expired_token',
  tooManyAttempts: 'too_many_attempts',
} as const;

/** The structured `detail` of an auth error response, when the body carries one. */
export function authErrorDetail(error: unknown): AuthErrorDetail | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body: unknown = error.error;
  if (!body || typeof body !== 'object' || !('detail' in body)) {
    return null;
  }
  const detail: unknown = body.detail;
  if (!detail || typeof detail !== 'object' || !('code' in detail)) {
    return null;
  }
  return typeof detail.code === 'string' ? (detail as AuthErrorDetail) : null;
}

/** The structured error code (e.g. `weak_password`), or null. */
export function authErrorCode(error: unknown): string | null {
  return authErrorDetail(error)?.code ?? null;
}

/**
 * Whether the server rejected a new password against the password policy:
 * a 422 carrying `weak_password`, or a plain request-validation 422 (e.g. a
 * length check) with no structured code.
 */
export function isWeakPasswordError(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 422) {
    return false;
  }
  const code = authErrorCode(error);
  return code === null || code === AUTH_ERROR.weakPassword;
}

/**
 * Seconds to wait before retrying a rate-limited (429) request, from the body's
 * `retry_after` or the `Retry-After` header. Null when not a 429 / unknown.
 */
export function retryAfterSeconds(error: unknown): number | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 429) {
    return null;
  }
  const fromBody = authErrorDetail(error)?.retry_after;
  if (typeof fromBody === 'number' && Number.isFinite(fromBody) && fromBody >= 0) {
    return Math.ceil(fromBody);
  }
  const header = Number.parseInt(error.headers?.get('Retry-After') ?? '', 10);
  return Number.isFinite(header) && header >= 0 ? header : null;
}

/** Group validator: `newPassword` and `confirmPassword` controls must match. */
export const passwordsMatchValidator: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const password = group.get('newPassword')?.value as string | undefined;
  const confirm = group.get('confirmPassword')?.value as string | undefined;
  return confirm && password !== confirm ? { passwordMismatch: true } : null;
};
