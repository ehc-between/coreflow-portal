import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthSession } from '../auth/auth.models';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';

/** Public preview of an invitation (by token). */
export interface InvitePreview {
  readonly org_name: string;
  readonly email: string;
  readonly role_key: string;
  readonly user_exists: boolean;
  readonly valid: boolean;
}

/** Request body for accepting an invitation. */
export interface AcceptInviteRequest {
  readonly token: string;
  readonly password?: string;
  readonly full_name?: string;
}

/** Accept response when the invited account already existed. */
export interface AcceptExistingResult {
  readonly ok: true;
  readonly requires_login: true;
}

/** Accept response: a new-user session, or an instruction to sign in. */
export type AcceptInviteResult = AuthSession | AcceptExistingResult;

/** Narrows an accept response to the new-user session variant. */
export function isNewUserSession(result: AcceptInviteResult): result is AuthSession {
  return 'access_token' in result;
}

/**
 * PUBLIC invitation endpoints. Used pre-login, so no bearer is present (the auth
 * interceptor adds none). The accept call must run with `withCredentials` so the
 * server-set httpOnly refresh cookie is stored for the new user. Failures here
 * (404/410 for an expired/used link) are an expected outcome shown in-place, so
 * the generic error toast is suppressed via SKIP_ERROR_TOAST.
 */
@Injectable({ providedIn: 'root' })
export class InvitationApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(APP_CONFIG).apiBaseUrl.replace(/\/+$/, '')}/v1/invitations`;

  private skipToast(): HttpContext {
    return new HttpContext().set(SKIP_ERROR_TOAST, true);
  }

  getInvite(token: string): Observable<InvitePreview> {
    return this.http.get<InvitePreview>(`${this.baseUrl}/${encodeURIComponent(token)}`, {
      context: this.skipToast(),
    });
  }

  acceptInvite(body: AcceptInviteRequest): Observable<AcceptInviteResult> {
    return this.http.post<AcceptInviteResult>(`${this.baseUrl}/accept`, body, {
      withCredentials: true,
      context: this.skipToast(),
    });
  }
}
