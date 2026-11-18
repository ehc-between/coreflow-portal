import { HttpContext } from '@angular/common/http';
import { Injectable, Injector, inject } from '@angular/core';
import { Observable, exhaustMap, takeWhile, timer } from 'rxjs';
import { SseClient, SseStream } from '../ai/sse-client';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { LanguageService } from '../i18n/language.service';
import {
  AiMapTarget,
  BulkLinksRequest,
  BulkLinksResponse,
  CatalogueClause,
  ClauseDetail,
  ClauseLinkRequest,
  ClauseLinkResponse,
  ExportFormat,
  GapsQuery,
  GapsResponse,
  RequirementCoverageResponse,
  RequirementEvidence,
  SuggestRequirementsResponse,
  ClauseMappingItem,
  ClauseNode,
  ClauseSupport,
  CreateRequirementLinkRequest,
  EvidenceSuggestions,
  FrameworkReadiness,
  FrameworkSummary,
  GuidanceEvent,
  RequirementDetail,
  RequirementLink,
  RequirementLinkQuery,
  RequirementPatch,
  ReuseEvidenceResponse,
  StandardJob,
  StandardJobStarted,
  StandardSummary,
  SuggestFromRecordsResponse,
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
  private readonly injector = inject(Injector);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}`;
  }

  /**
   * UI language for endpoints that return display labels (`?lang=`). Resolved lazily so
   * the API stays usable where i18n is not set up; then the parameter is left out and
   * the backend falls back to the browser's Accept-Language.
   */
  private lang(): string | undefined {
    try {
      return this.injector.get(LanguageService).active();
    } catch {
      return undefined;
    }
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

  /** Links of a requirement or of a record; items carry a display `label` in the UI language. */
  listLinks(orgId: string, query: RequirementLinkQuery): Observable<RequirementLink[]> {
    return this.api.get<RequirementLink[]>(`${this.base(orgId)}/requirement-links`, {
      params: { ...query, lang: this.lang() },
    });
  }

  /**
   * Confirmed / suggested requirement counts per record, for list rows
   * (≤200 ids per call; see `RequirementCoverageService` for batching).
   */
  coverage(
    orgId: string,
    entityType: string,
    ids: readonly string[],
  ): Observable<RequirementCoverageResponse> {
    return this.api.get<RequirementCoverageResponse>(`${this.base(orgId)}/requirement-coverage`, {
      ...INLINE_ERRORS,
      params: { entity_type: entityType, ids: ids.join(',') },
    });
  }

  /**
   * "Foreslåtte krav" for one record: AI-ranked when AI is configured (a
   * `record_map` job runs at most once a day per record), else the
   * requirements this type of record usually evidences (virtual, `link_id: null`).
   */
  suggestRequirements(
    orgId: string,
    entityType: string,
    entityId: string,
  ): Observable<SuggestRequirementsResponse> {
    return this.api.post<SuggestRequirementsResponse>(
      `${this.base(orgId)}/requirement-links/suggest`,
      { entity_type: entityType, entity_id: entityId },
      { ...INLINE_ERRORS, params: { lang: this.lang() } },
    );
  }

  /** Confirm or reject many links and / or virtual suggestions at once (all or nothing). */
  bulkLinks(orgId: string, body: BulkLinksRequest): Observable<BulkLinksResponse> {
    return this.api.post<BulkLinksResponse>(
      `${this.base(orgId)}/requirement-links/bulk`,
      body,
      INLINE_ERRORS,
    );
  }

  /** One requirement's evidence from every module, what could evidence it, and its mappings. */
  requirementEvidence(orgId: string, ref: string): Observable<RequirementEvidence> {
    return this.api.get<RequirementEvidence>(
      `${this.base(orgId)}/standard-requirements/${requirementPath(ref)}/evidence`,
      { ...INLINE_ERRORS, params: { lang: this.lang() } },
    );
  }

  /** Uncovered applicable requirements of an enabled standard, with where to fix each one. */
  gaps(orgId: string, standardKey: string, query: GapsQuery = {}): Observable<GapsResponse> {
    return this.api.get<GapsResponse>(`${this.base(orgId)}/frameworks/gaps`, {
      ...INLINE_ERRORS,
      params: {
        standard_key: standardKey,
        chapter: query.chapter || undefined,
        limit: query.limit,
        offset: query.offset,
        lang: this.lang(),
      },
    });
  }

  /**
   * Clause search over the whole catalogue (ref, number or en / nb title), for
   * the clause picker. `frameworks` narrows to framework keys (`iso27001`, `gdpr`).
   */
  searchCatalogue(
    orgId: string,
    q: string,
    options: { readonly frameworks?: readonly string[]; readonly limit?: number } = {},
  ): Observable<CatalogueClause[]> {
    return this.api.get<CatalogueClause[]>(`${this.base(orgId)}/requirement-catalogue`, {
      ...INLINE_ERRORS,
      params: {
        q,
        frameworks: options.frameworks?.length ? options.frameworks.join(',') : undefined,
        limit: options.limit,
        lang: this.lang(),
      },
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

  // --- Frameworks, cross-mapping, readiness ----------------------------------
  // Optional surfaces: the pages fall back quietly when these fail, so no toast.

  /** Every framework of the catalogue (enabled or not) with its readiness score. */
  listFrameworks(orgId: string): Observable<FrameworkSummary[]> {
    return this.api.get<FrameworkSummary[]>(`${this.base(orgId)}/frameworks`, INLINE_ERRORS);
  }

  /** Readiness breakdown of every enabled standard. */
  readiness(orgId: string): Observable<FrameworkReadiness[]> {
    return this.api.get<FrameworkReadiness[]>(
      `${this.base(orgId)}/frameworks/readiness`,
      INLINE_ERRORS,
    );
  }

  /** Clauses of other frameworks this clause maps to ("Also satisfies"). */
  clauseMappings(orgId: string, key: string, number: string): Observable<ClauseMappingItem[]> {
    return this.api.get<ClauseMappingItem[]>(
      `${this.base(orgId)}/standards/${encodeURIComponent(key)}/clauses/${encodeURIComponent(number)}/mappings`,
      INLINE_ERRORS,
    );
  }

  /** Which modules' records can evidence a clause (`hs:6.1`, `iso27001:A.5.9`, `<standard key>:<number>`). */
  clauseSupport(orgId: string, ref: string): Observable<ClauseSupport> {
    return this.api.get<ClauseSupport>(`${this.base(orgId)}/clause-support`, {
      ...INLINE_ERRORS,
      params: { ref },
    });
  }

  /** Requirements of the org's enabled standards that a record could evidence. */
  evidenceSuggestions(
    orgId: string,
    entityType: string,
    entityId: string,
  ): Observable<EvidenceSuggestions> {
    return this.api.get<EvidenceSuggestions>(`${this.base(orgId)}/evidence-suggestions`, {
      ...INLINE_ERRORS,
      params: { entity_type: entityType, entity_id: entityId },
    });
  }

  // --- A03: bulk evidence actions and export ----------------------------------

  /** One record as confirmed evidence for every requirement of a clause, minus opt-outs. */
  linkClause(
    orgId: string,
    key: string,
    number: string,
    body: ClauseLinkRequest,
  ): Observable<ClauseLinkResponse> {
    return this.api.post<ClauseLinkResponse>(
      `${this.base(orgId)}/standards/${encodeURIComponent(key)}/clauses/${encodeURIComponent(number)}/links`,
      body,
      INLINE_ERRORS,
    );
  }

  /** Suggest the confirmed evidence of a mapped clause (another standard) on this clause. */
  reuseEvidence(
    orgId: string,
    key: string,
    number: string,
    from: { readonly standardKey: string; readonly number: string },
  ): Observable<ReuseEvidenceResponse> {
    return this.api.post<ReuseEvidenceResponse>(
      `${this.base(orgId)}/standards/${encodeURIComponent(key)}/clauses/${encodeURIComponent(number)}/reuse-evidence`,
      { from_standard_key: from.standardKey, from_number: from.number },
      INLINE_ERRORS,
    );
  }

  /**
   * Suggested evidence links from the org's existing records (keyword ranking, no
   * AI): every declared record type, or one. Suggestions never count until confirmed.
   */
  suggestFromRecords(
    orgId: string,
    key: string,
    entityType?: string | null,
  ): Observable<SuggestFromRecordsResponse> {
    return this.api.post<SuggestFromRecordsResponse>(
      `${this.base(orgId)}/standards/${encodeURIComponent(key)}/suggest-from-records`,
      { entity_type: entityType ?? null },
      INLINE_ERRORS,
    );
  }

  /** The compliance matrix of a standard as a file (labels in the UI language). */
  exportMatrix(orgId: string, key: string, format: ExportFormat): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/standards/${encodeURIComponent(key)}/export`, {
      ...INLINE_ERRORS,
      params: { format, lang: this.lang() },
    });
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
