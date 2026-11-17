import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { EntityRefDto, EntityTypeList } from '../entities/entity.models';
import {
  CompleteFlowRequest,
  CompleteFlowResponse,
  ConnectionCountMap,
  ConnectionGraph,
  ConnectionsResponse,
  CreateFlowList,
  PrefillResponse,
  SuggestionDecision,
} from './connections.models';
import {
  CommentItem,
  CommentList,
  CreateCommentRequest,
  CreateLinkRequest,
  LinkItem,
  LinkList,
  MentionCandidate,
  RevisionCompare,
  RevisionDetail,
  RevisionList,
  SearchResponse,
  TimelinePage,
  UpdateCommentRequest,
} from './kit.models';

/**
 * Kit components show failures in place (with a translated, code-specific
 * message), so the generic error toast is suppressed. 5xx/network failures are
 * still reported to monitoring by the error interceptor.
 */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** Options for {@link KitApi.timeline}. */
export interface TimelineQuery {
  readonly limit?: number;
  /** Cursor from the previous page's `next_before`. */
  readonly before?: string | null;
  /** Also include audit-log rows (needs `audit:read`). */
  readonly includeAudit?: boolean;
}

/** Options for {@link KitApi.search}. */
export interface SearchQuery {
  readonly types?: readonly string[];
  readonly limit?: number;
}

/**
 * The shared record kit API (coreflow-core#45): entity references, typed links,
 * comments with @mentions and revision history on any record, plus the F3
 * activity timeline and the F5 global search the kit components build on.
 * Every call is org-scoped; record-level authorization happens server-side
 * through the record type's own read / write permissions.
 */
@Injectable({ providedIn: 'root' })
export class KitApi {
  private readonly api = inject(ApiService);

  // --- entities -----------------------------------------------------------------

  /** Every registered entity type with its kit capabilities, plus the link types. */
  entityTypes(orgId: string): Observable<EntityTypeList> {
    return this.api.get<EntityTypeList>(`v1/orgs/${orgId}/entity-types`, IN_PLACE);
  }

  /** Resolve one record the caller may read. */
  entity(orgId: string, entityType: string, entityId: string): Observable<EntityRefDto> {
    return this.api.get<EntityRefDto>(
      `v1/orgs/${orgId}/entities/${encodeURIComponent(entityType)}/${entityId}`,
      IN_PLACE,
    );
  }

  // --- links ----------------------------------------------------------------------

  /** Live links of a record in both directions, newest first. */
  links(
    orgId: string,
    entityType: string,
    entityId: string,
    linkTypes?: readonly string[],
  ): Observable<LinkList> {
    return this.api.get<LinkList>(`v1/orgs/${orgId}/links`, {
      ...IN_PLACE,
      params: {
        entity_type: entityType,
        entity_id: entityId,
        link_type: linkTypes && linkTypes.length > 0 ? linkTypes : null,
      },
    });
  }

  createLink(orgId: string, body: CreateLinkRequest): Observable<LinkItem> {
    return this.api.post<LinkItem>(`v1/orgs/${orgId}/links`, body, IN_PLACE);
  }

  deleteLink(orgId: string, linkId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/links/${linkId}`, IN_PLACE);
  }

  // --- connections (P4) -------------------------------------------------------------

  /** Everything a record is connected to: links, field relations, tasks, suggestions. */
  connections(
    orgId: string,
    entityType: string,
    entityId: string,
  ): Observable<ConnectionsResponse> {
    return this.api.get<ConnectionsResponse>(`v1/orgs/${orgId}/connections`, {
      ...IN_PLACE,
      params: { entity_type: entityType, entity_id: entityId },
    });
  }

  /** The connection map of a record (records, requirements, people, tasks; at most 60 nodes). */
  connectionGraph(
    orgId: string,
    entityType: string,
    entityId: string,
    depth: 1 | 2,
    lang: string,
  ): Observable<ConnectionGraph> {
    return this.api.get<ConnectionGraph>(`v1/orgs/${orgId}/connections/graph`, {
      ...IN_PLACE,
      params: {
        entity_type: entityType,
        entity_id: entityId,
        depth,
        lang: lang === 'nb' ? 'nb' : 'en',
      },
    });
  }

  /** Connection counts for list rows (at most 200 ids per call). */
  connectionCounts(
    orgId: string,
    entityType: string,
    ids: readonly string[],
  ): Observable<ConnectionCountMap> {
    return this.api.get<ConnectionCountMap>(`v1/orgs/${orgId}/connections/counts`, {
      ...IN_PLACE,
      params: { entity_type: entityType, ids: ids.join(',') },
    });
  }

  acceptSuggestion(orgId: string, suggestionId: string): Observable<SuggestionDecision> {
    return this.api.post<SuggestionDecision>(
      `v1/orgs/${orgId}/link-suggestions/${suggestionId}/accept`,
      {},
      IN_PLACE,
    );
  }

  dismissSuggestion(orgId: string, suggestionId: string): Observable<SuggestionDecision> {
    return this.api.post<SuggestionDecision>(
      `v1/orgs/${orgId}/link-suggestions/${suggestionId}/dismiss`,
      {},
      IN_PLACE,
    );
  }

  // --- create from here (P4) --------------------------------------------------------

  /**
   * The flows the caller can start from a record. For a requirement pass
   * `entityType = 'standard_requirement'` and its `ref` (or its id).
   */
  createFlows(
    orgId: string,
    entityType: string,
    source: { readonly entityId?: string | null; readonly ref?: string | null },
  ): Observable<CreateFlowList> {
    return this.api.get<CreateFlowList>(`v1/orgs/${orgId}/create-flows`, {
      ...IN_PLACE,
      params: {
        entity_type: entityType,
        entity_id: source.entityId ?? null,
        ref: source.ref ?? null,
      },
    });
  }

  /** Form values for the new record plus the signed flow token. */
  prefillFlow(
    orgId: string,
    key: string,
    source: { readonly sourceId?: string | null; readonly sourceRef?: string | null },
  ): Observable<PrefillResponse> {
    return this.api.post<PrefillResponse>(
      `v1/orgs/${orgId}/create-flows/${encodeURIComponent(key)}/prefill`,
      { source_id: source.sourceId ?? null, source_ref: source.sourceRef ?? null },
      IN_PLACE,
    );
  }

  /** Link a just-created record back to the record (or requirement) it was created from. */
  completeFlow(orgId: string, body: CompleteFlowRequest): Observable<CompleteFlowResponse> {
    return this.api.post<CompleteFlowResponse>(
      `v1/orgs/${orgId}/create-flows/complete`,
      body,
      IN_PLACE,
    );
  }

  // --- comments -------------------------------------------------------------------

  /** Live comments on a record, oldest first. */
  comments(orgId: string, entityType: string, entityId: string): Observable<CommentList> {
    return this.api.get<CommentList>(`v1/orgs/${orgId}/comments`, {
      ...IN_PLACE,
      params: { entity_type: entityType, entity_id: entityId },
    });
  }

  createComment(orgId: string, body: CreateCommentRequest): Observable<CommentItem> {
    return this.api.post<CommentItem>(`v1/orgs/${orgId}/comments`, body, IN_PLACE);
  }

  updateComment(
    orgId: string,
    commentId: string,
    body: UpdateCommentRequest,
  ): Observable<CommentItem> {
    return this.api.patch<CommentItem>(`v1/orgs/${orgId}/comments/${commentId}`, body, IN_PLACE);
  }

  deleteComment(orgId: string, commentId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/comments/${commentId}`, IN_PLACE);
  }

  /**
   * Org users who can be @mentioned. Reuses the org's access-subject directory
   * (users only); the backend rejects mentions of users without read access.
   */
  mentionCandidates(orgId: string): Observable<MentionCandidate[]> {
    return this.api
      .get<{
        users: readonly { id: string; name: string; email?: string }[];
      }>(`v1/orgs/${orgId}/access-subjects`, IN_PLACE)
      .pipe(map((res) => res.users.map((u) => ({ id: u.id, name: u.name, email: u.email }))));
  }

  // --- revisions ------------------------------------------------------------------

  /** Revisions of a record, newest first. */
  revisions(orgId: string, entityType: string, entityId: string): Observable<RevisionList> {
    return this.api.get<RevisionList>(`v1/orgs/${orgId}/revisions`, {
      ...IN_PLACE,
      params: { entity_type: entityType, entity_id: entityId },
    });
  }

  revision(orgId: string, revisionId: string): Observable<RevisionDetail> {
    return this.api.get<RevisionDetail>(`v1/orgs/${orgId}/revisions/${revisionId}`, IN_PLACE);
  }

  compareRevisions(orgId: string, fromId: string, toId: string): Observable<RevisionCompare> {
    return this.api.get<RevisionCompare>(`v1/orgs/${orgId}/revisions/compare`, {
      ...IN_PLACE,
      params: { from_id: fromId, to_id: toId },
    });
  }

  // --- timeline (F3) and search (F5) ------------------------------------------------

  /** One page of a record's activity, newest first. */
  timeline(
    orgId: string,
    entityType: string,
    entityId: string,
    query: TimelineQuery = {},
  ): Observable<TimelinePage> {
    return this.api.get<TimelinePage>(`v1/orgs/${orgId}/timeline`, {
      ...IN_PLACE,
      params: {
        entity_type: entityType,
        entity_id: entityId,
        limit: query.limit ?? 50,
        before: query.before ?? null,
        include_audit: query.includeAudit ? true : null,
      },
    });
  }

  /** Global search over every record the caller may read. */
  search(orgId: string, q: string, query: SearchQuery = {}): Observable<SearchResponse> {
    return this.api.get<SearchResponse>(`v1/orgs/${orgId}/search`, {
      ...IN_PLACE,
      params: {
        q,
        types: query.types && query.types.length > 0 ? query.types.join(',') : null,
        limit: query.limit ?? 20,
      },
    });
  }
}
