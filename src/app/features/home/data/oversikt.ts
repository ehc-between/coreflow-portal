import { hasAnyPermission } from '../../../core/auth/permission';
import { clauseLabel, splitUrl, Translate } from '../../dashboard/data/home-format';
import {
  FrameworkStatus,
  MyWorkSummary,
  NextAction,
  QuickAction,
} from '../../dashboard/data/home.models';

/**
 * Pure helpers of the Oversikt page (IA v2 §5.1). Kept free of Angular so the rules
 * (what counts as "this week", which tiles show, which deadlines) are unit-tested.
 */

/** Rows shown in "Dette bør du gjøre nå". */
export const MAX_TODO = 5;
/** Rows shown in "Snart frist". */
export const MAX_DEADLINES = 3;
/** How far ahead "Snart frist" looks. */
export const DEADLINE_DAYS = 30;

export type Tone = 'bad' | 'warn' | 'info' | 'ok';

// --- greeting --------------------------------------------------------------------------

/** "God morgen" 05–10, "God dag" 10–17, "God kveld" 17–05 (local hour 0–23). */
export function greetingKey(hour: number): string {
  if (hour >= 5 && hour < 10) {
    return 'home.oversikt.greeting.morning';
  }
  if (hour >= 10 && hour < 17) {
    return 'home.oversikt.greeting.day';
  }
  return 'home.oversikt.greeting.evening';
}

/** What the caller has to do this week: overdue + due this week + waiting for their review. */
export function weekCount(work: MyWorkSummary | null | undefined): number {
  if (!work) {
    return 0;
  }
  return work.overdue + work.due_this_week + work.awaiting_review;
}

/** The summary sentence under the greeting (key + params). */
export function summaryKey(count: number): { key: string; params: Record<string, unknown> } {
  if (count === 0) {
    return { key: 'home.oversikt.summary.none', params: {} };
  }
  return count === 1
    ? { key: 'home.oversikt.summary.one', params: {} }
    : { key: 'home.oversikt.summary.many', params: { count } };
}

/** The most urgent action is named in the summary only when it is high priority. */
export function isUrgent(action: NextAction | null | undefined): boolean {
  return !!action && action.priority <= 1;
}

// --- to-do -----------------------------------------------------------------------------

/** Severity dot of a to-do row: overdue/urgent red, soon amber, the rest blue. */
export function actionTone(action: NextAction): Tone {
  if (action.priority === 0 && action.kind === 'overdue') {
    return 'bad';
  }
  if (action.priority <= 2) {
    return 'warn';
  }
  return 'info';
}

/**
 * Requirement chips of an action (shown only with "Vis krav"): an explicit
 * `requirement_refs` list when the API sends one, else the gap's own clause.
 */
export function actionRefs(action: NextAction, t: Translate): string[] {
  const explicit = (action as NextAction & { requirement_refs?: readonly string[] })
    .requirement_refs;
  if (explicit?.length) {
    return explicit.map((ref) => clauseLabel(ref, t));
  }
  const framework = action.params['framework'];
  const number = action.params['number'];
  if (action.kind === 'gap' && typeof framework === 'string' && typeof number === 'string') {
    return [clauseLabel(`${framework}:${number}`, t)];
  }
  return [];
}

// --- quick actions ---------------------------------------------------------------------

export interface QuickTile {
  readonly key: string;
  readonly path: string;
  readonly query: Record<string, string>;
  /** Glyph in the tile's icon square (prototype: ! + ¶ ↓). */
  readonly glyph: string;
  readonly labelKey: string;
  readonly hintKey: string | null;
}

interface TileDef extends QuickTile {
  readonly module?: string;
  readonly permission?: string | readonly string[];
}

/** The prototype's four tiles; one the caller cannot use is replaced from `quick_actions`. */
const TILES: readonly TileDef[] = [
  {
    key: 'speakUp',
    path: '/speak-up',
    query: {},
    glyph: '!',
    labelKey: 'home.oversikt.quick.speakUp.label',
    hintKey: 'home.oversikt.quick.speakUp.hint',
  },
  {
    key: 'supplier',
    path: '/suppliers/new',
    query: {},
    glyph: '+',
    labelKey: 'home.oversikt.quick.supplier.label',
    hintKey: 'home.oversikt.quick.supplier.hint',
    module: 'suppliers',
    permission: 'suppliers:write',
  },
  {
    key: 'policy',
    path: '/documents/new',
    query: { type: 'policy' },
    glyph: '¶',
    labelKey: 'home.oversikt.quick.policy.label',
    hintKey: 'home.oversikt.quick.policy.hint',
    module: 'documents',
    permission: 'documents:draft',
  },
  {
    key: 'report',
    path: '/reports',
    query: {},
    glyph: '↓',
    labelKey: 'home.oversikt.quick.report.label',
    hintKey: 'home.oversikt.quick.report.hint',
  },
];

/** Hints for the API's quick actions (`home.quick.<key>` labels them). */
const FALLBACK_HINTS: Record<string, string> = {
  report_issue: 'home.oversikt.quick.fallbackHints.report_issue',
  suggest_improvement: 'home.oversikt.quick.fallbackHints.suggest_improvement',
  find_document: 'home.oversikt.quick.fallbackHints.find_document',
  prepare_audit: 'home.oversikt.quick.fallbackHints.prepare_audit',
  export_document: 'home.oversikt.quick.fallbackHints.export_document',
  audit_pack: 'home.oversikt.quick.fallbackHints.audit_pack',
  standards: 'home.oversikt.quick.fallbackHints.standards',
};

/**
 * The four quick-action tiles. A prototype tile whose module is off or permission
 * missing is replaced by the next API quick action not already covered.
 */
export function quickTiles(
  permissions: readonly string[],
  isEnabled: (module: string) => boolean,
  apiActions: readonly QuickAction[],
): QuickTile[] {
  const usable = (t: TileDef) =>
    (!t.module || isEnabled(t.module)) &&
    (!t.permission || hasAnyPermission(permissions, t.permission));
  const taken = new Set(TILES.filter(usable).map((t) => t.path));
  const spare = apiActions
    .filter((a) => !a.module || isEnabled(a.module))
    .filter((a) => !taken.has(splitUrl(a.url).path) && a.key !== 'report_issue');
  const out: QuickTile[] = [];
  for (const tile of TILES) {
    if (usable(tile)) {
      out.push(strip(tile));
      continue;
    }
    const next = spare.shift();
    if (next) {
      const link = splitUrl(next.url);
      out.push({
        key: next.key,
        path: link.path,
        query: link.query,
        glyph: '→',
        labelKey: `home.quick.${next.key}`,
        hintKey: FALLBACK_HINTS[next.key] ?? null,
      });
    }
  }
  return out;
}

function strip(t: TileDef): QuickTile {
  return {
    key: t.key,
    path: t.path,
    query: t.query,
    glyph: t.glyph,
    labelKey: t.labelKey,
    hintKey: t.hintKey,
  };
}

// --- deadlines -------------------------------------------------------------------------

/** The fields of a calendar item (`GET /reports/calendar`) the page uses. */
export interface DeadlineItem {
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly due_at: string;
  readonly url: string | null;
  readonly overdue: boolean;
  readonly state?: string;
  readonly label_key: string | null;
  readonly owner?: { readonly name?: string | null } | null;
}

/** Upcoming (not overdue: those are in the to-do) deadlines, soonest first. */
export function upcomingDeadlines(
  items: readonly DeadlineItem[],
  max = MAX_DEADLINES,
): DeadlineItem[] {
  return items
    .filter((i) => !i.overdue && i.state !== 'overdue')
    .slice()
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .slice(0, max);
}

/** The date tile of a naive-UTC ISO datetime: "27" / "nov" in the UI language. */
export function dateTile(iso: string, lang: string): { day: string; month: string } {
  const date = new Date(iso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) {
    return { day: '', month: '' };
  }
  const locale = lang === 'nb' ? 'nb-NO' : 'en-GB';
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: new Intl.DateTimeFormat(locale, { month: 'short' })
      .format(date)
      .replace('.', '')
      .slice(0, 3),
  };
}

/** `[from, to)` ISO dates for the "Snart frist" calendar call. */
export function deadlineWindow(now: Date, days = DEADLINE_DAYS): { from: string; to: string } {
  const to = new Date(now.getTime() + days * 86_400_000);
  return { from: now.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// --- standards -------------------------------------------------------------------------

/** Bar colour: green ≥ 80, amber 50–79, red < 50. */
export function barTone(percent: number): Tone {
  if (percent >= 80) {
    return 'ok';
  }
  return percent >= 50 ? 'warn' : 'bad';
}

/** Target standards first (every standard when none is a target). */
export function shownStandards(
  frameworks: readonly FrameworkStatus[],
  showAll: boolean,
): { shown: FrameworkStatus[]; hidden: number } {
  const targets = frameworks.filter((f) => f.is_target !== false);
  if (showAll || !targets.length) {
    return { shown: [...frameworks], hidden: 0 };
  }
  return { shown: targets, hidden: frameworks.length - targets.length };
}
