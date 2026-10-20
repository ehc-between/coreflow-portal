/** Document lifecycle status as returned by the backend. */
export type DocumentStatus = 'draft' | 'in_review' | 'approved' | 'obsolete';

/** A row in the documents list. */
export interface DocumentSummary {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly doc_code: string;
  readonly status: DocumentStatus;
  readonly owner_user_id: string;
  readonly current_rev: string | number | null;
  readonly updated_at: string;
  /** When the next periodic review is due (ISO date); null when no interval is set. */
  readonly next_review_at?: string | null;
  /** True once `next_review_at` has passed. */
  readonly review_overdue?: boolean;
}

/** A page of the documents list plus the unpaged total. */
export interface DocumentPage {
  readonly items: readonly DocumentSummary[];
  /** Unpaged total; null when the backend did not report one. */
  readonly total: number | null;
}

/** Filters + paging for the documents list. */
export interface DocumentListQuery {
  readonly status?: DocumentStatus;
  readonly type?: string;
  /** Only documents whose periodic review is due soon or overdue. */
  readonly review_due?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

/** A hit from the document search endpoint. */
export interface DocumentSearchResult {
  readonly id: string;
  readonly title: string;
  readonly doc_code: string;
  readonly status: DocumentStatus;
  readonly type: string;
  readonly snippet: string;
}

/** A document export format. */
export type ExportFormat = 'pdf' | 'docx';

/** A single revision of a document. */
export interface DocumentRevision {
  readonly id: string;
  /** Revision label (A, B, … Z, AA, …). */
  readonly rev: string | number;
  /** The revision body as sanitized HTML. */
  readonly content?: string;
  readonly status: string;
  readonly author_user_id: string;
  readonly approved_by_user_id?: string | null;
  readonly approved_at?: string | null;
  /** Why this revision was made; required once an approved revision exists. */
  readonly change_reason?: string | null;
  readonly created_at: string;
}

/** The caller's read-and-understood state for the current approved revision. */
export interface DocumentAcknowledgementState {
  /** Whether readers must acknowledge the approved revision. */
  readonly required: boolean;
  /** When the caller acknowledged the current approved revision, else null. */
  readonly acknowledged_at: string | null;
}

/** The open "request changes" that sent a document back to draft. */
export interface PendingChangeRequest {
  readonly comment: string;
  /** Display name of the reviewer who asked for changes. */
  readonly by_name: string | null;
  readonly at: string;
}

/** Document-control settings editable via `PATCH documents/{id}` (all optional). */
export interface DocumentControlUpdate {
  readonly review_interval_months?: number | null;
  readonly next_review_at?: string | null;
  readonly acknowledgement_required?: boolean;
}

/** One person in the acknowledgement report. */
export interface AcknowledgementEntry {
  readonly user_id: string;
  readonly name: string;
  readonly email?: string | null;
  readonly acknowledged_at?: string | null;
}

/** Who has (and hasn't yet) read and understood the current approved revision. */
export interface DocumentAcknowledgements {
  /** The approved revision label the lists refer to; null if never approved. */
  readonly revision: string | null;
  readonly acknowledged: readonly AcknowledgementEntry[];
  readonly pending: readonly AcknowledgementEntry[];
}

/** Full document detail, including the current revision and revision history. */
export interface DocumentDetail {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly doc_code: string;
  readonly status: DocumentStatus;
  readonly owner_user_id: string;
  readonly clause_ref?: string | null;
  /** The last approved revision — what readers see. Null until first approval. */
  readonly current_revision: DocumentRevision | null;
  readonly revisions: readonly DocumentRevision[];
  // Document control (review workflow, periodic review, acknowledgement).
  /** The working draft / in-review revision; only returned to drafters. */
  readonly draft_revision?: DocumentRevision | null;
  /** Periodic review interval in months; null when no periodic review is set. */
  readonly review_interval_months?: number | null;
  readonly next_review_at?: string | null;
  readonly review_overdue?: boolean;
  readonly acknowledgement?: DocumentAcknowledgementState;
  readonly pending_change_request?: PendingChangeRequest | null;
  /** Why the document was made obsolete (set with status `obsolete`). */
  readonly obsolete_reason?: string | null;
  /** Whether the caller may delete this document now (their rights and its state). */
  readonly can_delete?: boolean;
  /** Deleting needs a recorded reason (an obsolete document). */
  readonly delete_requires_reason?: boolean;
}

/** A soft-deleted document, as listed for org admins (`GET documents/deleted`). */
export interface DeletedDocument {
  readonly id: string;
  readonly title: string;
  readonly doc_code: string | null;
  readonly deleted_at: string;
  readonly deleted_by_name: string | null;
  readonly deleted_reason: string | null;
}

/** Who may see a document: open to the whole org, or restricted to named subjects. */
export type DocumentVisibility = 'organization' | 'restricted';

/** Whether an access grant is a single user or a whole department. */
export type AccessSubjectType = 'user' | 'department';

/** Access level a grant confers on its subject. */
export type AccessLevel = 'view' | 'edit';

/** A single access grant on a document (a user or department, at view/edit). */
export interface AccessGrant {
  readonly id: string;
  readonly subject_type: AccessSubjectType;
  readonly subject_id: string;
  readonly subject_name: string;
  readonly level: AccessLevel;
}

/** Full access state for a document: owner, visibility and explicit grants. */
export interface DocumentAccess {
  readonly visibility: DocumentVisibility;
  readonly owner_user_id: string;
  readonly owner_name: string;
  readonly grants: readonly AccessGrant[];
}

/** An assignable access subject (org user or department) for the pickers. */
export interface AccessSubject {
  readonly subject_type: AccessSubjectType;
  readonly id: string;
  readonly name: string;
  /** Present for users; absent for departments. */
  readonly email?: string;
}

/** The selectable subjects for the access pickers, split by kind. */
export interface AccessSubjects {
  readonly users: readonly { readonly id: string; readonly name: string; readonly email: string }[];
  readonly departments: readonly { readonly id: string; readonly name: string }[];
}

/** A locally-chosen grant (no id yet), submitted with create/approve. */
export interface AccessGrantInput {
  readonly subject_type: AccessSubjectType;
  readonly subject_id: string;
  readonly level: AccessLevel;
}

/** Body for creating a new document. */
export interface CreateDocumentRequest {
  readonly type: string;
  readonly title: string;
  readonly content: string;
  readonly doc_code?: string;
  readonly owner_user_id?: string;
  readonly visibility?: DocumentVisibility;
  readonly access?: readonly AccessGrantInput[];
}

/** Lifecycle of an anchored comment. */
export type CommentStatus = 'open' | 'accepted' | 'resolved' | 'rejected';

/**
 * An anchored comment on a document revision. The anchor locates the commented
 * span in the rendered body: `anchor_quote` is the selected text, `anchor_prefix`
 * the text immediately before it, and `anchor_start`/`anchor_end` are character
 * offsets into the revision's full `textContent`. Editors may attach an AI change
 * proposal (`suggestion_html` + `suggestion_rationale`).
 */
export interface Comment {
  readonly id: string;
  readonly document_id: string;
  readonly revision_id: string;
  readonly author_user_id: string;
  readonly author_name: string;
  readonly anchor_quote: string;
  readonly anchor_prefix: string;
  readonly anchor_start: number | null;
  readonly anchor_end: number | null;
  readonly body: string;
  readonly status: CommentStatus;
  readonly suggestion_html: string | null;
  readonly suggestion_rationale: string | null;
  readonly created_at: string;
}

/** Body for creating a comment anchored to part of the viewed revision. */
export interface CreateCommentRequest {
  readonly revision_id: string;
  readonly anchor_quote: string;
  readonly anchor_prefix?: string;
  readonly anchor_start?: number;
  readonly anchor_end?: number;
  readonly body: string;
}

/** Optional edits to a comment's body and/or its stored AI suggestion. */
export interface UpdateCommentRequest {
  readonly suggestion_html?: string;
  readonly body?: string;
}

/** A pending proposal in the review work-feed. */
export interface Proposal {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly status: string;
  readonly created_by_user_id: string;
  readonly created_at: string;
}

/** Full proposal detail, including the draft body, for the review editor. */
export interface ProposalDetail {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly type: string;
  readonly doc_code: string | null;
  readonly summary: string | null;
  readonly status: string;
  readonly content_html: string;
  readonly created_by_user_id: string;
  readonly created_at: string;
}

/** Optional overrides applied when updating or approving a proposal. */
export interface ProposalEdit {
  readonly content_html?: string;
  readonly title?: string;
  readonly type?: string;
  readonly doc_code?: string;
  readonly owner_user_id?: string;
  readonly visibility?: DocumentVisibility;
  readonly access?: readonly AccessGrantInput[];
}

/** Result of approving a proposal. */
export interface ProposalApproveResult {
  readonly ok: boolean;
  readonly document_id: string;
}
