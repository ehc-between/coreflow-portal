import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';

/** A live Server-Sent Events stream: cancel it to abort the underlying request. */
export interface SseStream {
  /** Aborts the in-flight request and stops further `onEvent` callbacks. */
  cancel(): void;
}

/** Events every stream can end with (synthesised by the client, not the server). */
export type SseControlEvent =
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'not-configured' };

/**
 * Streaming POST client for the AI endpoints. Angular's HttpClient can't surface
 * a Server-Sent Events body for a POST-with-body, so this uses `fetch()`
 * directly against `apiBaseUrl`, reading the response body as a stream and
 * parsing each `data: <json>` message into an event.
 *
 * The request is outside HttpClient, so the bearer token is attached manually
 * from {@link AuthService.accessToken} (kept in memory). A 503 (AI not
 * configured) becomes a single `not-configured` event and any other failure a
 * single `error` event, so callers render calm states without inspecting HTTP.
 * Zoneless friendly: events are delivered through the caller's callback.
 */
@Injectable({ providedIn: 'root' })
export class SseClient {
  private readonly auth = inject(AuthService);
  private readonly baseUrl = inject(APP_CONFIG).apiBaseUrl.replace(/\/+$/, '');

  /** POST `body` as JSON to `path` (relative to `apiBaseUrl`) and stream the events. */
  post<E extends { readonly type: string }>(
    path: string,
    body: unknown,
    onEvent: (event: E | SseControlEvent) => void,
  ): SseStream {
    const controller = new AbortController();
    void this.run(path, body, onEvent, controller.signal);
    return { cancel: () => controller.abort() };
  }

  private async run<E>(
    path: string,
    body: unknown,
    onEvent: (event: E | SseControlEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${path.replace(/^\/+/, '')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.auth.accessToken() ?? ''}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch {
      // Aborts surface as an AbortError here; treat any pre-stream failure as a
      // soft error rather than throwing.
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
          emitSseMessage(rawMessage, onEvent);
          separator = buffer.indexOf('\n\n');
        }
      }
    } catch {
      if (!signal.aborted) {
        onEvent({ type: 'error', message: '' });
      }
    }
  }
}

/**
 * Parse one SSE message (it may span several `data:` lines, which are
 * concatenated) and deliver its JSON payload. Malformed messages are dropped.
 */
export function emitSseMessage<E>(rawMessage: string, onEvent: (event: E) => void): void {
  const data = rawMessage
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('');
  if (!data) {
    return;
  }
  let event: E;
  try {
    event = JSON.parse(data) as E;
  } catch {
    return;
  }
  onEvent(event);
}
