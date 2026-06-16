import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import { AiEditEvent, AiEditRequest } from './ai-edit.models';

/** A live AI-edit stream: cancel it to abort the underlying request. */
export interface AiEditStream {
  /** Aborts the in-flight request and stops further `onEvent` callbacks. */
  cancel(): void;
}

/**
 * Embedded document-editing client. Like {@link AiApi}, HttpClient can't surface
 * a Server-Sent Events body for a POST-with-body, so this uses `fetch()` directly
 * against `/v1/ai/edit`, reading the response body as a stream and parsing each
 * `data: <json>` line into an {@link AiEditEvent}.
 *
 * The endpoint is outside HttpClient, so the bearer token is attached manually
 * from {@link AuthService.accessToken} (kept in memory). A 503 is mapped to a
 * single `not-configured` event so the caller can show a calm state. Zoneless
 * friendly: events are delivered via the caller's `onEvent` callback (the editor
 * pushes them into a signal); no zone patching is relied upon.
 */
@Injectable({ providedIn: 'root' })
export class AiEditApi {
  private readonly auth = inject(AuthService);
  private readonly baseUrl = inject(APP_CONFIG).apiBaseUrl.replace(/\/+$/, '');

  /**
   * Start a streamed edit. `onEvent` fires for every parsed event as it arrives;
   * the returned handle's `cancel()` aborts the request. The stream ends on a
   * `done`, `error`, or `not-configured` event, or when cancelled.
   */
  edit(request: AiEditRequest, onEvent: (event: AiEditEvent) => void): AiEditStream {
    const controller = new AbortController();
    void this.run(request, onEvent, controller.signal);
    return { cancel: () => controller.abort() };
  }

  private async run(
    request: AiEditRequest,
    onEvent: (event: AiEditEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/ai/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.auth.accessToken() ?? ''}`,
        },
        body: JSON.stringify(request),
        signal,
      });
    } catch {
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

  private emitMessage(rawMessage: string, onEvent: (event: AiEditEvent) => void): void {
    const data = rawMessage
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (!data) {
      return;
    }
    let event: AiEditEvent;
    try {
      event = JSON.parse(data) as AiEditEvent;
    } catch {
      return;
    }
    onEvent(event);
  }
}
