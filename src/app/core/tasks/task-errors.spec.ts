import { HttpErrorResponse } from '@angular/common/http';
import { taskErrorKey } from './task-errors';

function httpError(status: number, detail: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { detail } });
}

describe('taskErrorKey', () => {
  it('maps a known code to its scoped key', () => {
    expect(taskErrorKey(httpError(409, { code: 'task_closed' }))).toBe('tasks.errors.task_closed');
    expect(taskErrorKey(httpError(422, { code: 'invalid_rrule' }))).toBe(
      'tasks.errors.invalid_rrule',
    );
  });

  it('uses the forbidden text for a 403 without a known code', () => {
    expect(taskErrorKey(httpError(403, 'Insufficient permissions'))).toBe('tasks.errors.forbidden');
  });

  it('falls back to the neutral status message', () => {
    expect(taskErrorKey(httpError(404, 'Task not found'))).toBe('errors.notFound');
    expect(taskErrorKey(httpError(422, [{ loc: ['body'] }]))).toBe('errors.generic');
    expect(taskErrorKey(httpError(500, null))).toBe('errors.server');
    expect(taskErrorKey(new Error('boom'))).toBe('errors.generic');
  });
});
