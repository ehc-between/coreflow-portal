import { computeRollup } from '../../../core/standards/standards-data';
import {
  ClauseNode,
  Requirement,
  RequirementDetail,
  RequirementStatus,
} from '../../../core/standards/standards.models';
import {
  countStale,
  firstGap,
  hasStaleEvidence,
  matchesContentFilter,
  requirementPatchFromDetail,
  tocRows,
} from './workspace-data';

function req(ref: string, status: RequirementStatus, over: Partial<Requirement> = {}): Requirement {
  return {
    ref,
    text: { en: ref, nb: ref },
    evidence_examples: null,
    status,
    applicable: true,
    justification: null,
    confirmed_links: [],
    suggested_links: [],
    status_override: null,
    note: null,
    ...over,
  };
}

function node(number: string, over: Partial<ClauseNode> = {}): ClauseNode {
  const base: ClauseNode = {
    number,
    title: { en: `Clause ${number}`, nb: `Punkt ${number}` },
    kind: 'clause',
    theme: null,
    summary: null,
    guidance: null,
    rollup: { applicable: 0, covered: 0, partial: 0, not_started: 0, pct: 0 },
    children: [],
    requirements: [],
    ...over,
  };
  return { ...base, rollup: computeRollup(base) };
}

describe('workspace data (A03)', () => {
  it('finds old or weak evidence, never on not-applicable requirements', () => {
    expect(hasStaleEvidence(req('a', 'covered', { evidence_state: 'stale' }))).toBe(true);
    expect(hasStaleEvidence(req('b', 'partial', { evidence_state: 'weak' }))).toBe(true);
    expect(hasStaleEvidence(req('c', 'partial', { weak_evidence: true }))).toBe(true);
    expect(hasStaleEvidence(req('d', 'covered', { evidence_state: 'fresh' }))).toBe(false);
    expect(
      hasStaleEvidence(req('e', 'covered', { evidence_state: 'stale', applicable: false })),
    ).toBe(false);
    expect(
      matchesContentFilter(req('f', 'covered'), { gaps: false, suggestions: false, stale: true }),
    ).toBe(false);
  });

  it('counts stale requirements across the tree', () => {
    const tree = [
      node('4', {
        children: [
          node('4.1', { requirements: [req('a', 'covered', { evidence_state: 'stale' })] }),
        ],
        requirements: [req('b', 'covered', { evidence_state: 'weak' }), req('c', 'covered')],
      }),
    ];
    expect(countStale(tree)).toBe(2);
  });

  it('recommends the first requirement nobody started, else the first partial one', () => {
    const tree = [
      node('4', {
        requirements: [req('p', 'partial')],
        children: [node('4.1', { requirements: [req('n', 'not_started')] })],
      }),
    ];
    expect(firstGap(tree)).toEqual({ ref: 'n', clause: '4.1' });
    expect(firstGap([node('4', { requirements: [req('p', 'partial')] })])).toEqual({
      ref: 'p',
      clause: '4',
    });
    expect(firstGap([node('4', { requirements: [req('c', 'covered')] })])).toBeNull();
  });

  it('patches the auditor fields from the API only when present', () => {
    const detail: RequirementDetail = {
      ...req('a', 'covered'),
      links: [],
      owner: { id: 'u-1', name: 'Kari' },
      due_date: '2026-12-01',
      exclusion: 'not_allowed',
    };
    const patch = requirementPatchFromDetail(detail);
    expect(patch.owner).toEqual({ id: 'u-1', name: 'Kari' });
    expect(patch.due_date).toBe('2026-12-01');
    expect(patch.exclusion).toBe('not_allowed');
    expect('soa' in patch).toBe(false);
  });

  it('labels TOC rows in the UI language and links them by slug', () => {
    const tree = [
      node('Chapter II', { label: { en: 'Chapter II', nb: 'Kapittel II' }, slug: 'chapter-ii' }),
    ];
    const [row] = tocRows(tree, { expanded: new Set(), lang: 'nb' });
    expect(row.label).toBe('Kapittel II');
    expect(row.segment).toBe('chapter-ii');
    // Searching by the Norwegian label finds it.
    expect(tocRows(tree, { expanded: new Set(), lang: 'nb', query: 'kapittel' })).toHaveLength(1);
  });
});
