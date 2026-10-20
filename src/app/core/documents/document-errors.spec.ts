import { HttpErrorResponse } from '@angular/common/http';
import { documentErrorKey, errorCodeOf } from './document-errors';

function httpError(status: number, error: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({ status, error });
}

describe('errorCodeOf', () => {
  it('reads the {detail: {code}} envelope', () => {
    expect(errorCodeOf(httpError(409, { detail: { code: 'self_approval', message: 'x' } }))).toBe(
      'self_approval',
    );
  });

  it('reads a top-level code or a bare snake_case detail', () => {
    expect(errorCodeOf(httpError(409, { code: 'not_in_review' }))).toBe('not_in_review');
    expect(errorCodeOf(httpError(409, { detail: 'not_in_review' }))).toBe('not_in_review');
  });

  it('ignores prose details and non-HTTP errors', () => {
    expect(errorCodeOf(httpError(409, { detail: 'Document is not in review' }))).toBeNull();
    expect(errorCodeOf(new Error('boom'))).toBeNull();
  });
});

describe('documentErrorKey', () => {
  it('explains self-approval and not-in-review conflicts on approve', () => {
    expect(documentErrorKey(httpError(409, { detail: { code: 'self_approval' } }), 'approve')).toBe(
      'documents.workflow.errors.selfApproval',
    );
    expect(documentErrorKey(httpError(409, { detail: { code: 'not_in_review' } }), 'approve')).toBe(
      'documents.workflow.errors.notInReview',
    );
    // A 409 without a code on approve still means it moved out of review.
    expect(documentErrorKey(httpError(409), 'approve')).toBe(
      'documents.workflow.errors.notInReview',
    );
  });

  it('uses a generic conflict message for other actions', () => {
    expect(documentErrorKey(httpError(409), 'submit')).toBe('documents.workflow.errors.conflict');
  });

  it('asks for a change reason on a 422 revision save', () => {
    expect(documentErrorKey(httpError(422), 'saveRevision')).toBe(
      'documents.workflow.errors.changeReasonRequired',
    );
  });

  it('falls back to neutral messages', () => {
    expect(documentErrorKey(httpError(0), 'approve')).toBe('errors.network');
    expect(documentErrorKey(httpError(503), 'approve')).toBe('errors.server');
    expect(documentErrorKey(httpError(403), 'obsolete')).toBe(
      'documents.workflow.errors.forbidden',
    );
    expect(documentErrorKey(httpError(400), 'obsolete')).toBe('errors.generic');
    expect(documentErrorKey(new Error('x'), 'obsolete')).toBe('errors.generic');
  });
});
