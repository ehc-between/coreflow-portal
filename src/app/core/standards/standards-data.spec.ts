import { themeKey } from '../../features/standards/standard-themes';
import {
  allNodeNumbers,
  chapterBars,
  checklistItems,
  collectGaps,
  compareClauseNumbers,
  completenessPct,
  computeRollup,
  effectiveStatus,
  filterTree,
  flattenRequirements,
  groupByTheme,
  hasAnnexChildren,
  localized,
  matchesFilter,
  replaceRequirement,
  searchRequirements,
  statusTone,
} from './standards-data';
import { ClauseNode, Requirement, RequirementStatus } from './standards.models';

function req(ref: string, status: RequirementStatus, over: Partial<Requirement> = {}): Requirement {
  return {
    ref,
    text: { en: `Requirement ${ref}`, nb: `Krav ${ref}` },
    evidence_examples: { en: '', nb: '' },
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
    title: `Clause ${number}`,
    kind: 'clause',
    theme: null,
    summary: null,
    rollup: { applicable: 0, covered: 0, partial: 0, not_started: 0, pct: 0 },
    children: [],
    requirements: [],
    ...over,
  };
  return { ...base, rollup: over.rollup ?? computeRollup(base) };
}

/** Chapter 4 (4.1 covered, 4.2 partial + n/a) and chapter 5 (5.1 not started). */
function sampleTree(): ClauseNode[] {
  return [
    node('4', {
      title: 'Context of the organization',
      children: [
        node('4.1', { requirements: [req('r-4.1-a', 'covered')] }),
        node('4.2', {
          title: 'Interested parties',
          requirements: [
            req('r-4.2-a', 'partial'),
            req('r-4.2-b', 'not_started', { applicable: false, justification: 'n/a' }),
          ],
        }),
      ],
    }),
    node('5', {
      title: 'Leadership',
      children: [node('5.1', { requirements: [req('r-5.1-a', 'not_started')] })],
    }),
  ];
}

describe('standards-data', () => {
  describe('localized', () => {
    it('picks the active language, falling back to English then Norwegian', () => {
      expect(localized({ en: 'Hello', nb: 'Hei' }, 'nb')).toBe('Hei');
      expect(localized({ en: 'Hello', nb: 'Hei' }, 'en')).toBe('Hello');
      expect(localized({ en: 'Hello', nb: '' }, 'nb')).toBe('Hello');
      expect(localized({ en: 'Hello', nb: 'Hei' }, 'de')).toBe('Hello');
      expect(localized({ en: '', nb: 'Hei' }, 'en')).toBe('Hei');
      expect(localized(null, 'en')).toBe('');
    });
  });

  describe('checklistItems', () => {
    it('splits lines and strips bullets / numbering', () => {
      const text = { en: '- Policy document\n* Minutes\n\n1. Records\n2) Log', nb: '' };
      expect(checklistItems(text, 'en')).toEqual(['Policy document', 'Minutes', 'Records', 'Log']);
    });
  });

  describe('status helpers', () => {
    it('not applicable overrides the coverage status', () => {
      expect(effectiveStatus({ status: 'covered', applicable: false })).toBe('not_applicable');
      expect(effectiveStatus({ status: 'partial', applicable: true })).toBe('partial');
    });

    it('maps statuses to badge tones', () => {
      expect(statusTone('covered')).toBe('pass');
      expect(statusTone('partial')).toBe('warn');
      expect(statusTone('not_started')).toBe('fail');
      expect(statusTone('not_applicable')).toBe('neutral');
    });
  });

  describe('rollups', () => {
    it('completeness is the floored covered share of applicable requirements', () => {
      expect(completenessPct(1, 3)).toBe(33);
      expect(completenessPct(2, 3)).toBe(66);
      expect(completenessPct(3, 3)).toBe(100);
      expect(completenessPct(0, 0)).toBe(0);
    });

    it('computes a subtree roll-up, ignoring non-applicable requirements', () => {
      const [ch4, ch5] = sampleTree();
      expect(ch4.rollup).toEqual({
        applicable: 2,
        covered: 1,
        partial: 1,
        not_started: 0,
        pct: 50,
      });
      expect(ch5.rollup).toEqual({
        applicable: 1,
        covered: 0,
        partial: 0,
        not_started: 1,
        pct: 0,
      });
    });

    it('replaceRequirement patches one requirement and recomputes roll-ups on its path', () => {
      const tree = sampleTree();
      const next = replaceRequirement(tree, 'r-4.2-a', { status: 'covered' });
      expect(next[0].rollup.pct).toBe(100);
      expect(next[0].children[1].requirements[0].status).toBe('covered');
      expect(next[0].children[1].rollup.covered).toBe(1);
      // Untouched branches keep their identity.
      expect(next[0].children[0]).toBe(tree[0].children[0]);
      expect(next[1]).toBe(tree[1]);
    });

    it('marking a requirement not applicable drops it from the denominator', () => {
      const next = replaceRequirement(sampleTree(), 'r-5.1-a', { applicable: false });
      expect(next[1].rollup).toEqual({
        applicable: 0,
        covered: 0,
        partial: 0,
        not_started: 0,
        pct: 0,
      });
    });

    it('chapterBars lists top-level chapters with applicable requirements', () => {
      const tree = [...sampleTree(), node('A', { title: 'Annex' })];
      expect(chapterBars(tree)).toEqual([
        { number: '4', title: 'Context of the organization', pct: 50, applicable: 2, covered: 1 },
        { number: '5', title: 'Leadership', pct: 0, applicable: 1, covered: 0 },
      ]);
    });
  });

  describe('filters', () => {
    it('matchesFilter handles all, gaps and single statuses', () => {
      const partial = req('a', 'partial');
      const na = req('b', 'covered', { applicable: false });
      expect(matchesFilter(partial, 'all')).toBe(true);
      expect(matchesFilter(partial, 'gaps')).toBe(true);
      expect(matchesFilter(na, 'gaps')).toBe(false);
      expect(matchesFilter(na, 'not_applicable')).toBe(true);
      expect(matchesFilter(na, 'covered')).toBe(false);
    });

    it('returns the tree unchanged with no filter or query', () => {
      const tree = sampleTree();
      expect(filterTree(tree, 'all')).toEqual(tree);
    });

    it('prunes to the gaps, dropping empty branches', () => {
      const filtered = filterTree(sampleTree(), 'gaps');
      expect(allNodeNumbers(filtered)).toEqual(['4', '4.2', '5', '5.1']);
      expect(filtered[0].children[0].requirements.map((r) => r.ref)).toEqual(['r-4.2-a']);
    });

    it('filters to a single status', () => {
      const filtered = filterTree(sampleTree(), 'not_applicable');
      expect(allNodeNumbers(filtered)).toEqual(['4', '4.2']);
      expect(filtered[0].children[0].requirements.map((r) => r.ref)).toEqual(['r-4.2-b']);
    });

    it('searches clause numbers, titles and requirement text in the active language', () => {
      expect(allNodeNumbers(filterTree(sampleTree(), 'all', '5.1'))).toEqual(['5', '5.1']);
      // A title hit keeps the whole clause subtree.
      expect(allNodeNumbers(filterTree(sampleTree(), 'all', 'interested'))).toEqual(['4', '4.2']);
      expect(allNodeNumbers(filterTree(sampleTree(), 'all', 'krav r-4.1', 'nb'))).toEqual([
        '4',
        '4.1',
      ]);
      expect(filterTree(sampleTree(), 'all', 'nothing-matches')).toEqual([]);
    });

    it('combines search with a status filter', () => {
      expect(filterTree(sampleTree(), 'covered', 'leadership')).toEqual([]);
    });
  });

  describe('gaps', () => {
    it('lists not-started first, then partial, each by clause number', () => {
      const tree = [
        node('10', { requirements: [req('r-10', 'not_started')] }),
        ...sampleTree(),
        node('4.10', { requirements: [req('r-4.10', 'partial')] }),
      ];
      expect(collectGaps(tree).map((g) => [g.clauseNumber, g.status])).toEqual([
        ['5.1', 'not_started'],
        ['10', 'not_started'],
        ['4.2', 'partial'],
        ['4.10', 'partial'],
      ]);
    });

    it('sorts clause numbers naturally', () => {
      const sorted = ['10', 'A.5.10', '4.10', '4.2', 'A.5.2'].sort(compareClauseNumbers);
      expect(sorted).toEqual(['4.2', '4.10', '10', 'A.5.2', 'A.5.10']);
    });
  });

  describe('Annex A grouping', () => {
    const annex = node('A', {
      children: [
        node('A.5.1', { kind: 'annex_control', theme: 'organizational' }),
        node('A.6.1', { kind: 'annex_control', theme: 'people' }),
        node('A.5.2', { kind: 'annex_control', theme: 'organizational' }),
        node('A.9.9', { kind: 'annex_control', theme: null }),
      ],
    });

    it('detects nodes whose children are controls', () => {
      expect(hasAnnexChildren(annex)).toBe(true);
      expect(hasAnnexChildren(sampleTree()[0])).toBe(false);
      expect(hasAnnexChildren(node('x'))).toBe(false);
    });

    it('groups by theme in first-appearance order', () => {
      expect(
        groupByTheme(annex.children).map((g) => [g.theme, g.nodes.map((n) => n.number)]),
      ).toEqual([
        ['organizational', ['A.5.1', 'A.5.2']],
        ['people', ['A.6.1']],
        ['', ['A.9.9']],
      ]);
    });

    it('resolves known theme labels and leaves others raw', () => {
      expect(themeKey('organizational')).toBe('standards.themes.organizational');
      expect(themeKey('Organisational controls')).toBe('standards.themes.organizational');
      expect(themeKey('Technological')).toBe('standards.themes.technological');
      expect(themeKey('something else')).toBeNull();
    });
  });

  describe('requirement picker', () => {
    const options = flattenRequirements(sampleTree(), 'iso9001', 'ISO 9001');

    it('flattens applicable requirements with their clause', () => {
      expect(options.map((o) => [o.ref, o.clauseNumber])).toEqual([
        ['r-4.1-a', '4.1'],
        ['r-4.2-a', '4.2'],
        ['r-5.1-a', '5.1'],
      ]);
      expect(options[0].standardName).toBe('ISO 9001');
    });

    it('matches every term across clause, title, standard and text; excludes refs', () => {
      expect(searchRequirements(options, 'interested', 'en').map((o) => o.ref)).toEqual([
        'r-4.2-a',
      ]);
      expect(searchRequirements(options, '9001 5.1', 'en').map((o) => o.ref)).toEqual(['r-5.1-a']);
      expect(searchRequirements(options, 'krav', 'nb', new Set(['r-4.1-a'])).length).toBe(2);
      expect(searchRequirements(options, 'requirement', 'en', new Set(), 1).length).toBe(1);
    });
  });
});
