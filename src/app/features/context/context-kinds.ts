import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../core/http/error.interceptor';
import { Tone, ToneMeaning } from '../../shared/ui/tones';
import {
  AddressedStatus,
  AnalysisMethod,
  ContextKind,
  ControlledStatus,
  FRAMEWORK_KEYS,
  Level,
  PESTLE_CATEGORIES,
  PartyPriority,
  REVIEW_INTERVALS,
  SWOT_CATEGORIES,
} from './data/context.models';

/** Static description of one M01 record kind (route segment, entity type, features). */
export interface KindConfig {
  readonly kind: ContextKind;
  /** API and portal path segment (`/context/<segment>`). */
  readonly segment: string;
  /** Polymorphic entity type (links, comments, timeline, revisions, tasks). */
  readonly entityType: string;
  /** Uses the approval lifecycle (draft -> in review -> approved -> retired). */
  readonly controlled: boolean;
  /** Guidance page key prefix (`<kind>-list`, `<kind>-detail`, `<kind>-form`). */
  readonly guidance: string;
  /** Field holding the record's display name. */
  readonly titleField: 'title' | 'name';
  /** Record code prefix (`POL-3`), used in the search placeholder. */
  readonly codePrefix: string;
  /** The lesson offered in the help strip of this register's pages. */
  readonly lesson: string;
}

export const KINDS: Readonly<Record<ContextKind, KindConfig>> = {
  analysis: {
    kind: 'analysis',
    segment: 'analyses',
    entityType: 'context_analysis',
    controlled: true,
    guidance: 'analyses',
    titleField: 'title',
    codePrefix: 'CTX',
    lesson: 'context-foundation',
  },
  party: {
    kind: 'party',
    segment: 'interested-parties',
    entityType: 'interested_party',
    controlled: false,
    guidance: 'parties',
    titleField: 'name',
    codePrefix: 'IP',
    lesson: 'interested-parties',
  },
  scope: {
    kind: 'scope',
    segment: 'scopes',
    entityType: 'scope_statement',
    controlled: true,
    guidance: 'scopes',
    titleField: 'title',
    codePrefix: 'SCOPE',
    lesson: 'context-foundation',
  },
  policy: {
    kind: 'policy',
    segment: 'policies',
    entityType: 'policy',
    controlled: true,
    guidance: 'policies',
    titleField: 'title',
    codePrefix: 'POL',
    lesson: 'policies-and-raci',
  },
  responsibility: {
    kind: 'responsibility',
    segment: 'responsibilities',
    entityType: 'responsibility',
    controlled: false,
    guidance: 'responsibilities',
    titleField: 'title',
    codePrefix: 'RACI',
    lesson: 'policies-and-raci',
  },
};

export const KIND_ORDER: readonly ContextKind[] = [
  'analysis',
  'party',
  'scope',
  'policy',
  'responsibility',
];

/** The kind of an entity type (`policy` -> `policy`, `interested_party` -> `party`). */
export function kindOfEntityType(entityType: string): ContextKind | null {
  return KIND_ORDER.find((kind) => KINDS[kind].entityType === entityType) ?? null;
}

export function kindConfig(kind: ContextKind): KindConfig {
  return KINDS[kind];
}

/** The kind behind a route `data.kind` value (defaults to analyses). */
export function asKind(value: unknown): ContextKind {
  return typeof value === 'string' && value in KINDS ? (value as ContextKind) : 'analysis';
}

/** Portal path of a record's detail page. */
export function recordPath(kind: ContextKind, id: string): string {
  return `/context/${KINDS[kind].segment}/${id}`;
}

// --- badges (shared tone map, docs/ux-guide.md §5) -----------------------------------

/** A status badge: what the value means (its colour) and the module's own label. */
export interface BadgeSpec {
  readonly meaning: ToneMeaning;
  /** The value the shared tone map colours. */
  readonly value: string;
  readonly labelKey: string;
}

/** Record status (approval lifecycle, or active / archived). */
export function statusBadge(status: string): BadgeSpec {
  return { meaning: 'lifecycle', value: status, labelKey: `context.status.${status}` };
}

/**
 * How well a party's needs are handled. A progress meaning, so "not handled" is
 * a to-do (amber), never an error (red).
 */
const ADDRESSED_VALUE: Readonly<Record<AddressedStatus, string>> = {
  addressed: 'done',
  partially: 'in_progress',
  not_addressed: 'blocked',
  not_relevant: 'not_applicable',
};

export function addressedBadge(status: AddressedStatus | string): BadgeSpec {
  return {
    meaning: 'progress',
    value: ADDRESSED_VALUE[status as AddressedStatus] ?? 'draft',
    labelKey: `context.addressed.${status}`,
  };
}

/** Stakeholder priority (power / interest grid): attention, not alarm. */
const PRIORITY_VALUE: Readonly<Record<PartyPriority, string>> = {
  manage_closely: 'in_progress',
  keep_satisfied: 'open',
  keep_informed: 'open',
  monitor: 'draft',
};

export function priorityBadge(priority: PartyPriority | string): BadgeSpec {
  return {
    meaning: 'progress',
    value: PRIORITY_VALUE[priority as PartyPriority] ?? 'draft',
    labelKey: `context.priorities.${priority}`,
  };
}

/** SWOT categories whose factors are bad news (impact is coloured as severity there). */
const ADVERSE_CATEGORIES = new Set(['weakness', 'threat']);

/** Significance colours: one weight scale in every quadrant (never an alarm colour). */
const SIGNIFICANCE_TONE: Readonly<Record<Level, Tone>> = {
  low: 'neutral',
  medium: 'info',
  high: 'accent',
};

/**
 * The significance badge of a SWOT / PESTEL factor ("Betydning: høy"). The same
 * colours in every quadrant: whether a factor needs action is shown by its
 * follow-up state, not by its significance.
 */
export function significanceTone(impact: Level | string): Tone {
  return SIGNIFICANCE_TONE[impact as Level] ?? 'neutral';
}

/** Whether a factor is something to act against (weakness / threat). */
export function isAdverse(category: string): boolean {
  return ADVERSE_CATEGORIES.has(category);
}

/**
 * Whether a factor still needs a decision (mirrors the API's `open_factors`):
 * a SWOT weakness or threat, or a high-significance PESTEL factor, without a
 * follow-up.
 */
export function needsFollowUp(
  method: AnalysisMethod,
  item: {
    readonly category: string;
    readonly impact: string;
    readonly follow_ups?: readonly unknown[];
  },
): boolean {
  if (item.follow_ups?.length) {
    return false;
  }
  return method === 'pestle' ? item.impact === 'high' : ADVERSE_CATEGORIES.has(item.category);
}

/** Internal (strengths, weaknesses) or external (opportunities, threats, PESTEL). */
export function isInternal(category: string): boolean {
  return category === 'strength' || category === 'weakness';
}

/** The categories an analysis method uses, in display order. */
export function categoriesFor(method: AnalysisMethod): readonly string[] {
  return method === 'pestle' ? PESTLE_CATEGORIES : SWOT_CATEGORIES;
}

/** The statuses a list filter offers for a kind. */
export function statusesFor(kind: ContextKind): readonly ControlledStatus[] | readonly string[] {
  return KINDS[kind].controlled
    ? (['draft', 'in_review', 'approved', 'retired'] as const)
    : (['active', 'archived'] as const);
}

/**
 * Influence x interest -> stakeholder priority (power/interest grid). Mirrors the
 * backend rule so the form can preview the quadrant before saving.
 */
export function partyPriority(influence: Level, interest: Level): PartyPriority {
  const highInfluence = influence === 'high';
  const highInterest = interest === 'high';
  if (highInfluence && highInterest) {
    return 'manage_closely';
  }
  if (highInfluence) {
    return 'keep_satisfied';
  }
  if (highInterest) {
    return 'keep_informed';
  }
  return 'monitor';
}

// --- frameworks --------------------------------------------------------------------------

/**
 * Framework keys with the organisation's adopted ones first (in platform order),
 * then the rest. Unknown keys are dropped.
 */
export function orderFrameworks(adopted: readonly string[]): string[] {
  const known = FRAMEWORK_KEYS as readonly string[];
  const first = known.filter((key) => adopted.includes(key));
  return [...first, ...known.filter((key) => !first.includes(key))];
}

// --- lifecycle -------------------------------------------------------------------------

/** Which lifecycle buttons apply to a controlled record's status. */
export function lifecycleActions(
  status: ControlledStatus,
): readonly ('submit' | 'approve' | 'return' | 'review' | 'retire')[] {
  switch (status) {
    case 'draft':
      return ['submit', 'approve', 'retire'];
    case 'in_review':
      return ['approve', 'return', 'retire'];
    case 'approved':
      return ['review', 'retire'];
    default:
      return [];
  }
}

// --- review interval ---------------------------------------------------------------------

/** The interval options of the form (a stored value outside the list is kept as an option). */
export function intervalOptions(current: string): number[] {
  const n = Number(current);
  const options: number[] = [...REVIEW_INTERVALS];
  if (current && Number.isInteger(n) && n >= 1 && n <= 60 && !options.includes(n)) {
    options.push(n);
    options.sort((a, b) => a - b);
  }
  return options;
}

/** `YYYY-MM-DD` of `from` plus `months` (end of month clamped), or '' for no interval. */
export function addMonths(from: Date, months: number): string {
  if (!Number.isInteger(months) || months <= 0) {
    return '';
  }
  const year = from.getFullYear();
  const month = from.getMonth() + months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(from.getDate(), lastDay);
  const date = new Date(year, month, day);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// --- errors ------------------------------------------------------------------------------

/** Coded errors the M01 API returns; each has `context.errors.<code>`. */
export const CONTEXT_ERROR_CODES = [
  'module_disabled',
  'record_retired',
  'change_reason_required',
  'invalid_status',
  'invalid_category',
  'invalid_owner',
  'invalid_owner_filter',
  'field_required',
  'multiple_accountable',
  'duplicate_assignment',
  'invalid_assignee',
  'not_controlled',
  'invalid_arguments',
  'invalid_clause',
  'no_recipients',
] as const;

/** The translation key for a failed M01 request (the backend's English text is never shown). */
export function contextErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && (CONTEXT_ERROR_CODES as readonly string[]).includes(detail.code)) {
    return `context.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'context.errors.forbidden';
    }
    if (error.status === 404) {
      return 'context.errors.not_found';
    }
    if (error.status === 422) {
      return 'context.errors.validation';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}

// --- dates -------------------------------------------------------------------------------

/** The leading `YYYY-MM-DD` of a wire date-time, or '' (for `<input type="date">`). */
export function dayOf(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

/** A picked calendar day as a naive-UTC wire value (start of day), or null. */
export function dayToWire(day: string | null | undefined): string | null {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00` : null;
}

/** A due day as the end of that day (so a task due today is not overdue yet). */
export function dueDayToWire(day: string | null | undefined): string | null {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T23:59:59` : null;
}

/** Split free text into one trimmed, de-duplicated value per line. */
export function linesOf(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Policy / scope text without a leading markdown heading that only repeats the
 * record title ("# Quality policy" above "Quality policy").
 */
export function withoutTitleHeading(text: string | null | undefined, title: string): string {
  const value = (text ?? '').replace(/^\s+/, '');
  const match = /^#{1,6}\s+(.+?)\s*#*\s*(?:\r?\n|$)/.exec(value);
  if (match && normaliseTitle(match[1]) === normaliseTitle(title)) {
    return value.slice(match[0].length).replace(/^\s+/, '');
  }
  return text ?? '';
}

function normaliseTitle(text: string): string {
  return text.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

/** Whether a record date (`YYYY-MM-DD…`) is before today (local calendar day). */
export function isPastDay(value: string | null | undefined, today = new Date()): boolean {
  const day = dayOf(value);
  if (!day) {
    return false;
  }
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return day < `${today.getFullYear()}-${mm}-${dd}`;
}
