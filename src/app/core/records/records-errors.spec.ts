import { HttpErrorResponse } from '@angular/common/http';
import {
  definitionIssues,
  fieldIssues,
  guardLabelKey,
  issueKey,
  recordsErrorDetail,
  recordsErrorMessage,
} from './records-errors';

const err = (status: number, detail: unknown) =>
  new HttpErrorResponse({ status, error: detail === undefined ? null : { detail } });

describe('records errors', () => {
  it('parses the code and the extra keys', () => {
    expect(recordsErrorDetail(err(409, { code: 'guard_failed', guard: 'no_open_tasks' }))).toEqual({
      status: 409,
      code: 'guard_failed',
      extra: { guard: 'no_open_tasks' },
    });
    expect(recordsErrorDetail(new Error('x')).code).toBeNull();
    expect(recordsErrorDetail(err(503, 'AI is not configured')).code).toBeNull();
  });

  it('maps codes, reasons, guards and fields to messages', () => {
    expect(recordsErrorMessage(err(409, { code: 'workflow_in_use' }))).toEqual({
      key: 'records.errors.workflow_in_use',
    });
    expect(
      recordsErrorMessage(err(409, { code: 'transition_not_allowed', reason: 'wrong_state' })),
    ).toEqual({ key: 'records.errors.reasons.wrong_state' });
    expect(recordsErrorMessage(err(409, { code: 'transition_not_allowed', reason: 'x' }))).toEqual({
      key: 'records.errors.transition_not_allowed',
    });
    expect(
      recordsErrorMessage(err(409, { code: 'guard_failed', guard: 'deviation_closure' })),
    ).toEqual({
      key: 'records.guards.deviation_closure',
    });
    expect(
      recordsErrorMessage(err(422, { code: 'required_fields', fields: ['root_cause', 'owner'] })),
    ).toEqual({ key: 'records.errors.required_fields', params: { fields: 'root_cause, owner' } });
    expect(recordsErrorMessage(err(503, 'AI is not configured'))).toEqual({
      key: 'records.errors.ai_unavailable',
    });
  });

  it('leaves 401 to the auth layer and falls back for unknown errors', () => {
    expect(recordsErrorMessage(err(401, { code: 'x' }))).toBeNull();
    expect(recordsErrorMessage(err(403, undefined))).toEqual({ key: 'errors.forbidden' });
    expect(recordsErrorMessage(err(500, undefined))?.key).toBe('errors.server');
    expect(recordsErrorMessage(err(409, { code: 'something_new' }))?.key).toMatch(/^errors\./);
  });

  it('extracts issue lists', () => {
    const issues = [{ code: 'unknown_state', loc: 'transitions.0.to' }];
    expect(definitionIssues(err(422, { code: 'invalid_definition', errors: issues }))).toEqual(
      issues,
    );
    expect(definitionIssues(err(422, { code: 'invalid_fields', errors: issues }))).toEqual([]);
    const fieldErrors = [{ index: 1, key: 'a', code: 'duplicate_key' }];
    expect(fieldIssues(err(422, { code: 'invalid_fields', errors: fieldErrors }))).toEqual(
      fieldErrors,
    );
  });

  it('falls back for unknown guards and issue codes', () => {
    expect(guardLabelKey('custom_guard')).toBe('records.guards.unknown');
    expect(guardLabelKey(null)).toBe('records.guards.unknown');
    expect(issueKey('duplicate_state')).toBe('records.issues.duplicate_state');
    expect(issueKey('brand_new')).toBe('records.issues.unknown');
  });
});
