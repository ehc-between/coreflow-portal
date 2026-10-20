import { Injectable, signal } from '@angular/core';

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

/** Whether an HTTP error means "AI is not configured" (503). */
export function isAiNotConfigured(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 503;
}
