/**
 * Own-account second-factor and session DTOs, mirroring coreflow-core
 * `app/schemas/mfa.py` and `SessionRead` (`app/schemas/auth.py`). WebAuthn
 * payloads use the standard JSON serialisation (base64url strings).
 */

/** Kind of enrolled factor. */
export type MfaFactorKind = 'totp' | 'webauthn';

/** An enrolled second factor (`label` is "" when the user gave none). */
export interface MfaFactor {
  readonly id: string;
  readonly kind: MfaFactorKind;
  readonly label: string;
  readonly created_at: string;
  readonly last_used_at: string | null;
}

/** `GET auth/mfa`. */
export interface MfaStatus {
  readonly enrolled: boolean;
  readonly session_verified: boolean;
  readonly factors: readonly MfaFactor[];
  readonly recovery_codes_remaining: number;
  /** Ids of the caller's orgs whose MFA policy applies to them. */
  readonly required_by_orgs: readonly string[];
}

/** `POST auth/mfa/totp/setup` response: render `otpauth_uri` as a QR code. */
export interface TotpSetup {
  readonly factor_id: string;
  /** Base32 secret for manual entry. */
  readonly secret: string;
  readonly otpauth_uri: string;
}

/** Response of a confirmed enrolment (authenticator app or passkey). */
export interface MfaEnrolResponse {
  readonly factor: MfaFactor;
  /** Only on the first factor: shown once, never retrievable again. */
  readonly recovery_codes: readonly string[] | null;
  /** The current access token was invalidated; call `auth/refresh` for upgraded claims. */
  readonly reauthenticate: boolean;
}

/** `POST auth/mfa/webauthn/register/options` response. */
export interface WebAuthnRegisterOptions {
  readonly challenge_token: string;
  /** PublicKeyCredentialCreationOptions JSON. */
  readonly public_key: PublicKeyCreationOptionsJson;
}

/** `POST auth/mfa/webauthn/options` response (sign-in step two). */
export interface WebAuthnLoginOptions {
  /** PublicKeyCredentialRequestOptions JSON. */
  readonly public_key: PublicKeyRequestOptionsJson;
}

/** A credential descriptor (`id` base64url). */
export interface CredentialDescriptorJson {
  readonly type: 'public-key';
  readonly id: string;
  readonly transports?: readonly string[];
}

/** PublicKeyCredentialCreationOptions in JSON form (binary fields base64url). */
export interface PublicKeyCreationOptionsJson {
  readonly rp: { readonly id?: string; readonly name: string };
  readonly user: { readonly id: string; readonly name: string; readonly displayName: string };
  readonly challenge: string;
  readonly pubKeyCredParams: readonly { readonly type: 'public-key'; readonly alg: number }[];
  readonly timeout?: number;
  readonly attestation?: string;
  readonly authenticatorSelection?: Readonly<Record<string, unknown>>;
  readonly excludeCredentials?: readonly CredentialDescriptorJson[];
}

/** PublicKeyCredentialRequestOptions in JSON form (binary fields base64url). */
export interface PublicKeyRequestOptionsJson {
  readonly challenge: string;
  readonly rpId?: string;
  readonly timeout?: number;
  readonly userVerification?: string;
  readonly allowCredentials?: readonly CredentialDescriptorJson[];
}

/** `POST auth/mfa/recovery-codes` response (the old codes stop working). */
export interface RecoveryCodes {
  readonly recovery_codes: readonly string[];
}

/** A signed-in session of the current user (`GET auth/sessions`). */
export interface UserSession {
  readonly id: string;
  readonly signed_in_at: string;
  readonly last_used_at: string;
  readonly expires_at: string;
  readonly user_agent: string | null;
  readonly ip: string | null;
  /** The session passed a second factor. */
  readonly mfa: boolean;
  readonly mfa_method: string | null;
  /** The session this browser is using. */
  readonly current: boolean;
}
