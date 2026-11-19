import { describe, expect, it } from 'vitest';
import {
  LEAD_SECTIONS,
  assessmentMissing,
  assessmentStatusSentence,
} from './assessments/assessment-detail';
import { AiSystem, Assessment, Obligation } from './data/ai-governance.models';
import {
  isPast,
  obligationCounts,
  systemMissing,
  systemStatusSentence,
} from './systems/system-detail';

function system(over: Partial<AiSystem> = {}): AiSystem {
  return {
    id: 's1',
    risk_class: 'high',
    intended_purpose: 'Rank applications',
    owner: { id: 'u1', name: 'Kari' },
    overseers: [{ id: 'u2', name: 'Ola', literacy_valid: true }],
    is_builtin: false,
    uses_personal_data: false,
    processing_activity: null,
    dpias: [],
    dpia_recommended: false,
    fria_required: false,
    next_review_at: null,
    ...over,
  } as unknown as AiSystem;
}

const ctx = {
  editLink: ['/edit'],
  counts: { met: 1, total: 1 },
  hasFria: false,
  classify: () => undefined,
  createDpia: () => undefined,
  showObligations: () => undefined,
};

describe('AI system detail anatomy helpers', () => {
  it('counts obligations without the not-relevant ones', () => {
    const o = (status: string) => ({ status }) as Obligation;
    expect(obligationCounts([o('met'), o('open'), o('not_relevant')])).toEqual({
      met: 1,
      total: 2,
    });
  });

  it('says how the system stands, never red for open work', () => {
    expect(systemStatusSentence({ risk_class: 'unclassified' }, { met: 0, total: 0 }).tone).toBe(
      'warn',
    );
    expect(systemStatusSentence({ risk_class: 'high' }, { met: 1, total: 5 })).toEqual({
      key: 'aiGovernance.systemDetail.statusLine.open',
      tone: 'warn',
    });
    expect(systemStatusSentence({ risk_class: 'high' }, { met: 5, total: 5 }).tone).toBe('pass');
    expect(systemStatusSentence({ risk_class: 'minimal' }, { met: 0, total: 0 }).tone).toBe(
      'neutral',
    );
  });

  it('lists what a system is missing', () => {
    const keys = systemMissing(
      system({
        risk_class: 'high',
        owner: null,
        overseers: [{ id: 'u2', name: 'Ola', literacy_valid: false }],
        uses_personal_data: true,
        dpia_recommended: true,
        fria_required: true,
        next_review_at: '2000-01-01',
      }),
      { ...ctx, counts: { met: 1, total: 3 } },
    ).map((m) => m.key);
    expect(keys).toEqual(['review', 'obligations', 'fria', 'owner', 'literacy', 'ropa', 'dpia']);
    expect(systemMissing(system(), ctx)).toEqual([]);
    expect(
      systemMissing(system({ risk_class: 'unclassified', overseers: [] }), ctx).map((m) => m.key),
    ).toEqual(['classify', 'overseers']);
  });

  it('reads stored dates in any form', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(isPast('2026-05-31', now)).toBe(true);
    expect(isPast('2026-06-02T00:00:00', now)).toBe(false);
    expect(isPast(null, now)).toBe(false);
  });
});

describe('AI assessment detail anatomy helpers', () => {
  it('says how far an assessment is', () => {
    expect(
      assessmentStatusSentence(
        { status: 'approved', kind: 'impact' },
        { wizard: false, missing: 0 },
      ).tone,
    ).toBe('pass');
    expect(
      assessmentStatusSentence({ status: 'draft', kind: 'impact' }, { wizard: false, missing: 2 })
        .key,
    ).toBe('aiGovernance.assessmentDetail.statusLine.draftMissing');
    expect(
      assessmentStatusSentence(
        { status: 'draft', kind: 'classification' },
        { wizard: true, missing: 0 },
      ).key,
    ).toBe('aiGovernance.assessmentDetail.statusLine.draftWizard');
  });

  it('lists the missing parts of a draft and the review of a flagged one', () => {
    const reopen = () => undefined;
    const draft = { status: 'draft', owner: null, review_flag: null } as unknown as Assessment;
    expect(
      assessmentMissing(draft, {
        canWrite: true,
        editLink: ['/e'],
        missingSections: [{ key: 'conclusion', label: 'Konklusjon' }],
        reopen,
      }).map((m) => m.key),
    ).toEqual(['section-conclusion', 'owner']);
    const flagged = {
      status: 'approved',
      owner: null,
      review_flag: 'reclassified',
    } as unknown as Assessment;
    const items = assessmentMissing(flagged, {
      canWrite: true,
      editLink: [],
      missingSections: [],
      reopen,
    });
    expect(items.map((m) => m.key)).toEqual(['flag']);
    expect(items[0].action).toBe(reopen);
    expect(
      assessmentMissing(flagged, { canWrite: false, editLink: [], missingSections: [], reopen }),
    ).toEqual([]);
  });

  it('leads with the conclusion of an impact assessment', () => {
    expect(LEAD_SECTIONS.impact[0][0]).toBe('conclusion');
    expect(LEAD_SECTIONS.fria.map(([k]) => k)).toContain('specific_risks');
  });
});
