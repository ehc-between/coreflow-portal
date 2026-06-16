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
  readonly current_rev: number | null;
  readonly updated_at: string;
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
  readonly rev: number;
  /** The revision body as sanitized HTML. */
  readonly content?: string;
  readonly status: string;
  readonly author_user_id: string;
  readonly approved_by_user_id?: string | null;
  readonly approved_at?: string | null;
  readonly created_at: string;
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
  readonly current_revision: DocumentRevision | null;
  readonly revisions: readonly DocumentRevision[];
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
