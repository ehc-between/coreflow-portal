import { ContextAnalysis, Policy, Responsibility } from '../data/context.models';
import { applyAnalysisDraft, applySuggestedParty, suggestedParties } from './ai-apply';
import {
  changedFields,
  changesContent,
  createBody,
  draftFrom,
  draftProblems,
  emptyDraft,
  isCreateOnly,
  updateBody,
} from './context-draft';
import { seededDraft } from './context-form';

const base = {
  id: 'x1',
  org_id: 'o1',
  code: 'X-1',
  entity_type: 'x',
  url: '/context/x/x1',
  owner: { id: 'u1', name: 'Ada' },
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:00',
  can_edit: true,
};
const controlled = {
  status: 'approved' as const,
  version_no: 2,
  submitted_by: null,
  submitted_at: null,
  approved_by: null,
  approved_at: null,
  review_interval_months: 12,
  next_review_at: '2027-01-01T00:00:00',
  last_reviewed_at: null,
  review_overdue: false,
  can_approve: false,
};

const policy: Policy = {
  ...base,
  ...controlled,
  kind: 'quality',
  title: 'Quality policy',
  statement: 'We satisfy customers.',
  frameworks: ['iso9001'],
  documents: [],
};

describe('context drafts', () => {
  it('builds create bodies per kind, trimming text and dropping blanks', () => {
    const draft = {
      ...emptyDraft('policy'),
      title: '  Security policy ',
      kind: 'information_security' as const,
      statement: '   ',
      frameworks: ['iso27001'],
      document: { id: 'doc-1', title: 'ISP', code: 'DOC-1' },
    };
    expect(createBody('policy', draft)).toEqual({
      kind: 'information_security',
      title: 'Security policy',
      statement: null,
      frameworks: ['iso27001'],
      owner_user_id: null,
      review_interval_months: 12,
      next_review_at: null,
      document_id: 'doc-1',
    });

    const scope = {
      ...emptyDraft('scope'),
      title: 'QMS',
      framework: 'iso9001',
      sites: 'Oslo\n\nBergen\nOslo',
    };
    expect(createBody('scope', scope)['sites']).toEqual(['Oslo', 'Bergen']);
  });

  it('PATCHes only the changed fields and never the create-only ones', () => {
    const original = draftFrom('policy', policy);
    expect(updateBody('policy', original, original)).toEqual({});

    const edited = { ...original, title: 'Quality policy v3', change_reason: 'Annual review' };
    expect(updateBody('policy', original, edited)).toEqual({
      title: 'Quality policy v3',
      change_reason: 'Annual review',
    });

    const analysis: ContextAnalysis = {
      ...base,
      ...controlled,
      title: 'SWOT',
      method: 'swot',
      framework: null,
      summary: null,
      items: [{ id: 'i1', category: 'strength', text: 'Team', impact: 'high' }],
      counts: {},
    };
    const a = draftFrom('analysis', analysis);
    expect(isCreateOnly('analysis', 'method')).toBe(true);
    expect(changedFields('analysis', a, { ...a, method: 'pestle' })).toEqual({});
    expect(changedFields('analysis', a, { ...a, items: [] })).toEqual({ items: [] });
  });

  it('tells content changes from owner / review changes', () => {
    const original = draftFrom('policy', policy);
    const ownerOnly = changedFields('policy', original, { ...original, owner_user_id: 'u2' });
    expect(ownerOnly).toEqual({ owner_user_id: 'u2' });
    expect(changesContent(ownerOnly)).toBe(false);
    const content = changedFields('policy', original, { ...original, statement: 'New text' });
    expect(changesContent(content)).toBe(true);
  });

  it('sends status changes for parties and responsibilities', () => {
    const raci: Responsibility = {
      ...base,
      title: 'Incidents',
      area: null,
      description: null,
      authorities: null,
      frameworks: [],
      assignments: [{ type: 'role', value: 'ciso', raci: 'A', name: null }],
      status: 'active',
      next_review_at: null,
      warnings: ['no_responsible'],
    };
    const d = draftFrom('responsibility', raci);
    expect(updateBody('responsibility', d, { ...d, status: 'archived' })).toEqual({
      status: 'archived',
    });
  });

  it('reports client-side problems', () => {
    expect(draftProblems('party', emptyDraft('party'))).toEqual(['context.form.problems.name']);
    expect(draftProblems('scope', { ...emptyDraft('scope'), title: 'S' })).toEqual([
      'context.form.problems.framework',
    ]);
    expect(
      draftProblems('analysis', {
        ...emptyDraft('analysis'),
        title: 'A',
        review_interval_months: '99',
      }),
    ).toEqual(['context.form.problems.interval']);
    const two = [
      { type: 'role' as const, value: 'admin', raci: 'A' as const, name: null },
      { type: 'role' as const, value: 'admin', raci: 'A' as const, name: null },
    ];
    expect(
      draftProblems('responsibility', {
        ...emptyDraft('responsibility'),
        title: 'R',
        assignments: two,
      }),
    ).toEqual(['context.errors.multiple_accountable', 'context.errors.duplicate_assignment']);
  });

  it('seeds a new draft from the URL', () => {
    expect(seededDraft('scope', { framework: 'iso27001', kind: null }).framework).toBe('iso27001');
    expect(seededDraft('scope', { framework: 'bogus', kind: null }).framework).toBe('');
    expect(seededDraft('policy', { framework: null, kind: 'ai' }).kind).toBe('ai');
  });
});

describe('AI results', () => {
  it('appends drafted factors of the right method and fills an empty summary', () => {
    const draft = { ...emptyDraft('analysis'), title: 'SWOT' };
    const next = applyAnalysisDraft(draft, {
      summary: 'Strong team, thin margins.',
      items: [
        { category: 'strength', text: 'Experienced team', impact: 'high' },
        { category: 'political', text: 'Not SWOT' },
        { category: 'threat', text: 'New entrants', impact: 'bogus' },
        { category: 'strength', text: 'experienced team ' },
      ],
    });
    expect(next.summary).toBe('Strong team, thin margins.');
    expect(next.items.map((i) => [i.category, i.text, i.impact])).toEqual([
      ['strength', 'Experienced team', 'high'],
      ['threat', 'New entrants', 'medium'],
    ]);
    const kept = applyAnalysisDraft({ ...draft, summary: 'Mine' }, { summary: 'Theirs' });
    expect(kept.summary).toBe('Mine');
  });

  it('parses party suggestions and fills the party form from one', () => {
    const parties = suggestedParties({
      parties: [{ name: 'Customers', category: 'customer', influence: 'high' }, { name: ' ' }],
    });
    expect(parties).toHaveLength(1);
    const filled = applySuggestedParty(emptyDraft('party'), {
      name: 'Labour Inspection',
      category: 'regulator',
      party_type: 'external',
      needs: 'Safe workplace',
      influence: 'high',
      interest: 'nope',
    });
    expect(filled).toMatchObject({
      title: 'Labour Inspection',
      category: 'regulator',
      needs: 'Safe workplace',
      influence: 'high',
      interest: 'medium',
    });
    expect(suggestedParties(null)).toEqual([]);
  });
});
