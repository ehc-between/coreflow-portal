import { HttpErrorResponse } from '@angular/common/http';
import { DeviationDetail } from '../../core/deviations/deviation.models';
import {
  parseWorkflowError,
  statusErrorKey,
  statusMenuEntries,
  workflowReasonKey,
} from './deviation-workflow';

function dev(overrides: Partial<DeviationDetail> = {}): DeviationDetail {
  return {
    id: 'd1',
    code: 'DEV-1',
    title: 'Leak',
    type_id: 't1',
    standards: [],
    clauses: [],
    tags: [],
    severity: 'medium',
    status: 'open',
    source: 'internal',
    raised_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    visibility: 'organization',
    data: {},
    actions: [],
    events: [],
    ...overrides,
  };
}

describe('statusMenuEntries', () => {
  it('maps allowed transitions, keeping blocked ones with their reason', () => {
    const entries = statusMenuEntries(
      dev({
        status: 'verification',
        allowed_transitions: [
          { to: 'closed', requires_reason: false, blocked_by: 'open_actions' },
          { to: 'cancelled', requires_reason: true },
        ],
      }),
    );
    expect(entries).toEqual([
      { status: 'closed', requiresReason: false, blockedBy: 'open_actions' },
      { status: 'cancelled', requiresReason: true, blockedBy: null },
    ]);
  });

  it('never offers the current status', () => {
    const entries = statusMenuEntries(
      dev({ status: 'open', allowed_transitions: [{ to: 'open', requires_reason: false }] }),
    );
    expect(entries).toEqual([]);
  });

  it('falls back to every other status when the API sends no transitions', () => {
    const entries = statusMenuEntries(dev({ status: 'open' }));
    expect(entries.map((e) => e.status)).toEqual([
      'investigating',
      'action',
      'verification',
      'closed',
      'cancelled',
    ]);
    expect(entries.every((e) => e.blockedBy === null && !e.requiresReason)).toBe(true);
  });
});

describe('workflowReasonKey', () => {
  it('maps known codes and falls back for unknown ones', () => {
    expect(workflowReasonKey('open_actions')).toBe('deviations.workflow.reasons.open_actions');
    expect(workflowReasonKey('something_new')).toBe('deviations.workflow.reasons.unknown');
    expect(workflowReasonKey(null)).toBe('deviations.workflow.reasons.unknown');
  });
});

describe('parseWorkflowError', () => {
  it('parses a 409 workflow body with blocking actions', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: {
        detail: {
          code: 'open_actions',
          message: 'Open actions',
          blocking: [{ action_id: 'a1', description: 'Fix valve' }, { bogus: true }],
        },
      },
    });
    expect(parseWorkflowError(error)).toEqual({
      code: 'open_actions',
      message: 'Open actions',
      blocking: [{ action_id: 'a1', description: 'Fix valve' }],
    });
  });

  it('ignores non-409s and malformed bodies', () => {
    expect(parseWorkflowError(new HttpErrorResponse({ status: 422, error: {} }))).toBeNull();
    expect(
      parseWorkflowError(new HttpErrorResponse({ status: 409, error: { detail: 'nope' } })),
    ).toBeNull();
    expect(parseWorkflowError(new Error('x'))).toBeNull();
  });
});

describe('statusErrorKey', () => {
  it('maps statuses to neutral keys and leaves auth to the auth layer', () => {
    expect(statusErrorKey(new HttpErrorResponse({ status: 0 }))).toBe('errors.network');
    expect(statusErrorKey(new HttpErrorResponse({ status: 503 }))).toBe('errors.server');
    expect(statusErrorKey(new HttpErrorResponse({ status: 404 }))).toBe('errors.notFound');
    expect(statusErrorKey(new HttpErrorResponse({ status: 400 }))).toBe('errors.generic');
    expect(statusErrorKey(new HttpErrorResponse({ status: 403 }))).toBeNull();
  });
});
