import { HttpErrorResponse } from '@angular/common/http';
import {
  activeApplicationCount,
  applicationActions,
  fromLocalInput,
  isRequisitionLocked,
  moveTargets,
  needsPrivacyNotice,
  pendingRequiredChecks,
  requisitionActions,
  retentionDue,
  toLocalInput,
} from './recruitment-display';
import { recruitmentError } from './recruitment-errors';
import {
  draftFromRequisition,
  emptyRequisitionDraft,
  hasChanges,
  requisitionChanges,
  requisitionPayload,
} from './requisition-form-model';
import { RequisitionDetail } from './recruitment.models';

const perms = { write: true, manage: false };

function req(overrides: Partial<RequisitionDetail> = {}): RequisitionDetail {
  return {
    id: 'r1',
    org_id: 'o1',
    code: 'REQ-0001',
    title: 'Analyst',
    description: null,
    justification: 'Growth',
    department_id: null,
    location: null,
    employment_type: 'permanent',
    headcount: 2,
    role_risk: 'medium',
    status: 'draft',
    target_start_date: null,
    hiring_manager: null,
    recruiter: null,
    screening_criteria: [{ id: 'c1', label: 'Linux', description: null }],
    posting_title: null,
    posting_text: null,
    posting_closes_at: null,
    opened_at: null,
    submitted_at: null,
    submitted_by: null,
    decided_at: null,
    decided_by: null,
    decision_note: null,
    approval_task_id: null,
    closed_at: null,
    created_by: null,
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    required_checks: ['identity'],
    stage_counts: {},
    hires: 0,
    can_edit: true,
    can_approve: false,
    url: '/recruitment/requisitions/r1',
    team: [],
    ...overrides,
  };
}

describe('requisitionActions', () => {
  it('offers submit on a draft the caller can edit, plus cancel', () => {
    expect(requisitionActions(req(), perms)).toEqual(['submit', 'cancel']);
  });

  it('offers approve / reject only when the server says the caller may approve', () => {
    const pending = req({ status: 'pending_approval', can_approve: true });
    expect(requisitionActions(pending, perms)).toEqual(['approve', 'reject', 'cancel']);
    expect(requisitionActions({ ...pending, can_approve: false }, perms)).toEqual(['cancel']);
  });

  it('opens, holds and fills in the right states', () => {
    expect(requisitionActions(req({ status: 'approved' }), perms)).toEqual([
      'open',
      'fill',
      'cancel',
    ]);
    expect(requisitionActions(req({ status: 'open' }), perms)).toEqual(['hold', 'fill', 'cancel']);
    expect(requisitionActions(req({ status: 'filled' }), { write: true, manage: true })).toEqual([
      'delete',
    ]);
  });

  it('offers nothing to a reader', () => {
    expect(requisitionActions(req({ status: 'open' }), { write: false, manage: false })).toEqual(
      [],
    );
  });
});

describe('requisition rules', () => {
  it('locks the approval fields once submitted', () => {
    expect(isRequisitionLocked('draft')).toBe(false);
    expect(isRequisitionLocked('rejected')).toBe(false);
    expect(isRequisitionLocked('pending_approval')).toBe(true);
    expect(isRequisitionLocked('open')).toBe(true);
  });

  it('counts only active applications', () => {
    expect(
      activeApplicationCount({ stage_counts: { applied: 2, interview: 1, hired: 1, rejected: 4 } }),
    ).toBe(3);
  });
});

describe('application rules', () => {
  it('never moves a hired application and never to its own stage', () => {
    expect(moveTargets('hired')).toEqual([]);
    expect(moveTargets('applied')).not.toContain('applied');
    expect(moveTargets('offer')).toContain('rejected');
  });

  it('needs the privacy notice past screening', () => {
    expect(needsPrivacyNotice('screening')).toBe(false);
    expect(needsPrivacyNotice('rejected')).toBe(false);
    expect(needsPrivacyNotice('interview')).toBe(true);
  });

  it('lists required checks that are not settled', () => {
    expect(
      pendingRequiredChecks(
        ['identity', 'reference'],
        [
          { check_type: 'identity', required: true, status: 'passed' },
          { check_type: 'reference', required: true, status: 'requested' },
          { check_type: 'education', required: true, status: 'concerns' },
          { check_type: 'credit', required: true, status: 'in_progress' },
        ],
      ),
    ).toEqual(['reference', 'credit']);
  });

  it('derives the offer and hire actions', () => {
    const base = { can_edit: true } as const;
    expect(applicationActions({ ...base, stage: 'interview', offer_status: 'none' }, true)).toEqual(
      ['offer'],
    );
    expect(
      applicationActions({ ...base, stage: 'interview', offer_status: 'none' }, false),
    ).toEqual([]);
    expect(applicationActions({ ...base, stage: 'offer', offer_status: 'extended' }, true)).toEqual(
      ['accept', 'decline'],
    );
    expect(applicationActions({ ...base, stage: 'offer', offer_status: 'accepted' }, true)).toEqual(
      ['hire'],
    );
    expect(applicationActions({ ...base, stage: 'rejected', offer_status: 'none' }, true)).toEqual(
      [],
    );
    expect(
      applicationActions({ can_edit: false, stage: 'interview', offer_status: 'none' }, true),
    ).toEqual([]);
  });
});

describe('date helpers', () => {
  it('round-trips a naive UTC date-time through the local input', () => {
    const local = toLocalInput('2026-11-12T09:30:00');
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocalInput(local)).toBe('2026-11-12T09:30:00.000Z');
    expect(fromLocalInput('')).toBeNull();
    expect(toLocalInput(null)).toBe('');
  });

  it('flags retention dates that are due', () => {
    const now = Date.parse('2026-11-12T00:00:00Z');
    expect(retentionDue('2026-11-20T00:00:00', 30, now)).toBe(true);
    expect(retentionDue('2027-06-01T00:00:00', 30, now)).toBe(false);
    expect(retentionDue(null, 30, now)).toBe(false);
  });
});

describe('requisition form model', () => {
  it('drops blank criteria and trims text', () => {
    const payload = requisitionPayload({
      ...emptyRequisitionDraft(),
      title: '  Analyst ',
      headcount: 0,
      screening_criteria: [
        { id: null, label: ' Linux ', description: '' },
        { id: null, label: '  ', description: 'ignored' },
      ],
    });
    expect(payload.title).toBe('Analyst');
    expect(payload.headcount).toBe(1);
    expect(payload.screening_criteria).toEqual([{ label: 'Linux', description: null }]);
    expect(payload.description).toBeNull();
  });

  it('sends only changed fields (never untouched locked ones) plus the reason', () => {
    const original = req({ status: 'open' });
    const draft = { ...draftFromRequisition(original), posting_text: 'Join us' };
    const changes = requisitionChanges(original, draft, ' Typo ');
    expect(changes).toEqual({ posting_text: 'Join us', change_reason: 'Typo' });
    expect(hasChanges(changes)).toBe(true);
    expect(hasChanges(requisitionChanges(original, draftFromRequisition(original), 'x'))).toBe(
      false,
    );
  });
});

describe('recruitmentError', () => {
  const http = (status: number, detail: unknown) =>
    new HttpErrorResponse({ status, error: { detail } });

  it('maps known codes to scoped keys and keeps the detail', () => {
    const e = recruitmentError(
      http(409, { code: 'checks_incomplete', check_types: ['reference'] }),
    );
    expect(e.key).toBe('recruitment.errors.checks_incomplete');
    expect(e.detail['check_types']).toEqual(['reference']);
  });

  it('falls back by status', () => {
    expect(recruitmentError(http(404, 'Not found')).key).toBe('recruitment.errors.notFound');
    expect(recruitmentError(http(403, { code: 'whatever' })).key).toBe(
      'recruitment.errors.forbidden',
    );
    expect(recruitmentError(http(500, null)).key).toBe('errors.server');
    expect(recruitmentError(new Error('x')).key).toBe('errors.generic');
  });
});
