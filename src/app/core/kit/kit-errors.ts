import { HttpErrorResponse } from '@angular/common/http';
import { errorCodeOf } from '../documents/document-errors';

/** Backend error codes the record kit explains with a specific message. */
const KNOWN_CODES = new Set([
  'unsupported_entity_type',
  'module_disabled',
  'invalid_link_type',
  'self_link',
  'not_linkable',
  'link_exists',
  'link_not_found',
  'comment_empty',
  'comment_too_long',
  'invalid_parent',
  'invalid_mentions',
  'mention_no_access',
  'not_commentable',
  'not_comment_author',
  'comment_not_found',
  'revision_not_found',
  'revision_mismatch',
]);

/**
 * The `kit` scope i18n key (without the scope prefix) explaining a failed
 * record-kit request: a code-specific message where the backend sent a known
 * code, else a message for the HTTP status.
 */
export function kitErrorKey(error: unknown): string {
  const code = errorCodeOf(error);
  if (code && KNOWN_CODES.has(code)) {
    return `kit.errors.${code}`;
  }
  const status = error instanceof HttpErrorResponse ? error.status : -1;
  if (status === 0) {
    return 'kit.errors.network';
  }
  if (status === 403) {
    return 'kit.errors.forbidden';
  }
  if (status === 404) {
    return 'kit.errors.notFound';
  }
  return 'kit.errors.generic';
}
