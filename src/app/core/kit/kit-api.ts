import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { EntityRefDto, EntityTypeList } from '../entities/entity.models';
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
