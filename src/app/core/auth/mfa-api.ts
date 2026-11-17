import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService, RequestOptions } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  MfaEnrolResponse,
  MfaStatus,
  RecoveryCodes,
  TotpSetup,
  UserSession,
  WebAuthnRegisterOptions,
} from './mfa.models';
import { CredentialJson } from './webauthn';

/**
 * The signed-in user's own second factors, recovery codes and sessions
 * (`/v1/auth/mfa*`, `/v1/auth/sessions*`; bearer only, no org permission).
 *
 * Every call sends the refresh cookie (`withCredentials`): the server uses it
 * to identify THIS session (upgrade it on first enrolment, mark it `current`,
 * clear it when revoked). Errors are handled in place by the caller.
 */
@Injectable({ providedIn: 'root' })
export class MfaApi {
  private readonly api = inject(ApiService);

  private readonly options: RequestOptions = {
    withCredentials: true,
    context: new HttpContext().set(SKIP_ERROR_TOAST, true),
  };

  status(): Observable<MfaStatus> {
    return this.api.get<MfaStatus>('v1/auth/mfa', this.options);
  }

  startTotp(label: string | null): Observable<TotpSetup> {
    return this.api.post<TotpSetup>('v1/auth/mfa/totp/setup', { label }, this.options);
  }

  confirmTotp(factorId: string, code: string): Observable<MfaEnrolResponse> {
    return this.api.post<MfaEnrolResponse>(
      'v1/auth/mfa/totp/confirm',
      { factor_id: factorId, code },
      this.options,
    );
  }

  passkeyOptions(): Observable<WebAuthnRegisterOptions> {
    return this.api.post<WebAuthnRegisterOptions>(
      'v1/auth/mfa/webauthn/register/options',
      null,
      this.options,
    );
  }

  registerPasskey(
    challengeToken: string,
    label: string | null,
    credential: CredentialJson,
  ): Observable<MfaEnrolResponse> {
    return this.api.post<MfaEnrolResponse>(
      'v1/auth/mfa/webauthn/register/verify',
      { challenge_token: challengeToken, label, credential },
      this.options,
    );
  }

  removeFactor(factorId: string, password: string): Observable<void> {
    return this.api
      .post<unknown>(`v1/auth/mfa/factors/${factorId}/remove`, { password }, this.options)
      .pipe(map(() => undefined));
  }

  regenerateRecoveryCodes(password: string): Observable<RecoveryCodes> {
    return this.api.post<RecoveryCodes>('v1/auth/mfa/recovery-codes', { password }, this.options);
  }

  listSessions(): Observable<UserSession[]> {
    return this.api.get<UserSession[]>('v1/auth/sessions', this.options);
  }

  revokeSession(sessionId: string): Observable<void> {
    return this.api
      .delete<unknown>(`v1/auth/sessions/${sessionId}`, this.options)
      .pipe(map(() => undefined));
  }
}
