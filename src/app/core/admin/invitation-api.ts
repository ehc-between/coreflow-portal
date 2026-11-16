import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
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

/**
 * Accept response when the invited account already existed. The backend only
 * joins an existing account when the request carries that account's session:
 * - signed out: `{ ok: false, requires_login: true }` (nothing changed);
 * - signed in as the invited account: `{ ok: true, requires_login: false }`.
 * Signed in as anyone else is refused with 403 `invitation_email_mismatch`.
 */
export interface AcceptExistingResult {
  readonly ok: boolean;
  readonly requires_login: boolean;
}

/** Accept response: a new-user session, or the existing-account outcome. */
export type AcceptInviteResult = AuthSession | AcceptExistingResult;

/** Narrows an accept response to the new-user session variant. */
export function isNewUserSession(result: AcceptInviteResult): result is AuthSession {
  return 'access_token' in result;
}

/** Error code when the signed-in account is not the invited one (HTTP 403). */
export const INVITATION_EMAIL_MISMATCH = 'invitation_email_mismatch';

/** True when an accept failure is the "signed in as a different account" refusal. */
export function isInvitationEmailMismatch(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 403) {
    return false;
  }
  const detail = (error.error as { detail?: { code?: string } } | null)?.detail;
  return detail?.code === INVITATION_EMAIL_MISMATCH;
}

/**
 * PUBLIC invitation endpoints. Usually called pre-login (no bearer); when the
 * user is signed in, the auth interceptor attaches their bearer (these URLs sit
 * under `apiBaseUrl`), which is what lets an existing account accept. The accept call must run with `withCredentials` so the
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
