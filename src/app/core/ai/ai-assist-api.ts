import { Injectable, inject } from '@angular/core';
import { LanguageService } from '../i18n/language.service';
import { AssistEvent, AssistRequestBody } from './ai.models';
import { SseClient, SseStream } from './sse-client';

/**
 * Module AI buttons (platform contracts 8.5): runs an assist registered by a
 * module (`risk.suggest_controls`, ...) over `POST v1/orgs/{org}/ai/assist/{key}`.
 * Text assists stream `delta` events, JSON assists one `result` event; both end
 * with `done` or `error` (a 503 "not configured" becomes `not-configured`).
 * The active UI language is sent as `lang` unless the body sets one.
 */
@Injectable({ providedIn: 'root' })
export class AiAssistApi {
  private readonly sse = inject(SseClient);
  private readonly language = inject(LanguageService);

  run(
    orgId: string,
    key: string,
    body: AssistRequestBody,
    onEvent: (event: AssistEvent) => void,
  ): SseStream {
    const payload: AssistRequestBody = { ...body, lang: body.lang ?? this.language.active() };
    return this.sse.post<AssistEvent>(
      `v1/orgs/${encodeURIComponent(orgId)}/ai/assist/${encodeURIComponent(key)}`,
      payload,
      onEvent,
    );
  }
}
