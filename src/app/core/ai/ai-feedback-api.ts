import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { ANSWER_FEEDBACK_COMMENT_MAX, AnswerFeedbackBody } from './ai.models';

const REASON_RE = /^[a-z0-9_]{1,32}$/;

/**
 * Answer feedback (P2): thumbs up / down on one of the caller's own answers,
 * identified by the `run_id` of the stream's `done` event.
 *
 * `POST v1/orgs/{org}/ai/runs/{run_id}/feedback` → 204. Rating again replaces the
 * earlier rating. Any org member may rate their own runs; no extra permission.
 * Failures are shown inline next to the thumbs, so the generic toast is skipped.
 */
@Injectable({ providedIn: 'root' })
export class AiFeedbackApi {
  private readonly api = inject(ApiService);

  rate(orgId: string, runId: string, body: AnswerFeedbackBody): Observable<void> {
    const payload: Record<string, string> = { rating: body.rating };
    if (body.reason && REASON_RE.test(body.reason)) {
      payload['reason'] = body.reason;
    }
    const comment = body.comment?.trim();
    if (comment) {
      payload['comment'] = comment.slice(0, ANSWER_FEEDBACK_COMMENT_MAX);
    }
    return this.api.post<void>(
      `v1/orgs/${encodeURIComponent(orgId)}/ai/runs/${encodeURIComponent(runId)}/feedback`,
      payload,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }
}
