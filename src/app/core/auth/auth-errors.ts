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
  /** 503 from a fail-closed auth route while the rate limiter backend is down. */
  rateLimiterUnavailable: 'rate_limiter_unavailable',
  /** 429 from the general per-user API throttle (search/export/AI buckets too). */
  rateLimited: 'rate_limited',
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
  return readRetryAfter(error);
}

/** `retry_after` from the body, else the `Retry-After` header, in whole seconds. */
function readRetryAfter(error: HttpErrorResponse): number | null {
  const fromBody = authErrorDetail(error)?.retry_after;
  if (typeof fromBody === 'number' && Number.isFinite(fromBody) && fromBody >= 0) {
    return Math.ceil(fromBody);
  }
  const header = Number.parseInt(error.headers?.get('Retry-After') ?? '', 10);
  return Number.isFinite(header) && header >= 0 ? header : null;
}

/** A translated message: i18n key plus optional interpolation params. */
export interface TranslatedMessage {
  readonly key: string;
  readonly params?: Record<string, unknown>;
}

/**
 * Message for a rate-limited (429) response, showing the wait time when known:
 * `<keyBase>Seconds` (`{{seconds}}`, under a minute), `<keyBase>Minutes`
 * (`{{minutes}}`, rounded up) or plain `<keyBase>`. Null when not a 429.
 */
export function rateLimitMessage(error: unknown, keyBase: string): TranslatedMessage | null {
  if ((error as { status?: number } | null)?.status !== 429) {
    return null;
  }
  return waitMessage(retryAfterSeconds(error), keyBase);
}

/** Wait-time message: `<keyBase>Seconds` / `<keyBase>Minutes` / plain `<keyBase>`. */
function waitMessage(seconds: number | null, keyBase: string): TranslatedMessage {
  if (seconds === null) {
    return { key: keyBase };
  }
  if (seconds < 60) {
    return { key: `${keyBase}Seconds`, params: { seconds: Math.max(seconds, 1) } };
  }
  return { key: `${keyBase}Minutes`, params: { minutes: Math.ceil(seconds / 60) } };
}

/**
 * Whether a fail-closed auth route (sign-in, password-reset request, invitation
 * accept) refused the request because the rate limiter backend is down: a 503
 * carrying `rate_limiter_unavailable`. Transient — the user should retry shortly.
 */
export function isRateLimiterUnavailable(error: unknown): error is HttpErrorResponse {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 503 &&
    authErrorCode(error) === AUTH_ERROR.rateLimiterUnavailable
  );
}

/** Whether a 429 came from the general per-user API throttle (`rate_limited`). */
export function isApiRateLimited(error: unknown): error is HttpErrorResponse {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 429 &&
    authErrorCode(error) === AUTH_ERROR.rateLimited
  );
}

/**
 * Message for the server-wide throttling outcomes, kept separate from the
 * per-form lockout copy (`too_many_attempts`):
 *  - 503 `rate_limiter_unavailable` → "temporarily unavailable, retry shortly"
 *    (`errors.temporarilyUnavailable*`);
 *  - 429 `rate_limited` → a generic "slow down" (`errors.rateLimited*`).
 * Null for anything else, so callers fall through to their own mapping.
 */
export function throttleMessage(error: unknown): TranslatedMessage | null {
  if (isRateLimiterUnavailable(error)) {
    return waitMessage(readRetryAfter(error), 'errors.temporarilyUnavailable');
  }
  if (isApiRateLimited(error)) {
    return slowDownMessage(readRetryAfter(error));
  }
  return null;
}

/**
 * The generic "slow down" message (`errors.rateLimited*`) for a wait of
 * `retryAfter` seconds (null = unknown). For callers that see a 429 outside
 * HttpClient, e.g. the fetch-based AI stream client.
 */
export function slowDownMessage(retryAfter: number | null): TranslatedMessage {
  const seconds =
    retryAfter !== null && Number.isFinite(retryAfter) && retryAfter >= 0
      ? Math.ceil(retryAfter)
      : null;
  return waitMessage(seconds, 'errors.rateLimited');
}

/** Group validator: `newPassword` and `confirmPassword` controls must match. */
export const passwordsMatchValidator: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const password = group.get('newPassword')?.value as string | undefined;
  const confirm = group.get('confirmPassword')?.value as string | undefined;
  return confirm && password !== confirm ? { passwordMismatch: true } : null;
};
