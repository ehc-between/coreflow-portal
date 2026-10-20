import { HttpErrorResponse } from '@angular/common/http';

/** Which document-control action failed — the same status means different things per action. */
export type DocumentWorkflowAction =
  | 'submit'
  | 'requestChanges'
  | 'approve'
  | 'obsolete'
  | 'saveRevision'
  | 'acknowledge'
  | 'updateControl';

/**
 * The machine-readable error code in a backend error body. Accepts the
 * `{"detail": {"code": "..."}}` envelope, a top-level `code`, or a bare
 * snake_case `detail` string.
 */
export function errorCodeOf(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body: unknown = error.error;
  if (!body || typeof body !== 'object') {
    return null;
  }
  const record = body as { detail?: unknown; code?: unknown };
  if (typeof record.code === 'string') {
    return record.code;
  }
  const detail = record.detail;
  if (detail && typeof detail === 'object' && 'code' in detail) {
    const code = (detail as { code: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  if (typeof detail === 'string' && /^[a-z]+(_[a-z]+)*$/.test(detail)) {
    return detail;
  }
  return null;
}

/** Specific codes the document workflow endpoints return, mapped to messages. */
const CODE_KEYS: Readonly<Record<string, string>> = {
  self_approval: 'documents.workflow.errors.selfApproval',
  not_in_review: 'documents.workflow.errors.notInReview',
  not_draft: 'documents.workflow.errors.notDraft',
  change_reason_required: 'documents.workflow.errors.changeReasonRequired',
  obsolete: 'documents.workflow.errors.obsolete',
  no_approved_revision: 'documents.workflow.errors.noApprovedRevision',
};

/**
 * Maps a failed document-control request to a translated (i18n key) message.
 * Known backend codes win; otherwise the status decides, falling back to the
 * neutral network / server / generic messages. (These requests opt out of the
 * error interceptor's generic toast, so the caller shows this message instead.)
 */
export function documentErrorKey(error: unknown, action: DocumentWorkflowAction): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'errors.generic';
  }
  const code = errorCodeOf(error);
  if (code && CODE_KEYS[code]) {
    return CODE_KEYS[code];
  }
  const { status } = error;
  if (status === 0) {
    return 'errors.network';
  }
  if (status >= 500) {
    return 'errors.server';
  }
  if (status === 403) {
    return 'documents.workflow.errors.forbidden';
  }
  if (status === 409) {
    // A conflict without a known code: the document moved on under us.
    return action === 'approve'
      ? 'documents.workflow.errors.notInReview'
      : 'documents.workflow.errors.conflict';
  }
  if (status === 422 && action === 'saveRevision') {
    return 'documents.workflow.errors.changeReasonRequired';
  }
  return 'errors.generic';
}
