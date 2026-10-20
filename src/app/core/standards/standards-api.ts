import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, exhaustMap, takeWhile, timer } from 'rxjs';
import { SseClient, SseStream } from '../ai/sse-client';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  AiMapTarget,
  ClauseDetail,
  ClauseNode,
  CreateRequirementLinkRequest,
  GuidanceEvent,
  RequirementDetail,
  RequirementLink,
  RequirementLinkQuery,
  RequirementPatch,
  StandardJob,
  StandardJobStarted,
  StandardSummary,
} from './standards.models';

/** Default poll interval for background standards jobs. */
export const JOB_POLL_INTERVAL_MS = 1500;

/** Calls whose failures the pages explain inline (see `standardsErrorKey`). */
const INLINE_ERRORS = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** A job is finished once it is neither queued nor running. */
export function isJobFinished(job: Pick<StandardJob, 'status'>): boolean {
  return job.status !== 'queued' && job.status !== 'running';
}

/** Requirement refs may contain "/" (the backend matches them as a path): encode per segment. */
export function requirementPath(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/');
}

/**
 * Org-scoped ISO & standards API: the catalogue + enablement, the clause tree,
 * requirement applicability / status, evidence links (incl. AI suggestions),
 * and the background jobs (AI mapping, licensed-text extraction). Goes through
 * ApiService so requests carry the bearer + base URL. Reads need
 * `standards:read`; mutations `standards:manage`.
 */
@Injectable({ providedIn: 'root' })
export class StandardsApi {
  private readonly api = inject(ApiService);
  private readonly sse = inject(SseClient);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}`;
  }

  // --- Standards -------------------------------------------------------------

  list(orgId: string): Observable<StandardSummary[]> {
    return this.api.get<StandardSummary[]>(`${this.base(orgId)}/standards`);
  }

  setEnabled(orgId: string, key: string, enabled: boolean): Observable<StandardSummary> {
    return this.api.put<StandardSummary>(
      `${this.base(orgId)}/standards/${encodeURIComponent(key)}`,
      { enabled },
    );
  }

  /** Top-level nodes of the standard's clause tree (chapters / annexes). */
  getTree(orgId: string, key: string): Observable<ClauseNode[]> {
    return this.api.get<ClauseNode[]>(
      `${this.base(orgId)}/standards/${encodeURIComponent(key)}/tree`,
    );
  }

  getClause(orgId: string, key: string, number: string): Observable<ClauseDetail> {
    return this.api.get<ClauseDetail>(
      `${this.base(orgId)}/standards/${encodeURIComponent(key)}/clauses/${encodeURIComponent(number)}`,
    );
  }

  // --- Requirements ----------------------------------------------------------

  /** Refs may contain "/" (the backend matches them as a path), so encode per segment. */
  updateRequirement(
    orgId: string,
    ref: string,
    patch: RequirementPatch,
  ): Observable<RequirementDetail> {
    return this.api.patch<RequirementDetail>(
      `${this.base(orgId)}/standard-requirements/${requirementPath(ref)}`,
      patch,
      INLINE_ERRORS,
    );
  }

  // --- Evidence links --------------------------------------------------------

  listLinks(orgId: string, query: RequirementLinkQuery): Observable<RequirementLink[]> {
    return this.api.get<RequirementLink[]>(`${this.base(orgId)}/requirement-links`, {
      params: { ...query },
    });
  }

  createLink(orgId: string, body: CreateRequirementLinkRequest): Observable<RequirementLink> {
    return this.api.post<RequirementLink>(`${this.base(orgId)}/requirement-links`, body);
  }

  confirmLink(orgId: string, linkId: string): Observable<RequirementLink> {
    return this.api.post<RequirementLink>(
      `${this.base(orgId)}/requirement-links/${linkId}/confirm`,
      {},
    );
  }

  rejectLink(orgId: string, linkId: string): Observable<RequirementLink> {
    return this.api.post<RequirementLink>(
      `${this.base(orgId)}/requirement-links/${linkId}/reject`,
      {},
    );
  }

  deleteLink(orgId: string, linkId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/requirement-links/${linkId}`);
  }

  // --- Background jobs -------------------------------------------------------

  /**
   * Queue AI mapping of the org's records to this standard: everything, one
   * document (`document_id`, or a plain id) or one requirement (`requirement_ref`).
   */
  startAiMap(
    orgId: string,
    key: string,
    target?: string | AiMapTarget,
  ): Observable<StandardJobStarted> {
    const body: AiMapTarget = typeof target === 'string' ? { document_id: target } : (target ?? {});
    return this.api.post<StandardJobStarted>(
      `${this.base(orgId)}/standards/${encodeURIComponent(key)}/ai-map`,
      body,
      INLINE_ERRORS,
    );
  }

  /** Queue an AI draft document for a requirement (job kind `ai_draft`, yields a proposal). */
  startAiDraft(orgId: string, ref: string, lang: string): Observable<StandardJobStarted> {
    return this.api.post<StandardJobStarted>(
      `${this.base(orgId)}/standard-requirements/${requirementPath(ref)}/ai-draft`,
      { lang },
      INLINE_ERRORS,
    );
  }

  /**
   * Stream AI guidance for fulfilling a requirement (SSE: `delta`, `sources`,
   * `done`, `error`; a 503 arrives as `not-configured`). Cancel the handle to abort.
   */
  streamGuidance(
    orgId: string,
    ref: string,
    lang: string,
    onEvent: (event: GuidanceEvent) => void,
  ): SseStream {
    return this.sse.post<GuidanceEvent>(
      `${this.base(orgId)}/standard-requirements/${requirementPath(ref)}/ai-help`,
      { lang },
      onEvent,
    );
  }

  /** Queue extraction of clause text from the org's uploaded licensed PDF. */
  extractLicensedText(orgId: string, key: string): Observable<StandardJobStarted> {
    return this.api.post<StandardJobStarted>(
      `${this.base(orgId)}/standards/${encodeURIComponent(key)}/licensed-text/extract`,
      {},
      INLINE_ERRORS,
    );
  }

  getJob(orgId: string, jobId: string): Observable<StandardJob> {
    return this.api.get<StandardJob>(`${this.base(orgId)}/standard-jobs/${jobId}`);
  }

  /**
   * Poll a job until it finishes: emits every snapshot (including the final
   * one) and then completes. A slow request is never overlapped by the next
   * tick (`exhaustMap`). Errors propagate and stop polling.
   */
  pollJob(
    orgId: string,
    jobId: string,
    intervalMs = JOB_POLL_INTERVAL_MS,
  ): Observable<StandardJob> {
    return timer(0, intervalMs).pipe(
      exhaustMap(() => this.getJob(orgId, jobId)),
      takeWhile((job) => !isJobFinished(job), true),
    );
  }
}
