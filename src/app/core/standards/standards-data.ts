import type { BadgeTone } from '../../shared/ui/badge/badge';
import {
  ClauseNode,
  ClauseRollup,
  LocalizedList,
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

/**
 * Evidence checklist items in the active language, falling back to English
 * then Norwegian when that language has none. Blank entries are dropped.
 */
export function checklistItems(list: LocalizedList | null | undefined, lang: string): string[] {
  const pick = (items: readonly string[] | undefined): readonly string[] | undefined =>
    Array.isArray(items) && items.length > 0 ? items : undefined;
  const byLang = list as Readonly<Record<string, readonly string[] | undefined>> | null | undefined;
  const items = pick(byLang?.[lang]) ?? pick(list?.en) ?? pick(list?.nb) ?? [];
  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

/**
 * Status shown for a requirement: not applicable when the org marked it so
 * (`applicable: false`) or the server reports `not_applicable`.
 */
export function effectiveStatus(
  req: Pick<Requirement, 'status' | 'applicable'>,
): RequirementStatus {
  return req.applicable ? req.status : 'not_applicable';
}

/** Whether a requirement counts toward completeness (is applicable). */
export function isApplicable(req: Pick<Requirement, 'status' | 'applicable'>): boolean {
  return effectiveStatus(req) !== 'not_applicable';
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
      if (!isApplicable(req)) {
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
      localized(node.title, lang).toLowerCase().includes(q);
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
export function collectGaps(nodes: readonly ClauseNode[], lang = 'en'): GapItem[] {
  const gaps: GapItem[] = [];
  const visit = (node: ClauseNode): void => {
    for (const req of node.requirements) {
      const status = effectiveStatus(req);
      if (status === 'not_started' || status === 'partial') {
        gaps.push({
          requirement: req,
          status,
          clauseNumber: node.number,
          clauseTitle: localized(node.title, lang),
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

export function chapterBars(nodes: readonly ClauseNode[], lang = 'en'): ChapterBar[] {
  return nodes
    .filter((n) => n.rollup.applicable > 0)
    .map((n) => ({
      number: n.number,
      title: localized(n.title, lang),
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
  readonly clauseTitle: LocalizedText;
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
      if (!isApplicable(req)) {
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
      localized(option.clauseTitle, lang),
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

/** "iso27001-2022:A.8.13.r1" → "A.8.13.r1" (display only; the API gets the full ref). */
export function shortRef(ref: string): string {
  const i = ref.indexOf(':');
  return i >= 0 ? ref.slice(i + 1) : ref;
}

/** Whether a requirement has AI suggestions waiting for review. */
export function hasPendingSuggestions(req: Pick<Requirement, 'suggested_links'>): boolean {
  return req.suggested_links.length > 0;
}

/** A standards call whose failure is explained inline. */
export type StandardsOperation = 'map' | 'extract' | 'save' | 'draft';

/** Structured `detail.code` of an API error body, if any. */
function errorCode(error: unknown): string | null {
  const body = (error as { error?: unknown } | null)?.error;
  const detail = (body as { detail?: unknown } | null)?.detail;
  const code = (detail as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

/**
 * i18n key explaining a failed standards call: 409 `standard_not_enabled`
 * (AI mapping), 409 `no_licensed_pdf` (extraction), 503 when AI isn't
 * configured, and 422 `justification_required` (marking a requirement not
 * applicable without a justification). Anything else gets the generic message.
 */
export function standardsErrorKey(error: unknown, op: StandardsOperation): string {
  const status = (error as { status?: unknown } | null)?.status;
  const code = errorCode(error);
  if (code === 'standard_not_enabled') {
    return 'standards.errors.notEnabled';
  }
  if (code === 'no_licensed_pdf') {
    return 'standards.errors.noLicensedPdf';
  }
  if (code === 'justification_required') {
    return 'standards.requirement.justificationRequired';
  }
  if ((op === 'map' || op === 'draft') && status === 503) {
    return 'standards.errors.aiUnavailable';
  }
  return op === 'save' ? 'standards.requirement.saveError' : 'standards.job.startFailed';
}
