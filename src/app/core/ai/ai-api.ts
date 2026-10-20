import { Injectable, inject } from '@angular/core';
import { AskEvent, ConversationTurn } from './ai.models';
import { SseClient, SseStream } from './sse-client';

/** A live Ask CoreFlow stream: cancel it to abort the underlying request. */
export type AskStream = SseStream;

/**
 * Ask CoreFlow streaming client over the non-org-prefixed `/v1/ai/ask`
 * endpoint (see {@link SseClient}: fetch + in-memory bearer, a 503 becomes a
 * single `not-configured` event so the panel can show a calm state).
 */
@Injectable({ providedIn: 'root' })
export class AiApi {
  private readonly sse = inject(SseClient);

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
    return this.sse.post<AskEvent>('v1/ai/ask', { org_id: orgId, messages }, onEvent);
  }
}
