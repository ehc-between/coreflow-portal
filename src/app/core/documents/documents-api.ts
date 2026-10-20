import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { reviewState } from './review-state';
import {
  AccessGrant,
  AccessGrantInput,
  AccessSubjects,
  AcknowledgementEntry,
  Comment,
  CommentStatus,
  CreateCommentRequest,
  CreateDocumentRequest,
  DocumentAccess,
  DocumentAcknowledgements,
  DocumentControlUpdate,
  DocumentDetail,
  DocumentListQuery,
  DocumentPage,
  DocumentRevision,
  DocumentSearchResult,
  DocumentStatus,
  DocumentSummary,
  DocumentVisibility,
  ExportFormat,
  Proposal,
  ProposalApproveResult,
  ProposalDetail,
  ProposalEdit,
  UpdateCommentRequest,
} from './document.models';

/**
 * Document-control mutations surface their own specific messages (see
 * `documentErrorKey`), so they opt out of the interceptor's generic toast.
 */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/**
 * Org-scoped Documents + Proposals API. Goes through ApiService, so requests
 * carry the in-memory bearer token (attached by the auth interceptor) and the
 * configured base URL. Callers pass the current org id and gate actions on the
 * relevant `documents:*` permission for that org.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly api = inject(ApiService);

  list(
    orgId: string,
    filters: { status?: DocumentStatus; type?: string } = {},
  ): Observable<DocumentSummary[]> {
    return this.api.get<DocumentSummary[]>(`v1/orgs/${orgId}/documents`, {
      params: { status: filters.status, type: filters.type },
    });
  }

  /**
   * One page of the documents list plus the total. The endpoint returns the
   * whole (unpaged) list, so the review-due filter and paging are applied here.
   */
  listPage(orgId: string, query: DocumentListQuery = {}): Observable<DocumentPage> {
    return this.list(orgId, { status: query.status, type: query.type }).pipe(
      map((documents) => toDocumentPage(documents, query)),
    );
  }

  search(orgId: string, q: string, limit = 20): Observable<DocumentSearchResult[]> {
    return this.api.get<DocumentSearchResult[]>(`v1/orgs/${orgId}/documents/search`, {
      params: { q, limit },
    });
  }

  get(orgId: string, documentId: string): Observable<DocumentDetail> {
    return this.api.get<DocumentDetail>(`v1/orgs/${orgId}/documents/${documentId}`);
  }

  /** Fetch a single historical revision, including its content, for read-only viewing. */
  getRevision(orgId: string, documentId: string, revisionId: string): Observable<DocumentRevision> {
    return this.api.get<DocumentRevision>(
      `v1/orgs/${orgId}/documents/${documentId}/revisions/${revisionId}`,
    );
  }

  create(orgId: string, body: CreateDocumentRequest): Observable<DocumentDetail> {
    return this.api.post<DocumentDetail>(`v1/orgs/${orgId}/documents`, body);
  }

  /**
   * Save edited document body as a new draft revision. The content is sanitized
   * HTML; `changeReason` is required by the backend once an approved revision
   * exists. Responds with the updated document (the new revision is its draft).
   */
  addRevision(
    orgId: string,
    documentId: string,
    contentHtml: string,
    changeReason?: string,
  ): Observable<DocumentDetail> {
    const body: { content_html: string; change_reason?: string } = { content_html: contentHtml };
    const reason = changeReason?.trim();
    if (reason) {
      body.change_reason = reason;
    }
    return this.api.post<DocumentDetail>(
      `v1/orgs/${orgId}/documents/${documentId}/revisions`,
      body,
      IN_PLACE,
    );
  }

  /** Fetch a document export (PDF or Word) as raw file bytes. */
  export(orgId: string, documentId: string, format: ExportFormat): Observable<Blob> {
    return this.api.getBlob(`v1/orgs/${orgId}/documents/${documentId}/export`, {
      params: { format },
    });
  }

  /** Submit the working draft for review (draft → in_review; `documents:draft`). */
  submit(orgId: string, documentId: string): Observable<DocumentDetail> {
    return this.workflow(orgId, documentId, 'submit', null);
  }

  /** Send an in-review document back to draft with a reviewer comment (`documents:approve`). */
  requestChanges(orgId: string, documentId: string, comment: string): Observable<DocumentDetail> {
    return this.workflow(orgId, documentId, 'request-changes', { comment });
  }

  /**
   * Approve the in-review revision (`documents:approve`). 409 with code
   * `self_approval` (approver authored it) or `not_in_review`.
   */
  approve(orgId: string, documentId: string): Observable<DocumentDetail> {
    return this.workflow(orgId, documentId, 'approve', null);
  }

  /** Retire a document with a recorded reason (`documents:approve`). */
  obsolete(orgId: string, documentId: string, reason: string): Observable<DocumentDetail> {
    return this.workflow(orgId, documentId, 'obsolete', { reason });
  }

  /** Record that the caller has read and understood the current approved revision. */
  acknowledge(orgId: string, documentId: string): Observable<DocumentDetail> {
    return this.workflow(orgId, documentId, 'acknowledge', null);
  }

  /** Update periodic review / acknowledgement settings (owner or `documents:approve`). */
  updateControl(
    orgId: string,
    documentId: string,
    body: DocumentControlUpdate,
  ): Observable<DocumentDetail> {
    return this.api.patch<DocumentDetail>(
      `v1/orgs/${orgId}/documents/${documentId}`,
      body,
      IN_PLACE,
    );
  }

  /** Who has / hasn't acknowledged the current approved revision (owners + approvers). */
  listAcknowledgements(orgId: string, documentId: string): Observable<DocumentAcknowledgements> {
    return this.api
      .get<AcknowledgementsResponse>(`v1/orgs/${orgId}/documents/${documentId}/acknowledgements`)
      .pipe(map(toAcknowledgements));
  }

  /** POST a document-control transition; errors are shown in place by the caller. */
  private workflow(
    orgId: string,
    documentId: string,
    action: string,
    body: unknown,
  ): Observable<DocumentDetail> {
    return this.api.post<DocumentDetail>(
      `v1/orgs/${orgId}/documents/${documentId}/${action}`,
      body,
      IN_PLACE,
    );
  }

  /** Anchored comments on a document, optionally filtered by revision and status. */
  listComments(
    orgId: string,
    documentId: string,
    filters: { revisionId?: string; status?: CommentStatus } = {},
  ): Observable<Comment[]> {
    return this.api.get<Comment[]>(`v1/orgs/${orgId}/documents/${documentId}/comments`, {
      params: { revision_id: filters.revisionId, status: filters.status },
    });
  }

  /** Create a comment anchored to part of a revision (view access). */
  createComment(
    orgId: string,
    documentId: string,
    body: CreateCommentRequest,
  ): Observable<Comment> {
    return this.api.post<Comment>(`v1/orgs/${orgId}/documents/${documentId}/comments`, body);
  }

  /** Generate (and store) an AI change proposal for a comment (edit access). */
  suggestComment(orgId: string, documentId: string, commentId: string): Observable<Comment> {
    return this.api.post<Comment>(
      `v1/orgs/${orgId}/documents/${documentId}/comments/${commentId}/suggest`,
      null,
    );
  }

  /** Edit a comment's body and/or its stored AI suggestion. */
  updateComment(
    orgId: string,
    documentId: string,
    commentId: string,
    body: UpdateCommentRequest,
  ): Observable<Comment> {
    return this.api.patch<Comment>(
      `v1/orgs/${orgId}/documents/${documentId}/comments/${commentId}`,
      body,
    );
  }

  /** Resolve a comment, optionally recording the revision the fix was applied as. */
  resolveComment(
    orgId: string,
    documentId: string,
    commentId: string,
    appliedRevisionId?: string,
  ): Observable<Comment> {
    return this.api.post<Comment>(
      `v1/orgs/${orgId}/documents/${documentId}/comments/${commentId}/resolve`,
      { applied_revision_id: appliedRevisionId },
    );
  }

  /** Stage a comment's AI proposal for the next revision without applying it (edit access). */
  acceptComment(orgId: string, documentId: string, commentId: string): Observable<Comment> {
    return this.api.post<Comment>(
      `v1/orgs/${orgId}/documents/${documentId}/comments/${commentId}/accept`,
      null,
    );
  }

  /** Move an accepted or rejected comment back to open (edit access). */
  reopenComment(orgId: string, documentId: string, commentId: string): Observable<Comment> {
    return this.api.post<Comment>(
      `v1/orgs/${orgId}/documents/${documentId}/comments/${commentId}/reopen`,
      null,
    );
  }

  /** Reject a comment's AI proposal (edit access). */
  rejectComment(orgId: string, documentId: string, commentId: string): Observable<Comment> {
    return this.api.post<Comment>(
      `v1/orgs/${orgId}/documents/${documentId}/comments/${commentId}/reject`,
      null,
    );
  }

  /** Delete a comment (author or manager). */
  deleteComment(orgId: string, documentId: string, commentId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/documents/${documentId}/comments/${commentId}`);
  }

  listProposals(orgId: string): Observable<Proposal[]> {
    return this.api.get<Proposal[]>(`v1/orgs/${orgId}/proposals`, {
      params: { status: 'pending' },
    });
  }

  getProposal(orgId: string, proposalId: string): Observable<ProposalDetail> {
    return this.api.get<ProposalDetail>(`v1/orgs/${orgId}/proposals/${proposalId}`);
  }

  /** Persist edits to a pending proposal's draft (all fields optional). */
  updateProposal(
    orgId: string,
    proposalId: string,
    body: ProposalEdit,
  ): Observable<ProposalDetail> {
    return this.api.patch<ProposalDetail>(`v1/orgs/${orgId}/proposals/${proposalId}`, body);
  }

  /** Approve a proposal, optionally publishing edited content over the draft. */
  approveProposal(
    orgId: string,
    proposalId: string,
    body?: ProposalEdit,
  ): Observable<ProposalApproveResult> {
    return this.api.post<ProposalApproveResult>(
      `v1/orgs/${orgId}/proposals/${proposalId}/approve`,
      body ?? null,
    );
  }

  rejectProposal(orgId: string, proposalId: string): Observable<{ ok: boolean }> {
    return this.api.post<{ ok: boolean }>(`v1/orgs/${orgId}/proposals/${proposalId}/reject`, null);
  }

  /** Subjects (org users + departments) assignable as document access grants. */
  listAccessSubjects(orgId: string): Observable<AccessSubjects> {
    return this.api.get<AccessSubjects>(`v1/orgs/${orgId}/access-subjects`);
  }

  /** Current owner, visibility and grants for a document. */
  getAccess(orgId: string, documentId: string): Observable<DocumentAccess> {
    return this.api.get<DocumentAccess>(`v1/orgs/${orgId}/documents/${documentId}/access`);
  }

  /** Update a document's owner and/or visibility (manage: owner or documents:approve). */
  setAccess(
    orgId: string,
    documentId: string,
    body: { owner_user_id?: string; visibility?: DocumentVisibility },
  ): Observable<DocumentDetail> {
    return this.api.patch<DocumentDetail>(`v1/orgs/${orgId}/documents/${documentId}`, body);
  }

  /** Add (upsert per subject) an access grant on a document. */
  addGrant(orgId: string, documentId: string, body: AccessGrantInput): Observable<AccessGrant> {
    return this.api.post<AccessGrant>(
      `v1/orgs/${orgId}/documents/${documentId}/access/grants`,
      body,
    );
  }

  /** Remove an access grant from a document by grant id. */
  removeGrant(orgId: string, documentId: string, grantId: string): Observable<void> {
    return this.api.delete<void>(
      `v1/orgs/${orgId}/documents/${documentId}/access/grants/${grantId}`,
    );
  }
}

/**
 * One page of the full (unpaged) documents list: filtered to review-due
 * documents when asked, then sliced to `offset`/`limit`, with the filtered
 * length as the total.
 */
export function toDocumentPage(
  documents: readonly DocumentSummary[],
  query: DocumentListQuery = {},
): DocumentPage {
  const rows = query.review_due ? documents.filter((doc) => reviewState(doc) !== null) : documents;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? rows.length;
  return { items: rows.slice(offset, offset + limit), total: rows.length };
}

/** Raw acknowledgement person: the display name may arrive under a few keys. */
interface RawAcknowledgementEntry {
  readonly user_id: string;
  readonly name?: string | null;
  readonly user_name?: string | null;
  readonly full_name?: string | null;
  readonly email?: string | null;
  readonly acknowledged_at?: string | null;
}

interface AcknowledgementsResponse {
  readonly revision?: string | null;
  readonly acknowledged?: readonly RawAcknowledgementEntry[];
  readonly pending?: readonly RawAcknowledgementEntry[];
  readonly not_acknowledged?: readonly RawAcknowledgementEntry[];
}

function toEntry(raw: RawAcknowledgementEntry): AcknowledgementEntry {
  return {
    user_id: raw.user_id,
    name: raw.name || raw.full_name || raw.user_name || raw.email || raw.user_id,
    email: raw.email ?? null,
    acknowledged_at: raw.acknowledged_at ?? null,
  };
}

/** Normalise the acknowledgement report (acknowledged + not-yet lists). */
export function toAcknowledgements(response: AcknowledgementsResponse): DocumentAcknowledgements {
  return {
    revision: response.revision ?? null,
    acknowledged: (response.acknowledged ?? []).map(toEntry),
    pending: (response.pending ?? response.not_acknowledged ?? []).map(toEntry),
  };
}
