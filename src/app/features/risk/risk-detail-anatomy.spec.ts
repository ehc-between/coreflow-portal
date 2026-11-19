import { describe, expect, it } from 'vitest';
import { Opportunity, Risk, SoaEntry, Treatment } from './data/risk.models';
import { opportunityMissing, opportunityTone } from './opportunities/opportunity-detail';
import { riskMissing, riskStatusSentence } from './risks/risk-detail';
import { treatmentStatusLine } from './risks/risk-treatments';
import { soaEntryStatus } from './soa/soa-view';

const rating = {
  likelihood: 4,
  consequence: 5,
  score: 20,
  level: 'critical',
  label: null,
  color: null,
};

function risk(over: Partial<Risk> = {}): Risk {
  return {
    status: 'assessed',
    inherent: rating,
    residual: null,
    above_appetite: false,
    appetite_max_score: 4,
    acceptance: null,
    treatment_strategy: 'mitigate',
    treatments: { open: 1, done: 0 },
    owner: { id: 'u1', name: 'Kari' },
    can_edit: true,
    review_overdue: false,
    ...over,
  } as unknown as Risk;
}

describe('risk detail anatomy helpers', () => {
  it('says how the risk stands, never red for open work', () => {
    expect(riskStatusSentence(risk({ inherent: null }))?.key).toContain('unrated');
    expect(riskStatusSentence(risk({ above_appetite: true }))).toEqual({
      key: 'risk.detail.statusLine.above',
      tone: 'warn',
    });
    expect(riskStatusSentence(risk())?.tone).toBe('neutral');
    expect(riskStatusSentence(risk({ status: 'closed' }))?.key).toContain('closed');
    expect(riskStatusSentence(risk({ appetite_max_score: null }))).toBeNull();
  });

  it('lists what a risk is missing, with the review as an action', () => {
    const review = () => undefined;
    const keys = riskMissing(
      risk({
        inherent: null,
        owner: null,
        treatments: { open: 0, done: 0, total: 0 },
        review_overdue: true,
      }),
      ['/edit'],
      { review, addTreatment: review },
    ).map((m) => m.key);
    expect(keys).toEqual(['review', 'rating', 'treatments', 'owner']);
    expect(
      riskMissing(risk({ can_edit: false, owner: null }), [], {
        review: null,
        addTreatment: null,
      }),
    ).toEqual([]);
  });

  it('gives a treatment a status sentence: done is green only once checked', () => {
    const t = (over: Partial<Treatment>) =>
      ({ status: 'planned', overdue: false, ...over }) as Treatment;
    expect(treatmentStatusLine(t({ status: 'done' })).tone).toBe('warn');
    expect(
      treatmentStatusLine(t({ status: 'done', effectiveness: {} as Treatment['effectiveness'] }))
        .tone,
    ).toBe('pass');
    expect(treatmentStatusLine(t({ overdue: true })).key).toContain('overdue');
  });

  it('gives a SoA control a status sentence', () => {
    const e = (over: Partial<SoaEntry>) =>
      ({
        applicable: true,
        needs_justification: false,
        implementation_status: 'implemented',
        justification: 'x',
        ...over,
      }) as SoaEntry;
    expect(soaEntryStatus(e({})).tone).toBe('pass');
    expect(soaEntryStatus(e({ implementation_status: 'partial' })).key).toBe(
      'risk.soa.detail.status.partial',
    );
    expect(soaEntryStatus(e({ applicable: false, justification: null })).key).toContain(
      'excludedMissing',
    );
  });

  it('lists what an opportunity is missing', () => {
    const o = {
      status: 'evaluating',
      can_edit: true,
      overdue: false,
      benefit: null,
      feasibility: 3,
      action_plan: null,
      actions: { open: 0, done: 0 },
      owner: null,
    } as unknown as Opportunity;
    expect(opportunityMissing(o, []).map((m) => m.key)).toEqual(['score', 'plan', 'owner']);
    expect(opportunityTone('realised')).toBe('pass');
    expect(opportunityTone('identified')).toBe('warn');
  });
});
