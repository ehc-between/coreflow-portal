import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SseClient, SseStream } from '../../core/ai/sse-client';
import { ApiService } from '../../core/http/api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { StarterAcceptBody, StarterAcceptResult, StarterEvent } from './starter-setup.models';

/**
 * Starter setup endpoints (`v1/orgs/{org}/starter-setup/...`). `propose` streams
 * `status` events, one `result` and `done` (falls back to standard templates on the
 * server when the assistant is off); `accept` creates the confirmed items.
 */
@Injectable({ providedIn: 'root' })
export class StarterSetupApi {
  private readonly sse = inject(SseClient);
  private readonly api = inject(ApiService);
  private readonly language = inject(LanguageService);

  propose(
    orgId: string,
    providerKey: string,
    body: { mode?: 'auto' | 'template'; notes?: string },
    onEvent: (event: StarterEvent) => void,
  ): SseStream {
    return this.sse.post<StarterEvent>(
      `${this.base(orgId, providerKey)}/ai-proposals`,
      { ...body, lang: this.language.active() },
      onEvent,
    );
  }

  accept(
    orgId: string,
    providerKey: string,
    body: StarterAcceptBody,
  ): Observable<StarterAcceptResult> {
    return this.api.post<StarterAcceptResult>(`${this.base(orgId, providerKey)}/accept`, {
      ...body,
      lang: body.lang ?? this.language.active(),
    });
  }

  private base(orgId: string, providerKey: string): string {
    return `v1/orgs/${encodeURIComponent(orgId)}/starter-setup/${encodeURIComponent(providerKey)}`;
  }
}
