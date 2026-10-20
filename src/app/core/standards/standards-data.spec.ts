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
  standardsErrorKey,
  statusTone,
} from './standards-data';
import { ClauseNode, Requirement, RequirementStatus } from './standards.models';

function req(ref: string, status: RequirementStatus, over: Partial<Requirement> = {}): Requirement {
  return {
    ref,
    text: { en: `Requirement ${ref}`, nb: `Krav ${ref}` },
    evidence_examples: { en: [], nb: [] },
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
    title: { en: `Clause ${number}`, nb: `Klausul ${number}` },
    guidance: null,
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
      title: { en: 'Context of the organization', nb: 'Organisasjonens kontekst' },
      children: [
        node('4.1', { requirements: [req('r-4.1-a', 'covered')] }),
        node('4.2', {
          title: { en: 'Interested parties', nb: 'Interessenter' },
          requirements: [
            req('r-4.2-a', 'partial'),
            req('r-4.2-b', 'not_started', { applicable: false, justification: 'n/a' }),
          ],
        }),
      ],
    }),
    node('5', {
      title: { en: 'Leadership', nb: 'Lederskap' },
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
    // The real API shape: per-language arrays of strings.
    const examples = {
      en: ['Information security policy', '  Topic-specific policies ', ''],
      nb: ['Informasjonssikkerhetspolicy', 'Temaspesifikke retningslinjer'],
    };

    it('returns the active language items, trimmed, without blanks', () => {
      expect(checklistItems(examples, 'en')).toEqual([
        'Information security policy',
        'Topic-specific policies',
      ]);
      expect(checklistItems(examples, 'nb')).toEqual([
        'Informasjonssikkerhetspolicy',
        'Temaspesifikke retningslinjer',
      ]);
    });

    it('falls back to English, then Norwegian, then nothing', () => {
      expect(checklistItems({ en: ['A'] }, 'nb')).toEqual(['A']);
      expect(checklistItems({ en: [], nb: ['B'] }, 'en')).toEqual(['B']);
      expect(checklistItems({ en: ['A'], nb: ['B'] }, 'de')).toEqual(['A']);
      expect(checklistItems({}, 'en')).toEqual([]);
      expect(checklistItems(null, 'en')).toEqual([]);
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
      const tree = [...sampleTree(), node('A', { title: { en: 'Annex', nb: 'Vedlegg' } })];
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

  describe('final API contract', () => {
    it('treats a server-reported not_applicable status as not applicable everywhere', () => {
      const tree = [
        node('8', {
          requirements: [
            req('iso27001-2022:A.8.13.r1', 'covered'),
            req('iso27001-2022:A.8.13.r2', 'not_applicable'),
          ],
        }),
      ];
      expect(tree[0].rollup).toEqual({
        applicable: 1,
        covered: 1,
        partial: 0,
        not_started: 0,
        pct: 100,
      });
      expect(statusTone(effectiveStatus(tree[0].requirements[1]))).toBe('neutral');
      expect(filterTree(tree, 'not_applicable')[0].requirements.map((r) => r.ref)).toEqual([
        'iso27001-2022:A.8.13.r2',
      ]);
      expect(filterTree(tree, 'gaps')).toEqual([]);
      expect(collectGaps(tree)).toEqual([]);
      expect(flattenRequirements(tree, 'iso27001-2022', 'ISO 27001').map((o) => o.ref)).toEqual([
        'iso27001-2022:A.8.13.r1',
      ]);
    });

    it('localizes clause titles in bars, gaps, search and the picker', () => {
      const tree = sampleTree();
      expect(chapterBars(tree, 'nb').map((b) => b.title)).toEqual([
        'Organisasjonens kontekst',
        'Lederskap',
      ]);
      expect(collectGaps(tree, 'nb').map((g) => g.clauseTitle)).toEqual([
        'Klausul 5.1',
        'Interessenter',
      ]);
      expect(allNodeNumbers(filterTree(tree, 'all', 'interessenter', 'nb'))).toEqual(['4', '4.2']);
      const options = flattenRequirements(tree, 'iso9001', 'ISO 9001');
      expect(searchRequirements(options, 'interessenter', 'nb').map((o) => o.ref)).toEqual([
        'r-4.2-a',
      ]);
    });

    it('maps API errors to inline messages', () => {
      const err = (status: number, code?: string) => ({
        status,
        error: code ? { detail: { code, message: 'x' } } : { detail: 'x' },
      });
      expect(standardsErrorKey(err(409, 'standard_not_enabled'), 'map')).toBe(
        'standards.errors.notEnabled',
      );
      expect(standardsErrorKey(err(503), 'map')).toBe('standards.errors.aiUnavailable');
      expect(standardsErrorKey(err(500), 'map')).toBe('standards.job.startFailed');
      expect(standardsErrorKey(err(409, 'no_licensed_pdf'), 'extract')).toBe(
        'standards.errors.noLicensedPdf',
      );
      expect(standardsErrorKey(err(503), 'extract')).toBe('standards.job.startFailed');
      expect(standardsErrorKey(err(422, 'justification_required'), 'save')).toBe(
        'standards.requirement.justificationRequired',
      );
      expect(standardsErrorKey(err(500), 'save')).toBe('standards.requirement.saveError');
      expect(standardsErrorKey(null, 'save')).toBe('standards.requirement.saveError');
    });
  });

  describe('real catalogue shape (excerpt of iso27001-2022, Annex A.5.1)', () => {
    // Mirrors GET standards/iso27001-2022/tree: qualified refs, {en, nb} titles,
    // per-language evidence arrays, theme on the control group and controls.
    const reqApi = (n: number, status: RequirementStatus, en: string[], nb: string[]) =>
      req(`iso27001-2022:A.5.1.r${n}`, status, { evidence_examples: { en, nb } });
    const control = node('A.5.1', {
      title: {
        en: 'Policies for information security',
        nb: 'Retningslinjer for informasjonssikkerhet',
      },
      kind: 'annex_control',
      theme: 'organizational',
      requirements: [
        reqApi(
          1,
          'covered',
          ['Information security policy', 'Topic-specific policies', 'Approval workflow log'],
          [
            'Informasjonssikkerhetspolicy',
            'Temaspesifikke retningslinjer',
            'Logg over godkjenningsflyt',
          ],
        ),
        reqApi(
          2,
          'partial',
          ['Intranet page or employee handbook', 'Policy acknowledgement records'],
          [
            'Intranettside eller personalhåndbok',
            'Kvitteringer for lest og forstått retningslinje',
          ],
        ),
        reqApi(3, 'not_started', ['Version history', 'Management review minutes'], []),
      ],
    });
    const group = node('A.5', {
      title: { en: 'Organizational controls', nb: 'Organisatoriske tiltak' },
      theme: 'organizational',
      children: [control],
    });
    const annex = node('A', {
      title: { en: 'Information security controls reference', nb: 'Referanse for tiltak' },
      children: [group],
    });

    it('rolls up, filters and lists gaps on the real shape', () => {
      expect(annex.rollup).toEqual({
        applicable: 3,
        covered: 1,
        partial: 1,
        not_started: 1,
        pct: 33,
      });
      expect(hasAnnexChildren(group)).toBe(true);
      expect(groupByTheme(group.children).map((g) => g.theme)).toEqual(['organizational']);
      expect(collectGaps([annex], 'nb').map((g) => [g.clauseNumber, g.clauseTitle])).toEqual([
        ['A.5.1', 'Retningslinjer for informasjonssikkerhet'],
        ['A.5.1', 'Retningslinjer for informasjonssikkerhet'],
      ]);
      expect(allNodeNumbers(filterTree([annex], 'all', 'A.5.1'))).toEqual(['A', 'A.5', 'A.5.1']);
    });

    it('renders the evidence checklist from the arrays (no string parsing)', () => {
      const [r1, , r3] = control.requirements;
      expect(checklistItems(r1.evidence_examples, 'nb')).toEqual([
        'Informasjonssikkerhetspolicy',
        'Temaspesifikke retningslinjer',
        'Logg over godkjenningsflyt',
      ]);
      // nb missing for r3 -> English fallback.
      expect(checklistItems(r3.evidence_examples, 'nb')).toEqual([
        'Version history',
        'Management review minutes',
      ]);
    });
  });
});
