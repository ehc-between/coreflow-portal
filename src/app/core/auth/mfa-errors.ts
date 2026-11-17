import { HttpErrorResponse } from '@angular/common/http';
import { TranslatedMessage, authErrorDetail, rateLimitMessage } from './auth-errors';

/** Structured error codes returned by the second-factor endpoints. */
export const MFA_ERROR = {
  invalidCode: 'invalid_mfa_code',
  invalidToken: 'invalid_mfa_token',
  noPasskeys: 'no_passkeys',
  enrolmentNotFound: 'enrolment_not_found',
  enrolmentExpired: 'enrolment_expired',
  invalidChallenge: 'invalid_challenge',
  invalidCredential: 'invalid_credential',
  credentialAlreadyRegistered: 'credential_already_registered',
  invalidPassword: 'invalid_password',
  factorNotFound: 'factor_not_found',
  requiredByOrg: 'mfa_required_by_org',
  notEnrolled: 'mfa_not_enrolled',
  verificationRequired: 'mfa_verification_required',
  tooManyFactors: 'too_many_factors',
} as const;

/** i18n key (under `auth.mfa.error.`) per known code. */
const CODE_KEYS: Readonly<Record<string, string>> = {
  [MFA_ERROR.invalidCode]: 'invalidCode',
  [MFA_ERROR.invalidToken]: 'invalidToken',
  [MFA_ERROR.noPasskeys]: 'noPasskeys',
  [MFA_ERROR.enrolmentNotFound]: 'enrolmentExpired',
  [MFA_ERROR.enrolmentExpired]: 'enrolmentExpired',
  [MFA_ERROR.invalidChallenge]: 'passkeyFailed',
  [MFA_ERROR.invalidCredential]: 'passkeyFailed',
  [MFA_ERROR.credentialAlreadyRegistered]: 'passkeyAlreadyRegistered',
  [MFA_ERROR.invalidPassword]: 'invalidPassword',
  [MFA_ERROR.factorNotFound]: 'factorNotFound',
  [MFA_ERROR.requiredByOrg]: 'requiredByOrg',
  [MFA_ERROR.notEnrolled]: 'notEnrolled',
  [MFA_ERROR.verificationRequired]: 'verificationRequired',
  [MFA_ERROR.tooManyFactors]: 'tooManyFactors',
};

/** The structured error code of an MFA response, or null. */
export function mfaErrorCode(error: unknown): string | null {
  return authErrorDetail(error)?.code ?? null;
}

/**
 * Map a second-factor failure (sign-in step two or own-account management) to
 * a translated message. A wrong code shows how many tries are left when the
 * server says so; 429 shows the wait time.
 */
export function mfaErrorMessage(error: unknown): TranslatedMessage {
  const rateLimited = rateLimitMessage(error, 'auth.mfa.error.tooManyAttempts');
  if (rateLimited) {
    return rateLimited;
  }
  const detail = authErrorDetail(error);
  if (detail?.code === MFA_ERROR.invalidCode && typeof detail.attempts_remaining === 'number') {
    return {
      key:
        detail.attempts_remaining === 1
          ? 'auth.mfa.error.invalidCodeRemainingOne'
          : 'auth.mfa.error.invalidCodeRemaining',
      params: { count: detail.attempts_remaining },
    };
  }
  const key = detail ? CODE_KEYS[detail.code] : undefined;
  if (key) {
    return { key: `auth.mfa.error.${key}` };
  }
  if (error instanceof HttpErrorResponse && error.status === 422) {
    return { key: 'auth.mfa.error.invalidCode' };
  }
  return { key: 'errors.generic' };
}
