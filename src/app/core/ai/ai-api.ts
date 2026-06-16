import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import { AskEvent, ConversationTurn } from './ai.models';

/** A live Ask CoreFlow stream: cancel it to abort the underlying request. */
export interface AskStream {
  /** Aborts the in-flight request and stops further `onEvent` callbacks. */
  cancel(): void;
}

/**
 * Ask CoreFlow streaming client. Angular's HttpClient can't surface a Server-Sent
 * Events body for a POST-with-body, so this uses `fetch()` directly against the
 * non-org-prefixed `/v1/ai/ask` endpoint, reading the response body as a stream
 * and parsing each `data: <json>` line into an {@link AskEvent}.
 *
 * The endpoint is outside HttpClient, so the bearer token is attached manually
 * from {@link AuthService.accessToken} (kept in memory). A 503 is mapped to a
 * single `not-configured` event so the panel can show a calm state. Zoneless
 * friendly: events are delivered via the caller's `onEvent` callback (the panel
 * pushes them into a signal); no zone patching is relied upon.
 */
@Injectable({ providedIn: 'root' })
export class AiApi {
  private readonly auth = inject(AuthService);
  private readonly baseUrl = inject(APP_CONFIG).apiBaseUrl.replace(/\/+$/, '');

  /**
   * Start a streamed answer for a conversation. `messages` is the full thread
   * oldest→newest, ending in the latest user turn. `onEvent` fires for every
   * parsed event as it arrives; the returned handle's `cancel()` aborts the
   * request. The stream ends on a `done`, `error`, or `not-configured` event,
   * or when cancelled.
   */
  ask(
    messages: readonly ConversationTurn[],
    orgId: string,
    onEvent: (event: AskEvent) => void,
  ): AskStream {
    const controller = new AbortController();
    void this.run(messages, orgId, onEvent, controller.signal);
    return { cancel: () => controller.abort() };
  }

  private async run(
    messages: readonly ConversationTurn[],
    orgId: string,
    onEvent: (event: AskEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/ai/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.auth.accessToken() ?? ''}`,
        },
        body: JSON.stringify({ org_id: orgId, messages }),
        signal,
      });
    } catch {
      // Aborts surface as an AbortError here; treat any pre-stream failure as a
      // soft error rather than throwing (the panel handles `error` calmly).
      if (!signal.aborted) {
        onEvent({ type: 'error', message: '' });
      }
      return;
    }

    if (response.status === 503) {
      onEvent({ type: 'not-configured' });
      return;
    }

    if (!response.ok || !response.body) {
      onEvent({ type: 'error', message: '' });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        // SSE messages are separated by a blank line; process whole ones and
        // keep the trailing partial in the buffer for the next chunk.
        let separator = buffer.indexOf('\n\n');
        while (separator !== -1) {
          const rawMessage = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          this.emitMessage(rawMessage, onEvent);
          separator = buffer.indexOf('\n\n');
        }
      }
    } catch {
      if (!signal.aborted) {
        onEvent({ type: 'error', message: '' });
      }
    }
  }

  private emitMessage(rawMessage: string, onEvent: (event: AskEvent) => void): void {
    // A single SSE message may span multiple `data:` lines; concatenate them.
    const data = rawMessage
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (!data) {
      return;
    }
    let event: AskEvent;
    try {
      event = JSON.parse(data) as AskEvent;
    } catch {
      return;
    }
    onEvent(event);
  }
}
