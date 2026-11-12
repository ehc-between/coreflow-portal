import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { AiActionConfirmResponse, AiActionDto } from './ai.models';

/**
 * Confirm-before-write client (platform contracts 8.3). The assistant never writes
 * directly: a write tool stores a pending proposal and streams an `action` event;
 * the change only happens when the same user confirms it here.
 *
 * Errors are rendered inline on the confirmation card (see `actionErrorState`),
 * so these calls skip the generic error toast.
 */
@Injectable({ providedIn: 'root' })
export class AiActionsApi {
  private readonly api = inject(ApiService);

  /** The proposal and its current state (used to re-sync a card after a 409). */
  get(orgId: string, actionId: string): Observable<AiActionDto> {
    return this.api.get<AiActionDto>(this.path(orgId, actionId), { context: quiet() });
  }

  /** Run the proposed change. */
  confirm(orgId: string, actionId: string): Observable<AiActionConfirmResponse> {
    return this.api.post<AiActionConfirmResponse>(
      `${this.path(orgId, actionId)}/confirm`,
      {},
      { context: quiet() },
    );
  }

  /** Discard the proposal (204). */
  reject(orgId: string, actionId: string): Observable<void> {
    return this.api.post<void>(`${this.path(orgId, actionId)}/reject`, {}, { context: quiet() });
  }

  private path(orgId: string, actionId: string): string {
    return `v1/orgs/${encodeURIComponent(orgId)}/ai/actions/${encodeURIComponent(actionId)}`;
  }
}

function quiet(): HttpContext {
  return new HttpContext().set(SKIP_ERROR_TOAST, true);
}

/** How a failed confirm/reject is shown on the card. */
export type ActionErrorState =
  | { readonly kind: 'not-pending' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'failed'; readonly message: string | null }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'error' };

/**
 * Map a confirm/reject HTTP error to a card state: 409 `action_not_pending`,
 * 410 `action_expired`, 422 `action_failed` (with the server's user-safe
 * message), 403 permission gone, 404 `action_not_found` / `module_disabled`.
 */
export function actionErrorState(error: unknown): ActionErrorState {
  const err = error as { status?: unknown; error?: { detail?: unknown } | null } | null;
  const raw = err?.error?.detail;
  const detail =
    typeof raw === 'object' && raw !== null ? (raw as { code?: unknown; message?: unknown }) : null;
  switch (err?.status) {
    case 409:
      return { kind: 'not-pending' };
    case 410:
      return { kind: 'expired' };
    case 422: {
      const message =
        detail?.code === 'action_failed' && typeof detail.message === 'string'
          ? detail.message.trim()
          : '';
      return { kind: 'failed', message: message || null };
    }
    case 403:
      return { kind: 'forbidden' };
    case 404:
      return { kind: 'gone' };
    default:
      return { kind: 'error' };
  }
}
