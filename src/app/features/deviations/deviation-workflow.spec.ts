import { HttpErrorResponse } from '@angular/common/http';
import { DeviationDetail } from '../../core/deviations/deviation.models';
import {
  editLockKey,
  isStillBlocked,
  lacksEditReach,
  parseWorkflowError,
  statusLockedKey,
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

describe('workflowReasonKey context', () => {
  it('phrases a non-manager reopen rejection as a permission message', () => {
    const ctx = { from: 'closed' as const, to: 'investigating' as const, canManage: false };
    expect(workflowReasonKey('invalid_transition', ctx)).toBe(
      'deviations.workflow.reasons.reopen_requires_manage',
    );
    expect(workflowReasonKey('invalid_transition', { ...ctx, canManage: true })).toBe(
      'deviations.workflow.reasons.invalid_transition',
    );
    expect(workflowReasonKey('invalid_transition', { ...ctx, from: 'open' })).toBe(
      'deviations.workflow.reasons.invalid_transition',
    );
    expect(workflowReasonKey('deviation_closed')).toBe(
      'deviations.workflow.reasons.deviation_closed',
    );
  });
});

describe('edit / status locks', () => {
  it('treats an empty transition list on an open deviation as no edit reach', () => {
    const d = dev({ status: 'investigating', allowed_transitions: [] });
    expect(lacksEditReach(d)).toBe(true);
    expect(editLockKey(d)).toBe('deviations.workflow.noEditAccess');
    expect(statusLockedKey(d)).toBe('deviations.workflow.noEditAccess');
  });

  it('locks editing on closed/cancelled deviations, explaining an empty menu', () => {
    const d = dev({ status: 'closed', allowed_transitions: [] });
    expect(lacksEditReach(d)).toBe(false);
    expect(editLockKey(d)).toBe('deviations.workflow.closedNote');
    expect(statusLockedKey(d)).toBe('deviations.workflow.noTransitions');
    expect(editLockKey(dev({ status: 'cancelled' }))).toBe('deviations.workflow.closedNote');
  });

  it('leaves an open deviation with transitions (or an older API) unlocked', () => {
    const d = dev({ allowed_transitions: [{ to: 'investigating', requires_reason: false }] });
    expect(editLockKey(d)).toBeNull();
    expect(statusLockedKey(d)).toBeNull();
    expect(statusLockedKey(dev())).toBeNull();
    expect(lacksEditReach(dev())).toBe(false);
  });
});

describe('isStillBlocked', () => {
  it('is false only when the target is offered without a block', () => {
    const blocked = dev({
      allowed_transitions: [{ to: 'closed', requires_reason: false, blocked_by: 'open_actions' }],
    });
    const free = dev({ allowed_transitions: [{ to: 'closed', requires_reason: false }] });
    expect(isStillBlocked(blocked, 'closed')).toBe(true);
    expect(isStillBlocked(free, 'closed')).toBe(false);
    expect(isStillBlocked(free, 'action')).toBe(true);
    expect(isStillBlocked(dev(), 'closed')).toBe(true);
  });
});
