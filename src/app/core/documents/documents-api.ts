import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import {
  AccessGrant,
  AccessGrantInput,
  AccessSubjects,
  Comment,
  CommentStatus,
  CreateCommentRequest,
  CreateDocumentRequest,
  DocumentAccess,
  DocumentDetail,
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

  /** Save edited document body as a new revision. The content is sanitized HTML. */
  addRevision(
    orgId: string,
    documentId: string,
    contentHtml: string,
  ): Observable<DocumentRevision> {
    return this.api.post<DocumentRevision>(`v1/orgs/${orgId}/documents/${documentId}/revisions`, {
      content_html: contentHtml,
    });
  }

  /** Fetch a document export (PDF or Word) as raw file bytes. */
  export(orgId: string, documentId: string, format: ExportFormat): Observable<Blob> {
    return this.api.getBlob(`v1/orgs/${orgId}/documents/${documentId}/export`, {
      params: { format },
    });
  }

  approve(orgId: string, documentId: string): Observable<DocumentDetail> {
    return this.api.post<DocumentDetail>(`v1/orgs/${orgId}/documents/${documentId}/approve`, null);
  }

  obsolete(orgId: string, documentId: string): Observable<DocumentDetail> {
    return this.api.post<DocumentDetail>(`v1/orgs/${orgId}/documents/${documentId}/obsolete`, null);
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
