import { Injectable, inject } from '@angular/core';
import { AiEditEvent, AiEditRequest } from './ai-edit.models';
import { SseClient, SseStream } from './sse-client';

/** A live AI-edit stream: cancel it to abort the underlying request. */
export type AiEditStream = SseStream;

/**
 * Embedded document-editing client over `/v1/ai/edit` (see {@link SseClient}:
 * fetch + in-memory bearer, a 503 becomes a single `not-configured` event).
 */
@Injectable({ providedIn: 'root' })
export class AiEditApi {
  private readonly sse = inject(SseClient);

  /**
   * Start a streamed edit. `onEvent` fires for every parsed event as it arrives;
   * the returned handle's `cancel()` aborts the request. The stream ends on a
   * `done`, `error`, or `not-configured` event, or when cancelled.
   */
  edit(request: AiEditRequest, onEvent: (event: AiEditEvent) => void): AiEditStream {
    return this.sse.post<AiEditEvent>('v1/ai/edit', request, onEvent);
  }
}
