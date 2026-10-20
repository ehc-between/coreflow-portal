import { UrlSegment } from '@angular/router';
import { computeRollup } from '../../../core/standards/standards-data';
import {
  ClauseNode,
  Requirement,
  RequirementDetail,
  RequirementLink,
  RequirementStatus,
} from '../../../core/standards/standards.models';
import {
  applyRequirementDetails,
  clauseOfRequirement,
  countGaps,
  filterGaps,
  flattenSections,
  effectiveTocExpansion,
  indexTree,
  isInsideDialog,
  isAtBottom,
  isTypingTarget,
  neighbours,
  pickActiveSection,
  renderUnits,
  sectionDomId,
  sectionPath,
  sectionStatus,
  shortRef,
  shortcutFor,
  toRequirementDetail,
  tocRows,
  treeCompleteness,
  workspaceMatcher,
} from './workspace-data';

function req(ref: string, status: RequirementStatus, over: Partial<Requirement> = {}): Requirement {
  return {
    ref,
    text: { en: `Requirement ${ref}`, nb: `Krav ${ref}` },
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
    title: { en: `Clause ${number}`, nb: `Klausul ${number}` },
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

function control(number: string, theme: string, reqs: Requirement[] = []): ClauseNode {
  return node(number, { kind: 'annex_control', theme, requirements: reqs });
}

/**
 * 0 (intro, no requirements); 4 › 4.1 (covered) + 4.2 (partial + n/a);
 * 6 › 6.1 › 6.1.2 (not started); Annex A › A.5 (organizational) › controls,
 * with A.5.2 listed before a "people" control to check theme grouping order.
 */
function sampleTree(): ClauseNode[] {
  return [
    node('0', { title: { en: 'Introduction', nb: 'Innledning' } }),
    node('4', {
      title: { en: 'Context of the organization', nb: 'Organisasjonens kontekst' },
      children: [
        node('4.1', { requirements: [req('s:4.1.r1', 'covered')] }),
        node('4.2', {
          title: { en: 'Interested parties', nb: 'Interessenter' },
          requirements: [
            req('s:4.2.r1', 'partial'),
            req('s:4.2.r2', 'not_started', { applicable: false, justification: 'n/a' }),
          ],
        }),
      ],
    }),
    node('6', {
      children: [
        node('6.1', {
          children: [node('6.1.2', { requirements: [req('s:6.1.2.r1', 'not_started')] })],
        }),
      ],
    }),
    node('A', {
      title: { en: 'Annex A', nb: 'Vedlegg A' },
      children: [
        node('A.5', {
          theme: 'organizational',
          title: { en: 'Organizational controls', nb: 'Organisatoriske tiltak' },
          children: [
            control('A.5.1', 'organizational', [req('s:A.5.1.r1', 'covered')]),
            control('A.5.9', 'people', [req('s:A.5.9.r1', 'not_started')]),
            control('A.5.2', 'organizational', [req('s:A.5.2.r1', 'partial')]),
          ],
        }),
      ],
    }),
  ];
}

describe('workspace document order', () => {
  it('flattens chapters, sub-clauses and Annex A in reading order, grouping controls by theme', () => {
    const order = flattenSections(sampleTree()).map((s) => s.number);
    expect(order).toEqual([
      '0',
      '4',
      '4.1',
      '4.2',
      '6',
      '6.1',
      '6.1.2',
      'A',
      'A.5',
      'A.5.1',
      'A.5.2',
      'A.5.9',
    ]);
  });

  it('records depth, chapter and a theme heading only where the theme changes from the parent', () => {
    const sections = new Map(flattenSections(sampleTree()).map((s) => [s.number, s]));
    expect(sections.get('6.1.2')).toMatchObject({
      depth: 2,
      chapter: '6',
      branch: '6.1',
      parent: '6.1',
    });
    expect(sections.get('A.5.1')?.themeHeading).toBeNull();
    expect(sections.get('A.5.2')?.themeHeading).toBeNull();
    expect(sections.get('A.5.9')?.themeHeading).toBe('people');
  });

  it('gives previous / next across chapters and into Annex A', () => {
    const order = flattenSections(sampleTree()).map((s) => s.number);
    expect(neighbours(order, '6.1.2')).toEqual({ prev: '6.1', next: 'A' });
    expect(neighbours(order, 'A')).toEqual({ prev: '6.1.2', next: 'A.5' });
    expect(neighbours(order, '0')).toEqual({ prev: null, next: '4' });
    expect(neighbours(order, 'A.5.9')).toEqual({ prev: 'A.5.2', next: null });
    // Unknown / no current section: "next" starts at the top.
    expect(neighbours(order, null)).toEqual({ prev: null, next: '0' });
  });

  it('follows the gap-filtered order when only gaps are shown', () => {
    const reference = new Map(flattenSections(sampleTree()).map((s, i) => [s.number, i] as const));
    const order = flattenSections(filterGaps(sampleTree()), reference).map((s) => s.number);
    expect(order).toEqual(['4', '4.2', '6', '6.1', '6.1.2', 'A', 'A.5', 'A.5.2', 'A.5.9']);
    expect(neighbours(order, '4.2')).toEqual({ prev: '4', next: '6' });
  });

  it('builds the breadcrumb path of a section', () => {
    const index = indexTree(sampleTree());
    expect(sectionPath(index, 'A.5.9')).toEqual(['A', 'A.5', 'A.5.9']);
    expect(sectionPath(index, '4')).toEqual(['4']);
    expect(sectionPath(index, 'nope')).toEqual([]);
    expect(sectionPath(index, null)).toEqual([]);
  });
});

describe('workspace TOC', () => {
  const expandedAll = new Set(['4', '6', '6.1', 'A', 'A.5']);

  it('shows only top-level entries until expanded, with chapter coverage and status dots', () => {
    const rows = tocRows(sampleTree(), { expanded: new Set() });
    expect(rows.map((r) => r.number)).toEqual(['0', '4', '6', 'A']);
    const chapter4 = rows.find((r) => r.number === '4');
    expect(chapter4).toMatchObject({
      hasChildren: true,
      expanded: false,
      status: 'partial',
      pct: 50,
    });
    expect(rows.find((r) => r.number === '0')).toMatchObject({
      status: 'none',
      pct: null,
      hasChildren: false,
    });
    expect(rows.find((r) => r.number === '6')?.status).toBe('not_started');
  });

  it('lists expanded children in document order (no coverage % below chapters)', () => {
    const rows = tocRows(sampleTree(), { expanded: new Set(['4']) });
    expect(rows.map((r) => r.number)).toEqual(['0', '4', '4.1', '4.2', '6', 'A']);
    expect(rows.find((r) => r.number === '4.1')).toMatchObject({
      depth: 1,
      status: 'covered',
      pct: null,
    });
  });

  it('filters by number prefix and shows the path to every match', () => {
    const rows = tocRows(sampleTree(), { expanded: new Set(), query: '6.1' });
    expect(rows.map((r) => r.number)).toEqual(['6', '6.1', '6.1.2']);
    expect(rows.every((r) => r.number === '6.1.2' || r.expanded)).toBe(true);
  });

  it('filters by title in the active language, case-insensitively', () => {
    expect(
      tocRows(sampleTree(), { expanded: new Set(), query: 'INTERESTED', lang: 'en' }).map(
        (r) => r.number,
      ),
    ).toEqual(['4', '4.2']);
    expect(
      tocRows(sampleTree(), { expanded: new Set(), query: 'interessenter', lang: 'nb' }).map(
        (r) => r.number,
      ),
    ).toEqual(['4', '4.2']);
    expect(tocRows(sampleTree(), { expanded: new Set(), query: 'zzz' })).toEqual([]);
  });

  it('limits the TOC to the gap-filtered sections', () => {
    const include = new Set(flattenSections(filterGaps(sampleTree())).map((s) => s.number));
    const rows = tocRows(sampleTree(), { expanded: expandedAll, include });
    expect(rows.map((r) => r.number)).toEqual([
      '4',
      '4.2',
      '6',
      '6.1',
      '6.1.2',
      'A',
      'A.5',
      'A.5.2',
      'A.5.9',
    ]);
  });

  it('combines search and the gap filter', () => {
    const include = new Set(flattenSections(filterGaps(sampleTree())).map((s) => s.number));
    expect(tocRows(sampleTree(), { expanded: new Set(), include, query: '4.1' })).toEqual([]);
    expect(
      tocRows(sampleTree(), { expanded: new Set(), include, query: 'A.5.9' }).map((r) => r.number),
    ).toEqual(['A', 'A.5', 'A.5.9']);
  });

  it('puts a theme heading before the first control of a different theme', () => {
    const rows = tocRows(sampleTree(), { expanded: expandedAll });
    expect(rows.filter((r) => r.themeHeading).map((r) => [r.number, r.themeHeading])).toEqual([
      ['A.5.9', 'people'],
    ]);
  });
});

describe('workspace gap filter', () => {
  it('keeps only gap requirements and the nodes that hold them', () => {
    const filtered = filterGaps(sampleTree());
    const chapter4 = filtered.find((n) => n.number === '4');
    expect(chapter4?.children.map((c) => c.number)).toEqual(['4.2']);
    // The not-applicable requirement is not a gap.
    expect(chapter4?.children[0].requirements.map((r) => r.ref)).toEqual(['s:4.2.r1']);
    // Roll-ups stay those of the full subtree.
    expect(chapter4?.rollup.applicable).toBe(2);
    expect(countGaps(sampleTree())).toBe(4);
  });

  it('keeps requirements the user is working on even once they are covered', () => {
    const tree = applyRequirementDetails(sampleTree(), [
      { ...toRequirementDetail(req('s:4.2.r1', 'covered')) },
    ]);
    expect(filterGaps(tree).find((n) => n.number === '4')).toBeUndefined();
    const kept = filterGaps(tree, new Set(['s:4.2.r1']));
    expect(kept.find((n) => n.number === '4')?.children[0].requirements[0].status).toBe('covered');
  });
});

describe('workspace live roll-ups', () => {
  function link(id: string, status: RequirementLink['status']): RequirementLink {
    return {
      id,
      requirement_ref: 's:6.1.2.r1',
      standard_key: 's',
      clause_number: '6.1.2',
      entity_type: 'document',
      entity_id: `doc-${id}`,
      entity_label: 'Risk method',
      status,
      source: status === 'suggested' ? 'ai' : 'user',
      created_at: '2026-10-01T00:00:00Z',
    };
  }

  it('recomputes the clause, chapter and standard roll-ups from a saved requirement', () => {
    const before = sampleTree();
    expect(treeCompleteness(before)).toEqual({ covered: 2, applicable: 6, pct: 33 });
    const detail: RequirementDetail = {
      ...req('s:6.1.2.r1', 'covered'),
      links: [link('1', 'confirmed'), link('2', 'suggested'), link('3', 'rejected')],
    };
    const after = applyRequirementDetails(before, [detail]);
    const six = after.find((n) => n.number === '6');
    expect(six?.rollup).toMatchObject({ applicable: 1, covered: 1, pct: 100 });
    expect(sectionStatus(six!)).toBe('covered');
    expect(six?.children[0].children[0].requirements[0]).toMatchObject({
      status: 'covered',
      confirmed_links: [expect.objectContaining({ id: '1' })],
      suggested_links: [expect.objectContaining({ id: '2' })],
    });
    expect(treeCompleteness(after)).toEqual({ covered: 3, applicable: 6, pct: 50 });
    // Untouched branches keep their identity (cheap re-render).
    expect(after.find((n) => n.number === '4')).toBe(before.find((n) => n.number === '4'));
    // The TOC reflects it immediately.
    expect(tocRows(after, { expanded: new Set() }).find((r) => r.number === '6')).toMatchObject({
      status: 'covered',
      pct: 100,
    });
  });

  it('marking a requirement not applicable removes it from the denominator', () => {
    const after = applyRequirementDetails(sampleTree(), [
      {
        ...req('s:4.2.r1', 'partial', { applicable: false, justification: 'Out of scope' }),
        links: [],
      },
    ]);
    const four = after.find((n) => n.number === '4');
    expect(four?.rollup).toMatchObject({ applicable: 1, covered: 1, pct: 100 });
    expect(sectionStatus(four!.children[1])).toBe('not_applicable');
  });

  it('finds the clause holding a requirement', () => {
    expect(clauseOfRequirement(sampleTree(), 's:A.5.9.r1')).toBe('A.5.9');
    expect(clauseOfRequirement(sampleTree(), 'missing')).toBeNull();
  });

  it('turns a tree requirement into the card detail shape with its live links', () => {
    const r = req('x', 'partial', {
      confirmed_links: [link('1', 'confirmed')],
      suggested_links: [link('2', 'suggested')],
    });
    expect(toRequirementDetail(r).links.map((l) => l.id)).toEqual(['1', '2']);
  });
});

describe('workspace scroll-spy', () => {
  const position = new Map(['4', '4.1', '4.2', '6'].map((n, i) => [n, i] as const));

  it('picks the last section in document order crossing the reading line', () => {
    expect(pickActiveSection(new Set(['4.1', '4.2']), position, '4')).toBe('4.2');
    expect(pickActiveSection(['6', '4'], position, null)).toBe('6');
  });

  it('keeps the previous section when nothing crosses the line', () => {
    expect(pickActiveSection(new Set(), position, '4.1')).toBe('4.1');
    expect(pickActiveSection(new Set(['unknown']), position, '4.1')).toBe('4.1');
  });

  it('detects the end of the document', () => {
    expect(isAtBottom(600, 400, 1000)).toBe(true);
    expect(isAtBottom(597, 400, 1000)).toBe(true);
    expect(isAtBottom(590, 400, 1000)).toBe(false);
    expect(isAtBottom(500, 400, 1000)).toBe(false);
    expect(isAtBottom(0, 400, 300)).toBe(false);
  });
});

describe('workspace lazy render units', () => {
  it('renders one unit per chapter, splitting chapters above the limit into branches', () => {
    const sections = flattenSections(sampleTree());
    expect(renderUnits(sections).map((u) => u.key)).toEqual(['0', '4', '6', 'A']);
    const split = renderUnits(sections, false, 2);
    expect(split.map((u) => [u.key, u.sections.map((s) => s.number)])).toEqual([
      ['0', ['0']],
      ['4', ['4']],
      ['4/4.1', ['4.1']],
      ['4/4.2', ['4.2']],
      ['6', ['6']],
      ['6/6.1', ['6.1', '6.1.2']],
      ['A', ['A']],
      ['A/A.5', ['A.5', 'A.5.1', 'A.5.2', 'A.5.9']],
    ]);
    expect(split.every((u) => u.estimate > 0)).toBe(true);
  });
});

describe('workspace keyboard shortcuts', () => {
  const key = (k: string, over: Partial<KeyboardEvent> = {}) =>
    shortcutFor({ key: k, altKey: false, ctrlKey: false, metaKey: false, target: null, ...over });

  it('maps j / k / Alt+arrows / slash', () => {
    expect(key('j')).toBe('next');
    expect(key('k')).toBe('prev');
    expect(key('ArrowDown', { altKey: true })).toBe('next');
    expect(key('ArrowUp', { altKey: true })).toBe('prev');
    expect(key('/')).toBe('search');
    expect(key('ArrowDown')).toBeNull();
    expect(key('x')).toBeNull();
  });

  it('ignores keys while typing or with Ctrl / Meta', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    expect(key('j', { target: input })).toBeNull();
    expect(key('/', { target: textarea })).toBeNull();
    expect(key('j', { ctrlKey: true })).toBeNull();
    expect(key('k', { metaKey: true })).toBeNull();
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
  });

  it('ignores held-down navigation keys (auto repeat) but not a repeated slash', () => {
    expect(key('j', { repeat: true })).toBeNull();
    expect(key('k', { repeat: true })).toBeNull();
    expect(key('ArrowDown', { altKey: true, repeat: true })).toBeNull();
    expect(key('/', { repeat: true })).toBe('search');
  });

  it('ignores keys inside dialogs and the evidence picker', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inDialog = document.createElement('button');
    dialog.appendChild(inDialog);
    const alert = document.createElement('div');
    alert.setAttribute('role', 'alertdialog');
    const inAlert = document.createElement('button');
    alert.appendChild(inAlert);
    const picker = document.createElement('app-evidence-picker');
    const inPicker = document.createElement('button');
    picker.appendChild(inPicker);
    expect(key('j', { target: inDialog })).toBeNull();
    expect(key('k', { target: inAlert })).toBeNull();
    expect(key('j', { target: inPicker })).toBeNull();
    expect(isInsideDialog(document.createElement('button'))).toBe(false);
    expect(key('j', { target: document.createElement('button') })).toBe('next');
  });
});

describe('workspace TOC expansion', () => {
  it('opens only the current path on its own and keeps manual choices', () => {
    const none = new Set<string>();
    expect([...effectiveTocExpansion(none, none, ['6', '6.1'])]).toEqual(['6', '6.1']);
    // Moving on closes the old path; a node the user opened stays open.
    expect([...effectiveTocExpansion(new Set(['4']), none, ['A', 'A.5'])].sort()).toEqual([
      '4',
      'A',
      'A.5',
    ]);
    // A path node the user collapsed stays collapsed.
    expect([...effectiveTocExpansion(none, new Set(['A']), ['A', 'A.5'])]).toEqual(['A.5']);
  });
});

describe('workspace routing helpers', () => {
  const seg = (...paths: string[]) => paths.map((p) => new UrlSegment(p, {}));

  it('matches :key and :key/:number but not the legacy clauses path', () => {
    expect(workspaceMatcher(seg('iso27001'))?.posParams?.['key'].path).toBe('iso27001');
    const match = workspaceMatcher(seg('iso27001', 'A.5.1'));
    expect(match?.posParams?.['number'].path).toBe('A.5.1');
    expect(workspaceMatcher(seg('iso27001', 'clauses'))).toBeNull();
    expect(workspaceMatcher(seg('iso27001', 'clauses', '4.1'))).toBeNull();
    expect(workspaceMatcher(seg())).toBeNull();
  });

  it('builds DOM-safe ids and short refs', () => {
    expect(sectionDomId('A.5.1')).toBe('sec-A_5_1');
    expect(shortRef('iso27001-2022:A.8.13.r1')).toBe('A.8.13.r1');
    expect(shortRef('plain')).toBe('plain');
  });
});
