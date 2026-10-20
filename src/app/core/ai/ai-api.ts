import { Injectable, inject } from '@angular/core';
import { LanguageService } from '../i18n/language.service';
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
  private readonly language = inject(LanguageService);

  /**
   * Start a streamed answer for a conversation. `messages` is the full thread
   * oldest→newest, ending in the latest user turn. `onEvent` fires for every
   * parsed event as it arrives; the returned handle's `cancel()` aborts the
   * request. The stream ends on a `done`, `error`, or `not-configured` event,
   * or when cancelled. The active UI language goes along as `lang`, so the
   * answer (and anything the assistant creates, e.g. deviation types) is
   * written in the user's language.
   */
  ask(
    messages: readonly ConversationTurn[],
    orgId: string,
    onEvent: (event: AskEvent) => void,
  ): AskStream {
    return this.sse.post<AskEvent>(
      'v1/ai/ask',
      { org_id: orgId, messages, lang: this.language.active() },
      onEvent,
    );
  }
}
