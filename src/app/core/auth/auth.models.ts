/** Roles and permissions a user holds within a single organisation. */
export interface OrgMembership {
  readonly name: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  /**
   * The org requires a second factor of this member and the session has not
   * passed one: `permissions` is empty until the user enrols / signs in with one.
   */
  readonly mfa_required?: boolean;
}

/** The authenticated user as returned by the backend (login / refresh / me). */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly full_name: string;
  readonly is_superuser: boolean;
  readonly orgs: Readonly<Record<string, OrgMembership>>;
  /** The user has a confirmed second factor (authenticator app or passkey). */
  readonly mfa_enrolled?: boolean;
  /** This session passed a second factor. */
  readonly mfa_verified?: boolean;
}

/** Successful login / refresh response body. */
export interface AuthSession {
  readonly access_token: string;
  readonly token_type: 'bearer';
  readonly expires_in: number;
  readonly user: AuthUser;
  readonly mfa_required?: false;
}

/** A second-factor method offered at sign-in. */
export type MfaMethod = 'totp' | 'webauthn' | 'recovery_code';

/**
 * `POST auth/login` when the password is right but a second factor is needed:
 * no tokens and no cookie; `mfa_token` is the single-use credential for step two.
 */
export interface MfaChallenge {
  readonly mfa_required: true;
  readonly mfa_token: string;
  readonly methods: readonly MfaMethod[];
  readonly expires_in: number;
}

/** What a sign-in attempt resolved to: a session, or a second-factor challenge. */
export type LoginResult =
  | { readonly kind: 'session'; readonly user: AuthUser }
  | { readonly kind: 'mfa'; readonly challenge: MfaChallenge };

/** `POST auth/mfa/verify` body (second sign-in step). */
export interface MfaVerifyRequest {
  readonly mfa_token: string;
  readonly method: MfaMethod;
  /** Authenticator-app code or recovery code. */
  readonly code?: string;
  /** WebAuthn assertion (PublicKeyCredential JSON) when `method` is `webauthn`. */
  readonly credential?: Readonly<Record<string, unknown>>;
}

/** Login request body. */
export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

/** Change-password request body. */
export interface ChangePasswordRequest {
  readonly old_password: string;
  readonly new_password: string;
}

/** Forgot-password request body (`POST auth/password-reset/request`). */
export interface PasswordResetRequest {
  readonly email: string;
}

/** Reset-password confirmation body (`POST auth/password-reset/confirm`). */
export interface PasswordResetConfirmRequest {
  readonly token: string;
  readonly new_password: string;
}

/**
 * Structured error detail returned by auth endpoints, e.g.
 * `{"detail": {"code": "weak_password", "message": "..."}}` or
 * `{"detail": {"code": "too_many_attempts", "retry_after": 60}}`.
 */
export interface AuthErrorDetail {
  readonly code: string;
  readonly message?: string;
  readonly retry_after?: number;
  /** Wrong second-factor code: attempts left on this sign-in challenge. */
  readonly attempts_remaining?: number;
  /** Orgs whose MFA policy blocks removing the last factor. */
  readonly org_ids?: readonly string[];
}
