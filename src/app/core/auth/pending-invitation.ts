import { Injectable } from '@angular/core';

/** In-app route of the accept-invitation page (used as the login `returnUrl`). */
export const ACCEPT_INVITE_PATH = '/invite/accept';

/**
 * Holds an invitation token across the sign-in detour an existing account must
 * take before it can accept (the backend only joins an existing account when
 * the request carries that account's own session). Memory only: the token is
 * never written to storage or put back in a URL, so a reload drops it and the
 * user simply opens the emailed link again.
 */
@Injectable({ providedIn: 'root' })
export class PendingInvitation {
  private token: string | null = null;

  /** Remember a token until the accept page picks it up again. */
  stash(token: string): void {
    this.token = token;
  }

  /** Return and forget the stashed token ('' when there is none). */
  take(): string {
    const token = this.token ?? '';
    this.token = null;
    return token;
  }
}
