import { describe, expect, it, vi } from 'vitest';
import { ChangeDetail } from '../data/asset.models';
import { changeLeadStatus, changeMissing, outcomeBadge } from './change-detail';

const change = (over: Partial<ChangeDetail> = {}): ChangeDetail => ({
  id: 'c-1',
  org_id: 'o',
  code: 'CHG-0001',
  title: 'Upgrade',
  change_type: 'normal',
  category: 'application',
  description: null,
  reason: null,
  impact_assessment: null,
  risk_level: null,
  risk_assessment: null,
  implementation_plan: null,
  rollback_plan: null,
  planned_start: null,
  planned_end: null,
  owner_user_id: 'u-1',
  department_id: null,
  implemented_at: null,
  review_outcome: null,
  review_notes: null,
  owner: { id: 'u-1', name: 'Kari' },
  requested_by: { id: 'u-1', name: 'Kari' },
  status: 'draft',
  status_label: { en: 'Draft', nb: 'Utkast' },
  status_category: 'open',
  pending_approval: false,
  url: '/assets/changes/c-1',
  created_at: '2026-11-01T00:00:00',
  updated_at: '2026-11-01T00:00:00',
  workflow: {
    state: 'draft',
    label: { en: 'Draft' },
    category: 'open',
    state_entered_at: null,
    sla_due_at: null,
    closed_at: null,
    pending_approval: false,
  },
  locked_fields: [],
  closed: false,
  data: {},
  affected_assets: [],
  open_tasks: 0,
  ...over,
});

const EDIT = ['/assets/changes', 'c-1', 'edit'];

describe('changeLeadStatus', () => {
  it('explains the stage in plain words', () => {
    expect(changeLeadStatus(change())).toEqual({
      tone: 'info',
      meaningKey: 'assets.changeDetail.lead.meaning.draft',
    });
    expect(changeLeadStatus(change({ status: 'custom_state' })).meaningKey).toBe(
      'assets.changeDetail.lead.meaning.other',
    );
  });

  it('marks waiting for approval as open work', () => {
    expect(changeLeadStatus(change({ status: 'assessment', pending_approval: true }))).toEqual({
      tone: 'warn',
      meaningKey: 'assets.changeDetail.lead.meaning.pending',
    });
  });

  it('says whether a closed change worked', () => {
    const ok = changeLeadStatus(
      change({ status: 'closed', closed: true, review_outcome: 'successful' }),
    );
    expect(ok).toEqual({
      tone: 'pass',
      meaningKey: 'assets.changeDetail.lead.meaning.closed.successful',
    });
    const back = changeLeadStatus(
      change({ status: 'closed', closed: true, review_outcome: 'rolled_back' }),
    );
    expect(back.tone).toBe('warn');
    expect(changeLeadStatus(change({ status: 'rejected', closed: true })).tone).toBe('neutral');
  });
});

describe('changeMissing', () => {
  it('lists the next step, the owner, a way back for risky changes and the follow-ups', () => {
    const show = vi.fn();
    const start = vi.fn();
    const items = changeMissing(
      change({ owner: null, risk_level: 'high' }),
      EDIT,
      [{ key: 'change_request.to_document', labelKey: 'assets.changeDetail.followUp.document' }],
      show,
      start,
    );
    expect(items.map((i) => i.key)).toEqual([
      'step',
      'owner',
      'rollback',
      'change_request.to_document',
    ]);
    items[0].action!();
    expect(show).toHaveBeenCalled();
    items[3].action!();
    expect(start).toHaveBeenCalledWith('change_request.to_document');
  });

  it('shows only the follow-ups without edit rights', () => {
    const items = changeMissing(change({ owner: null }), null, [], vi.fn(), vi.fn());
    expect(items).toEqual([]);
  });
});

describe('outcomeBadge', () => {
  it('colours the evaluation result', () => {
    expect(outcomeBadge('successful').value).toBe('passed');
    expect(outcomeBadge('partially_successful').value).toBe('due');
    expect(outcomeBadge('failed').value).toBe('failed');
  });
});
