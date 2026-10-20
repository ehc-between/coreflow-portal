import { UrlMatchResult, UrlSegment } from '@angular/router';
import {
  completenessPct,
  effectiveStatus,
  groupByTheme,
  hasAnnexChildren,
  localized,
  replaceRequirement,
} from '../../../core/standards/standards-data';
import {
  ClauseNode,
  LocalizedText,
  Requirement,
  RequirementDetail,
  RequirementStatus,
} from '../../../core/standards/standards.models';

/**
 * Pure data shaping for the standards workspace (one document-style page per
 * standard): document order, the table of contents, the gap filter, lazy
 * render units, scroll-spy selection, keyboard shortcuts and live roll-ups.
 * Kept free of Angular DI so every rule is unit-testable.
 */

// --- Document order -----------------------------------------------------------

/**
 * A node's children in reading order. Annex A controls are grouped by theme
 * (first-appearance order), exactly as the TOC and the document render them.
 */
export function orderedChildren(node: ClauseNode): readonly ClauseNode[] {
  return hasAnnexChildren(node)
    ? groupByTheme(node.children).flatMap((g) => g.nodes)
    : node.children;
}

/**
 * For the Annex A controls under `parent` (in reading order): the theme
 * heading to show before each control that starts a new theme group. Only
 * themes that differ from the parent's own theme get a heading (A.5
 * "Organizational controls" doesn't repeat it above its own controls), and
 * only controls are grouped (A.5–A.8 carry their theme in their title).
 */
export function themeHeadings(
  parent: ClauseNode,
  children: readonly Pick<ClauseNode, 'number' | 'theme'>[],
): Map<string, string> {
  const out = new Map<string, string>();
  if (!hasAnnexChildren(parent)) {
    return out;
  }
  let last: string | null = null;
  for (const child of children) {
    const theme = child.theme ?? '';
    if (theme !== last && theme && theme !== (parent.theme ?? '')) {
      out.set(child.number, theme);
    }
    last = theme;
  }
  return out;
}

/** One section of the continuous document. */
export interface SectionView {
  readonly number: string;
  /** The (possibly gap-filtered) node; its roll-up always covers the full subtree. */
  readonly node: ClauseNode;
  readonly depth: number;
  /** Top-level chapter number ("4", "A"). */
  readonly chapter: string;
  /** Depth-1 ancestor (or the node itself at depth ≤ 1) — used to split huge chapters. */
  readonly branch: string;
  readonly parent: string | null;
  /** Annex A theme heading rendered before this section, if it starts a theme group. */
  readonly themeHeading: string | null;
}

/**
 * Flatten the tree into sections in document order (chapters 0–10, then
 * Annex A). For a filtered tree pass the full tree's `reference` positions,
 * so theme grouping can't reorder controls once some are filtered out.
 */
export function flattenSections(
  nodes: readonly ClauseNode[],
  reference?: ReadonlyMap<string, number>,
): SectionView[] {
  const out: SectionView[] = [];
  const pos = (n: ClauseNode): number => reference?.get(n.number) ?? 0;
  const visit = (
    node: ClauseNode,
    depth: number,
    chapter: string,
    branch: string,
    parent: string | null,
    themeHeading: string | null,
  ): void => {
    out.push({ number: node.number, node, depth, chapter, branch, parent, themeHeading });
    const children = reference
      ? [...orderedChildren(node)].sort((a, b) => pos(a) - pos(b))
      : orderedChildren(node);
    const headings = themeHeadings(node, children);
    for (const child of children) {
      visit(
        child,
        depth + 1,
        chapter,
        depth === 0 ? child.number : branch,
        node.number,
        headings.get(child.number) ?? null,
      );
    }
  };
  nodes.forEach((n) => visit(n, 0, n.number, n.number, null, null));
  return out;
}

/** Every node of the tree by number, with its parent — for breadcrumbs and titles. */
export interface TreeIndex {
  readonly nodes: ReadonlyMap<string, ClauseNode>;
  readonly parents: ReadonlyMap<string, string | null>;
}

export function indexTree(nodes: readonly ClauseNode[]): TreeIndex {
  const map = new Map<string, ClauseNode>();
  const parents = new Map<string, string | null>();
  const visit = (node: ClauseNode, parent: string | null): void => {
    map.set(node.number, node);
    parents.set(node.number, parent);
    node.children.forEach((c) => visit(c, node.number));
  };
  nodes.forEach((n) => visit(n, null));
  return { nodes: map, parents };
}

/** Numbers from the top-level chapter down to `number` (inclusive); [] when unknown. */
export function sectionPath(index: TreeIndex, number: string | null): string[] {
  if (!number || !index.nodes.has(number)) {
    return [];
  }
  const path: string[] = [];
  let current: string | null = number;
  while (current) {
    path.unshift(current);
    current = index.parents.get(current) ?? null;
  }
  return path;
}

/** Previous / next section in document order (null at either end or when unknown). */
export function neighbours(
  order: readonly string[],
  current: string | null,
): { prev: string | null; next: string | null } {
  const i = current ? order.indexOf(current) : -1;
  if (i < 0) {
    return { prev: null, next: order[0] ?? null };
  }
  return { prev: order[i - 1] ?? null, next: order[i + 1] ?? null };
}

// --- Status & completeness ---------------------------------------------------

/** Status dot of a TOC node; 'none' when the subtree has no requirements at all. */
export type SectionStatus = RequirementStatus | 'none';

function hasRequirements(node: ClauseNode): boolean {
  return node.requirements.length > 0 || node.children.some(hasRequirements);
}

/**
 * Aggregate status of a subtree: covered when every applicable requirement is
 * covered, partial when some progress exists, not started when none, not
 * applicable when nothing applies.
 */
export function sectionStatus(node: ClauseNode): SectionStatus {
  if (!hasRequirements(node)) {
    return 'none';
  }
  const { applicable, covered, partial } = node.rollup;
  if (applicable === 0) {
    return 'not_applicable';
  }
  if (covered === applicable) {
    return 'covered';
  }
  return covered + partial > 0 ? 'partial' : 'not_started';
}

/** Whole-standard completeness from the (live) tree. */
export function treeCompleteness(nodes: readonly ClauseNode[]): {
  covered: number;
  applicable: number;
  pct: number;
} {
  let covered = 0;
  let applicable = 0;
  for (const node of nodes) {
    covered += node.rollup.covered;
    applicable += node.rollup.applicable;
  }
  return { covered, applicable, pct: completenessPct(covered, applicable) };
}

/** Number of gap requirements (applicable, not started or partial) in the tree. */
export function countGaps(nodes: readonly ClauseNode[]): number {
  let count = 0;
  const visit = (node: ClauseNode): void => {
    count += node.requirements.filter(isGap).length;
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return count;
}

export function isGap(req: Pick<Requirement, 'status' | 'applicable'>): boolean {
  const status = effectiveStatus(req);
  return status === 'not_started' || status === 'partial';
}

// --- Gap filter ----------------------------------------------------------------

/**
 * Prune the tree to gap requirements. Requirements in `keep` stay visible even
 * once they are no longer gaps, so a row the user is working on doesn't vanish
 * under them the moment they save it. Roll-ups are left as they are (full).
 */
export function filterGaps(
  nodes: readonly ClauseNode[],
  keep: ReadonlySet<string> = new Set(),
): ClauseNode[] {
  const visit = (node: ClauseNode): ClauseNode | null => {
    const requirements = node.requirements.filter((r) => isGap(r) || keep.has(r.ref));
    const children = node.children
      .map(visit)
      .filter((child): child is ClauseNode => child !== null);
    if (requirements.length === 0 && children.length === 0) {
      return null;
    }
    return { ...node, requirements, children };
  };
  return nodes.map(visit).filter((n): n is ClauseNode => n !== null);
}

// --- Table of contents ---------------------------------------------------------

export interface TocRow {
  readonly number: string;
  readonly depth: number;
  readonly title: LocalizedText;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  readonly status: SectionStatus;
  /** Coverage % — chapters (top level) with applicable requirements only. */
  readonly pct: number | null;
  /** Annex A theme heading shown above this row. */
  readonly themeHeading: string | null;
}

export interface TocOptions {
  /** Expanded node numbers (ignored while searching: matches show their path). */
  readonly expanded: ReadonlySet<string>;
  /** Search by number prefix or title (active language). */
  readonly query?: string;
  readonly lang?: string;
  /** When set (gap filter), only these node numbers are shown. */
  readonly include?: ReadonlySet<string> | null;
}

/**
 * The visible TOC rows, flattened in document order. Without a query a row's
 * children appear when it is expanded. With a query, a node is shown when it
 * or a descendant matches, and every path to a match is shown expanded.
 */
export function tocRows(nodes: readonly ClauseNode[], options: TocOptions): TocRow[] {
  const q = (options.query ?? '').trim().toLowerCase();
  const lang = options.lang ?? 'en';
  const include = options.include ?? null;

  const build = (node: ClauseNode, depth: number, themeHeading: string | null): TocRow[] | null => {
    if (include && !include.has(node.number)) {
      return null;
    }
    const children = orderedChildren(node).filter((c) => !include || include.has(c.number));
    const headings = themeHeadings(node, children);
    const childRows: TocRow[][] = [];
    for (const child of children) {
      const rows = build(child, depth + 1, headings.get(child.number) ?? null);
      if (rows) {
        childRows.push(rows);
      }
    }
    const selfHit =
      !q ||
      node.number.toLowerCase().startsWith(q) ||
      localized(node.title, lang).toLowerCase().includes(q);
    if (!selfHit && childRows.length === 0) {
      return null;
    }
    const expanded = q ? childRows.length > 0 : options.expanded.has(node.number);
    const row: TocRow = {
      number: node.number,
      depth,
      title: node.title,
      hasChildren: childRows.length > 0,
      expanded: expanded && childRows.length > 0,
      status: sectionStatus(node),
      pct: depth === 0 && node.rollup.applicable > 0 ? node.rollup.pct : null,
      themeHeading,
    };
    return row.expanded ? [row, ...childRows.flat()] : [row];
  };

  return nodes.flatMap((n) => build(n, 0, null) ?? []);
}

// --- Lazy rendering ------------------------------------------------------------

/** A run of consecutive sections rendered (or held back) together. */
export interface RenderUnit {
  readonly key: string;
  readonly sections: readonly SectionView[];
  /** Placeholder height (px) while not rendered. */
  readonly estimate: number;
}

/** Above this many sections a chapter is split into its depth-1 branches. */
export const MAX_UNIT_SECTIONS = 40;

/** Rough rendered height of a section, so placeholders keep the scrollbar honest. */
export function estimateSectionHeight(section: SectionView, hasLicensedText = false): number {
  const summaryChars = Math.max(
    section.node.summary?.en.length ?? 0,
    section.node.summary?.nb.length ?? 0,
  );
  const summaryLines = Math.ceil(summaryChars / 92);
  return (
    88 + // heading + spacing
    summaryLines * 26 +
    (section.node.guidance ? 40 : 0) +
    (hasLicensedText ? 44 : 0) +
    section.node.requirements.length * 66 +
    52 // prev / next row
  );
}

/**
 * Group sections into render units: one per top-level chapter, or — for a
 * chapter with more than `max` sections (Annex A) — the chapter heading plus
 * one unit per depth-1 branch.
 */
export function renderUnits(
  sections: readonly SectionView[],
  hasLicensedText = false,
  max = MAX_UNIT_SECTIONS,
): RenderUnit[] {
  const chapterSize = new Map<string, number>();
  for (const s of sections) {
    chapterSize.set(s.chapter, (chapterSize.get(s.chapter) ?? 0) + 1);
  }
  const units: { key: string; sections: SectionView[]; estimate: number }[] = [];
  for (const s of sections) {
    const split = (chapterSize.get(s.chapter) ?? 0) > max;
    const key = split && s.depth > 0 ? `${s.chapter}/${s.branch}` : s.chapter;
    const last = units[units.length - 1];
    const height = estimateSectionHeight(s, hasLicensedText);
    if (last && last.key === key) {
      last.sections.push(s);
      last.estimate += height;
    } else {
      units.push({ key, sections: [s], estimate: height });
    }
  }
  return units;
}

// --- Scroll-spy ----------------------------------------------------------------

/**
 * The active section from the sections currently crossing the reading line:
 * the last of them in document order (a section that just started under the
 * line wins over the tail of the previous one). Keeps `previous` when nothing
 * crosses the line (e.g. in the gap between two sections).
 */
export function pickActiveSection(
  crossing: Iterable<string>,
  position: ReadonlyMap<string, number>,
  previous: string | null,
): string | null {
  let best: string | null = null;
  let bestPos = -1;
  for (const number of crossing) {
    const pos = position.get(number);
    if (pos !== undefined && pos > bestPos) {
      best = number;
      bestPos = pos;
    }
  }
  return best ?? previous;
}

/** Whether a scroll container is scrolled (practically) to its end. */
export function isAtBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  slack = 4,
): boolean {
  return scrollHeight > clientHeight && scrollTop + clientHeight >= scrollHeight - slack;
}

// --- Keyboard shortcuts --------------------------------------------------------

export type WorkspaceShortcut = 'next' | 'prev' | 'search';

/** Whether a key event comes from somewhere the user types (shortcuts stay off). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { isContentEditable?: boolean }) | null;
  if (!el || typeof el !== 'object' || !('tagName' in el)) {
    return false;
  }
  const tag = String(el.tagName).toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
}

/** Places where workspace shortcuts never apply: dialogs and the evidence picker. */
const SHORTCUT_FREE_ZONES = '[role="dialog"], [role="alertdialog"], app-evidence-picker';

/** Whether a key event comes from inside a dialog or the evidence picker. */
export function isInsideDialog(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return !!el && typeof el.closest === 'function' && el.closest(SHORTCUT_FREE_ZONES) !== null;
}

/**
 * Workspace shortcut for a keydown: `j` / Alt+↓ next section, `k` / Alt+↑
 * previous, `/` focus the TOC search. Ignored while typing, inside dialogs or
 * the evidence picker, and with Ctrl/Meta. A held-down navigation key (auto
 * repeat) is ignored, so it can't flood the history with one entry per repeat.
 */
export function shortcutFor(
  event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'target'> & {
    readonly repeat?: boolean;
  },
): WorkspaceShortcut | null {
  if (
    event.ctrlKey ||
    event.metaKey ||
    isTypingTarget(event.target) ||
    isInsideDialog(event.target)
  ) {
    return null;
  }
  let shortcut: WorkspaceShortcut | null = null;
  if (event.altKey) {
    shortcut = event.key === 'ArrowDown' ? 'next' : event.key === 'ArrowUp' ? 'prev' : null;
  } else if (event.key === 'j') {
    shortcut = 'next';
  } else if (event.key === 'k') {
    shortcut = 'prev';
  } else if (event.key === '/') {
    shortcut = 'search';
  }
  if (event.repeat && (shortcut === 'next' || shortcut === 'prev')) {
    return null;
  }
  return shortcut;
}

// --- TOC expansion ------------------------------------------------------------

/**
 * Expanded TOC nodes: only the path to the current section opens on its own;
 * nodes the user expanded stay open, and path nodes the user collapsed stay
 * collapsed (until the reader leaves that path).
 */
export function effectiveTocExpansion(
  userExpanded: ReadonlySet<string>,
  userCollapsed: ReadonlySet<string>,
  activePath: readonly string[],
): Set<string> {
  const out = new Set(userExpanded);
  activePath.forEach((n) => out.add(n));
  userCollapsed.forEach((n) => out.delete(n));
  return out;
}

// --- Live updates --------------------------------------------------------------

/** A tree requirement as the requirement card's detail shape (its live links). */
export function toRequirementDetail(req: Requirement): RequirementDetail {
  return { ...req, links: [...req.confirmed_links, ...req.suggested_links] };
}

/** The tree fields a requirement detail from the API updates. */
export function requirementPatchFromDetail(detail: RequirementDetail): Partial<Requirement> {
  const patch: Partial<Requirement> = {
    status: detail.status,
    applicable: detail.applicable,
    justification: detail.justification,
    status_override: detail.status_override,
    note: detail.note,
  };
  if (!Array.isArray(detail.links)) {
    return patch;
  }
  return {
    ...patch,
    confirmed_links: detail.links.filter((l) => l.status === 'confirmed'),
    suggested_links: detail.links.filter((l) => l.status === 'suggested'),
  };
}

/**
 * Apply requirement details from the API to the tree; every roll-up on the
 * affected paths is recomputed client-side (TOC dots + coverage update live).
 */
export function applyRequirementDetails(
  nodes: readonly ClauseNode[],
  details: readonly RequirementDetail[],
): ClauseNode[] {
  return details.reduce<ClauseNode[]>(
    (tree, detail) => replaceRequirement(tree, detail.ref, requirementPatchFromDetail(detail)),
    [...nodes],
  );
}

/** The clause number that holds requirement `ref`, or null. */
export function clauseOfRequirement(nodes: readonly ClauseNode[], ref: string): string | null {
  for (const node of nodes) {
    if (node.requirements.some((r) => r.ref === ref)) {
      return node.number;
    }
    const inChild = clauseOfRequirement(node.children, ref);
    if (inChild) {
      return inChild;
    }
  }
  return null;
}

// --- Routing & DOM ids ---------------------------------------------------------

/**
 * Matches the workspace URLs `:key` and `:key/:number` with one route config,
 * so moving between sections reuses the component instead of recreating it.
 */
export function workspaceMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length === 1) {
    return { consumed: segments, posParams: { key: segments[0] } };
  }
  if (segments.length === 2 && segments[1].path !== 'clauses') {
    return { consumed: segments, posParams: { key: segments[0], number: segments[1] } };
  }
  return null;
}

/** DOM id of a section (clause numbers contain dots). */
export function sectionDomId(number: string): string {
  return `sec-${number.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/** DOM id of a TOC entry. */
export function tocDomId(number: string): string {
  return `toc-${number.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/** "iso27001-2022:A.8.13.r1" → "A.8.13.r1" (display only; the API gets the full ref). */
export function shortRef(ref: string): string {
  const i = ref.indexOf(':');
  return i >= 0 ? ref.slice(i + 1) : ref;
}
