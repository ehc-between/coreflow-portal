import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../core/http/error.interceptor';
import { BadgeTone } from '../../shared/ui/badge/badge';
import {
  AnalysisMethod,
  ContextKind,
  ControlledStatus,
  Level,
  PESTLE_CATEGORIES,
  PartyPriority,
  SWOT_CATEGORIES,
  AddressedStatus,
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
  /** Has the review-interval field (controlled records). */
  readonly hasInterval: boolean;
}

export const KINDS: Readonly<Record<ContextKind, KindConfig>> = {
  analysis: {
    kind: 'analysis',
    segment: 'analyses',
    entityType: 'context_analysis',
    controlled: true,
    guidance: 'analyses',
    titleField: 'title',
    hasInterval: true,
  },
  party: {
    kind: 'party',
    segment: 'interested-parties',
    entityType: 'interested_party',
    controlled: false,
    guidance: 'parties',
    titleField: 'name',
    hasInterval: false,
  },
  scope: {
    kind: 'scope',
    segment: 'scopes',
    entityType: 'scope_statement',
    controlled: true,
    guidance: 'scopes',
    titleField: 'title',
    hasInterval: true,
  },
  policy: {
    kind: 'policy',
    segment: 'policies',
    entityType: 'policy',
    controlled: true,
    guidance: 'policies',
    titleField: 'title',
    hasInterval: true,
  },
  responsibility: {
    kind: 'responsibility',
    segment: 'responsibilities',
    entityType: 'responsibility',
    controlled: false,
    guidance: 'responsibilities',
    titleField: 'title',
    hasInterval: false,
  },
};

export const KIND_ORDER: readonly ContextKind[] = [
  'analysis',
  'party',
  'scope',
  'policy',
  'responsibility',
];

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

// --- labels and tones ------------------------------------------------------------------

export function statusTone(status: string | null | undefined): BadgeTone {
  switch (status) {
    case 'approved':
    case 'active':
      return 'pass';
    case 'in_review':
      return 'info';
    case 'draft':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function levelTone(level: Level | string | null | undefined): BadgeTone {
  switch (level) {
    case 'high':
      return 'fail';
    case 'medium':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function addressedTone(status: AddressedStatus | string | null | undefined): BadgeTone {
  switch (status) {
    case 'addressed':
      return 'pass';
    case 'partially':
      return 'warn';
    case 'not_addressed':
      return 'fail';
    default:
      return 'neutral';
  }
}

export function priorityTone(priority: PartyPriority | string | null | undefined): BadgeTone {
  switch (priority) {
    case 'manage_closely':
      return 'fail';
    case 'keep_satisfied':
      return 'warn';
    case 'keep_informed':
      return 'info';
    default:
      return 'neutral';
  }
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
