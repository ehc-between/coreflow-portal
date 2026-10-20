import type { BadgeTone } from '../../shared/ui/badge/badge';
import {
  ClauseNode,
  ClauseRollup,
  LocalizedText,
  Requirement,
  RequirementStatus,
} from './standards.models';

/**
 * Pure data shaping for the ISO & standards module: localisation, roll-ups,
 * status filtering, gap lists, Annex A theme grouping and the requirement
 * picker search. Kept free of Angular so it is trivially unit-testable.
 */

/** Requirement statuses in display order. */
export const REQUIREMENT_STATUSES: readonly RequirementStatus[] = [
  'covered',
  'partial',
  'not_started',
  'not_applicable',
];

/** Tree filter: everything, just the gaps (partial + not started), or one status. */
export type StatusFilter = 'all' | 'gaps' | RequirementStatus;

export const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'gaps', ...REQUIREMENT_STATUSES];

/** Pick the active language's copy, falling back to English, then Norwegian. */
export function localized(text: LocalizedText | null | undefined, lang: string): string {
  if (!text) {
    return '';
  }
  const value = (text as unknown as Record<string, string | undefined>)[lang];
  return value || text.en || text.nb || '';
}

/** Split localized multi-line evidence examples into checklist items. */
export function checklistItems(text: LocalizedText | null | undefined, lang: string): string[] {
  return localized(text, lang)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 0);
}

/** Status shown for a requirement: not-applicable wins over the coverage status. */
export function effectiveStatus(
  req: Pick<Requirement, 'status' | 'applicable'>,
): RequirementStatus {
  return req.applicable ? req.status : 'not_applicable';
}

export function statusLabelKey(status: RequirementStatus): string {
  return `standards.status.${status}`;
}

export function statusFilterLabelKey(filter: StatusFilter): string {
  return filter === 'all' || filter === 'gaps'
    ? `standards.filter.${filter}`
    : statusLabelKey(filter);
}

export function statusTone(status: RequirementStatus): BadgeTone {
  switch (status) {
    case 'covered':
      return 'pass';
    case 'partial':
      return 'warn';
    case 'not_started':
      return 'fail';
    default:
      return 'neutral';
  }
}

/** CSS colour token for a completeness percentage. */
export function pctColor(pct: number): string {
  if (pct >= 80) {
    return 'var(--pass)';
  }
  if (pct >= 40) {
    return 'var(--warn)';
  }
  return 'var(--fail)';
}

/** Completeness: the covered share of applicable requirements, floored (matches the API). */
export function completenessPct(covered: number, applicable: number): number {
  if (applicable <= 0) {
    return 0;
  }
  return Math.floor((covered / applicable) * 100);
}

/** Recompute a node's roll-up from its own requirements and its children. */
export function computeRollup(node: Pick<ClauseNode, 'requirements' | 'children'>): ClauseRollup {
  let applicable = 0;
  let covered = 0;
  let partial = 0;
  let notStarted = 0;
  const visit = (n: Pick<ClauseNode, 'requirements' | 'children'>): void => {
    for (const req of n.requirements) {
      if (!req.applicable) {
        continue;
      }
      applicable++;
      if (req.status === 'covered') {
        covered++;
      } else if (req.status === 'partial') {
        partial++;
      } else if (req.status === 'not_started') {
        notStarted++;
      }
    }
    n.children.forEach(visit);
  };
  visit(node);
  return {
    applicable,
    covered,
    partial,
    not_started: notStarted,
    pct: completenessPct(covered, applicable),
  };
}

/**
 * Return a new tree with the requirement `ref` patched and every roll-up on
 * the path recomputed (unchanged branches keep their identity).
 */
export function replaceRequirement(
  nodes: readonly ClauseNode[],
  ref: string,
  patch: Partial<Requirement>,
): ClauseNode[] {
  const visit = (node: ClauseNode): ClauseNode => {
    let changed = false;
    const requirements = node.requirements.map((req) => {
      if (req.ref !== ref) {
        return req;
      }
      changed = true;
      return { ...req, ...patch };
    });
    const children = node.children.map((child) => {
      const next = visit(child);
      if (next !== child) {
        changed = true;
      }
      return next;
    });
    if (!changed) {
      return node;
    }
    const next = { ...node, requirements, children };
    return { ...next, rollup: computeRollup(next) };
  };
  return nodes.map(visit);
}

export function matchesFilter(req: Requirement, filter: StatusFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  const status = effectiveStatus(req);
  if (filter === 'gaps') {
    return status === 'not_started' || status === 'partial';
  }
  return status === filter;
}

/**
 * Prune the tree to the requirements matching `filter` (and, when given, the
 * free-text `query` over clause number / title / requirement text). A node is
 * kept when it, or any descendant, has a match. With no filter and no query the
 * tree is returned unchanged.
 */
export function filterTree(
  nodes: readonly ClauseNode[],
  filter: StatusFilter,
  query = '',
  lang = 'en',
): ClauseNode[] {
  const q = query.trim().toLowerCase();
  if (filter === 'all' && !q) {
    return [...nodes];
  }
  const visit = (node: ClauseNode, parentHit: boolean): ClauseNode | null => {
    const nodeHit =
      parentHit ||
      !q ||
      node.number.toLowerCase().startsWith(q) ||
      node.title.toLowerCase().includes(q);
    const requirements = node.requirements.filter(
      (req) =>
        matchesFilter(req, filter) &&
        (nodeHit || localized(req.text, lang).toLowerCase().includes(q)),
    );
    const children = node.children
      .map((child) => visit(child, nodeHit && !!q))
      .filter((child): child is ClauseNode => child !== null);
    if (requirements.length === 0 && children.length === 0) {
      return null;
    }
    return { ...node, requirements, children };
  };
  return nodes.map((n) => visit(n, false)).filter((n): n is ClauseNode => n !== null);
}

/** Natural ordering for clause numbers ("4.2" < "4.10", "10" < "A.5"). */
export function compareClauseNumbers(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

/** A requirement still missing evidence, with where it lives. */
export interface GapItem {
  readonly requirement: Requirement;
  readonly status: RequirementStatus;
  readonly clauseNumber: string;
  readonly clauseTitle: string;
}

/**
 * Every applicable requirement that is not started or only partially covered —
 * not-started first, then by clause number.
 */
export function collectGaps(nodes: readonly ClauseNode[]): GapItem[] {
  const gaps: GapItem[] = [];
  const visit = (node: ClauseNode): void => {
    for (const req of node.requirements) {
      const status = effectiveStatus(req);
      if (status === 'not_started' || status === 'partial') {
        gaps.push({
          requirement: req,
          status,
          clauseNumber: node.number,
          clauseTitle: node.title,
        });
      }
    }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  const rank = (s: RequirementStatus): number => (s === 'not_started' ? 0 : 1);
  return gaps.sort(
    (a, b) =>
      rank(a.status) - rank(b.status) || compareClauseNumbers(a.clauseNumber, b.clauseNumber),
  );
}

/** Whether a node's children are Annex A controls (rendered grouped by theme). */
export function hasAnnexChildren(node: ClauseNode): boolean {
  return node.children.length > 0 && node.children.every((c) => c.kind === 'annex_control');
}

export interface ThemeGroup {
  /** The theme, or '' for controls without one. */
  readonly theme: string;
  readonly nodes: readonly ClauseNode[];
}

/** Group sibling nodes by theme, in first-appearance order. */
export function groupByTheme(nodes: readonly ClauseNode[]): ThemeGroup[] {
  const groups = new Map<string, ClauseNode[]>();
  for (const node of nodes) {
    const theme = node.theme ?? '';
    const list = groups.get(theme);
    if (list) {
      list.push(node);
    } else {
      groups.set(theme, [node]);
    }
  }
  return [...groups.entries()].map(([theme, list]) => ({ theme, nodes: list }));
}

/** One bar per top-level chapter that has applicable requirements. */
export interface ChapterBar {
  readonly number: string;
  readonly title: string;
  readonly pct: number;
  readonly applicable: number;
  readonly covered: number;
}

export function chapterBars(nodes: readonly ClauseNode[]): ChapterBar[] {
  return nodes
    .filter((n) => n.rollup.applicable > 0)
    .map((n) => ({
      number: n.number,
      title: n.title,
      pct: n.rollup.pct,
      applicable: n.rollup.applicable,
      covered: n.rollup.covered,
    }));
}

/** Every clause number in the tree (for "expand all"). */
export function allNodeNumbers(nodes: readonly ClauseNode[]): string[] {
  const out: string[] = [];
  const visit = (node: ClauseNode): void => {
    out.push(node.number);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

/** A requirement flattened for the "link to requirement" picker. */
export interface RequirementOption {
  readonly ref: string;
  readonly standardKey: string;
  readonly standardName: string;
  readonly clauseNumber: string;
  readonly clauseTitle: string;
  readonly text: LocalizedText;
}

export function flattenRequirements(
  nodes: readonly ClauseNode[],
  standardKey: string,
  standardName: string,
): RequirementOption[] {
  const out: RequirementOption[] = [];
  const visit = (node: ClauseNode): void => {
    for (const req of node.requirements) {
      if (!req.applicable) {
        continue;
      }
      out.push({
        ref: req.ref,
        standardKey,
        standardName,
        clauseNumber: node.number,
        clauseTitle: node.title,
        text: req.text,
      });
    }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

/**
 * Search requirement options by clause number prefix, clause title, standard
 * name or requirement text (all terms must match). Excludes `exclude` refs.
 */
export function searchRequirements(
  options: readonly RequirementOption[],
  query: string,
  lang: string,
  exclude: ReadonlySet<string> = new Set(),
  limit = 20,
): RequirementOption[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits: RequirementOption[] = [];
  for (const option of options) {
    if (exclude.has(option.ref)) {
      continue;
    }
    const haystack = [
      option.clauseNumber,
      option.clauseTitle,
      option.standardName,
      localized(option.text, lang),
    ]
      .join(' ')
      .toLowerCase();
    if (terms.every((t) => haystack.includes(t))) {
      hits.push(option);
      if (hits.length >= limit) {
        break;
      }
    }
  }
  return hits;
}
