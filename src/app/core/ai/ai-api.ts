import { Injectable, inject } from '@angular/core';
import { LanguageService } from '../i18n/language.service';
import { AskEvent, AskMode, ConversationTurn, GuidanceLevel } from './ai.models';
import { PageContextDto } from './page-context';
import { SseClient, SseStream } from './sse-client';

/** A live Ask CoreFlow stream: cancel it to abort the underlying request. */
export type AskStream = SseStream;

/** Optional F5 fields of an Ask request. Omitted fields are not sent. */
export interface AskOptions {
  /** The page the user is on (already in wire shape, see `toPageContextDto`). */
  readonly pageContext?: PageContextDto | null;
  /** `tutor` makes the assistant teach step by step (adapted to `guidanceLevel`). */
  readonly mode?: AskMode;
  readonly guidanceLevel?: GuidanceLevel | null;
  /** Tutor topic, e.g. `risk.list` or `iso9001:6.1`. */
  readonly topic?: string | null;
}

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
    options: AskOptions = {},
  ): AskStream {
    const body: Record<string, unknown> = {
      org_id: orgId,
      messages,
      lang: this.language.active(),
    };
    if (options.pageContext) {
      body['page_context'] = options.pageContext;
    }
    if (options.mode === 'tutor') {
      body['mode'] = 'tutor';
      if (options.topic?.trim()) {
        body['topic'] = options.topic.trim().slice(0, 200);
      }
    }
    if (options.guidanceLevel) {
      body['guidance_level'] = options.guidanceLevel;
    }
    return this.sse.post<AskEvent>('v1/ai/ask', body, onEvent);
  }
}
