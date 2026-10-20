import { Injectable, signal } from '@angular/core';
import { isNotConfiguredDetail } from './sse-client';

/**
 * Whether the AI features are configured on the server, learned lazily: the
 * first 503 from an AI endpoint marks AI as unavailable for the session, so
 * every AI action can hide itself behind a neutral hint instead of failing
 * one by one. (Reload the app once AI has been set up.)
 */
@Injectable({ providedIn: 'root' })
export class AiAvailability {
  private readonly off = signal(false);

  /** True once an AI endpoint answered 503 (not configured). */
  readonly unavailable = this.off.asReadonly();

  markUnavailable(): void {
    this.off.set(true);
  }
}

/**
 * Whether an HTTP error means "AI is not configured": a 503 whose body's
 * `detail` says so. Any other 503 is a transient outage (retryable), not a
 * reason to hide AI for the session.
 */
export function isAiNotConfigured(error: unknown): boolean {
  const err = error as { status?: unknown; error?: { detail?: unknown } | null } | null;
  return err?.status === 503 && isNotConfiguredDetail(err.error?.detail);
}
