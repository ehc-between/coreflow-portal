import { todayDay } from '../../../shared/tasks/task-display';
import { ToneMeaning } from '../../../shared/ui/tones';
import {
  ControlledStatus,
  Criticality,
  ExerciseStatus,
  Outcome,
  ReadinessState,
  ReviewState,
} from './continuity.models';

/**
 * Badge meaning and value of each continuity state, for `app-status-badge` (the
 * shared tone map, docs/ux-guide.md §5). The label stays the module's own
 * (`labelKey`); the colour comes from the meaning:
 *
 * - BIA / plan status and exercise status are lifecycles;
 * - criticality and impact ratings are severities (low is neutral, not green);
 * - exercise outcomes and ICT readiness say whether a requirement is met.
 */
export interface BadgeSpec {
  readonly meaning: ToneMeaning;
  readonly value: string;
}

const REVIEW_VALUE: Readonly<Record<ReviewState, string>> = {
  overdue: 'overdue',
  due_soon: 'due',
  ok: 'effective',
  not_scheduled: 'draft',
};

const OUTCOME_VALUE: Readonly<Record<Outcome, string>> = {
  successful: 'met',
  partially_successful: 'partial',
  unsuccessful: 'not_met',
};

const READINESS_VALUE: Readonly<Record<ReadinessState, string>> = {
  ready: 'met',
  attention: 'partial',
  gap: 'not_met',
  retired: 'not_applicable',
};

export const badge = {
  controlled: (status: ControlledStatus | string): BadgeSpec => ({
    meaning: 'lifecycle',
    value: status,
  }),
  criticality: (criticality: Criticality | string | null): BadgeSpec => ({
    meaning: 'severity',
    value: criticality ?? '',
  }),
  review: (state: ReviewState): BadgeSpec => ({
    meaning: 'lifecycle',
    value: REVIEW_VALUE[state] ?? '',
  }),
  exercise: (status: ExerciseStatus | string): BadgeSpec => ({
    meaning: 'lifecycle',
    value: status,
  }),
  outcome: (outcome: Outcome | string | null): BadgeSpec => ({
    meaning: 'compliance',
    value: OUTCOME_VALUE[outcome as Outcome] ?? '',
  }),
  readiness: (state: ReadinessState | string | null): BadgeSpec => ({
    meaning: 'compliance',
    value: READINESS_VALUE[state as ReadinessState] ?? '',
  }),
  /** An impact rating 0-5: 4-5 high, 3 medium, 1-2 low, 0 none. */
  impact: (rating: number | null | undefined): BadgeSpec => ({
    meaning: 'severity',
    value:
      rating === null || rating === undefined
        ? ''
        : rating >= 4
          ? 'high'
          : rating >= 3
            ? 'medium'
            : rating >= 1
              ? 'low'
              : 'none',
  }),
} as const;

export type DurationUnit = 'minutes' | 'hours' | 'days';
export const DURATION_UNITS: readonly DurationUnit[] = ['minutes', 'hours', 'days'];

const PER_UNIT: Readonly<Record<DurationUnit, number>> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

/**
 * A duration in minutes split into the largest whole unit (for display and for the
 * duration input): 2880 -> {2, days}, 90 -> {90, minutes}, 120 -> {2, hours}.
 */
export function splitDuration(minutes: number): { value: number; unit: DurationUnit } {
  if (minutes > 0 && minutes % PER_UNIT.days === 0) {
    return { value: minutes / PER_UNIT.days, unit: 'days' };
  }
  if (minutes > 0 && minutes % PER_UNIT.hours === 0) {
    return { value: minutes / PER_UNIT.hours, unit: 'hours' };
  }
  return { value: minutes, unit: 'minutes' };
}

/** Minutes of a value in a unit (null for blank or invalid input). */
export function toMinutes(value: string | number | null, unit: DurationUnit): number | null {
  if (value === null || value === '') {
    return null;
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.round(n * PER_UNIT[unit]);
}

/**
 * The i18n key and params of a duration in its largest whole unit
 * (`continuity.duration.<unit>` with `{count}`), or the "not set" key for null.
 */
export function durationLabel(minutes: number | null | undefined): {
  key: string;
  params: Record<string, unknown>;
} {
  if (minutes === null || minutes === undefined) {
    return { key: 'continuity.duration.notSet', params: {} };
  }
  const { value, unit } = splitDuration(minutes);
  return { key: `continuity.duration.${unit}`, params: { count: value } };
}

export interface DurationPart {
  readonly key: string;
  readonly params: Record<string, unknown>;
}

/**
 * A duration as readable parts, the same way everywhere: 410 → "6 t" + "50 min",
 * 1500 → "1 d" + "1 t", 240 → "4 t". Null → the "not set" key.
 */
export function durationParts(minutes: number | null | undefined): readonly DurationPart[] {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return [{ key: 'continuity.duration.notSet', params: {} }];
  }
  const total = Math.max(0, Math.round(minutes));
  if (total === 0) {
    return [{ key: 'continuity.duration.minutes', params: { count: 0 } }];
  }
  const days = Math.floor(total / PER_UNIT.days);
  const hours = Math.floor((total % PER_UNIT.days) / PER_UNIT.hours);
  const mins = total % PER_UNIT.hours;
  const parts: DurationPart[] = [];
  if (days) {
    parts.push({ key: 'continuity.duration.days', params: { count: days } });
  }
  if (hours) {
    parts.push({ key: 'continuity.duration.hours', params: { count: hours } });
  }
  if (mins) {
    parts.push({ key: 'continuity.duration.minutes', params: { count: mins } });
  }
  return parts;
}

/** A duration as text through a translate function ("6 t 50 min"). */
export function formatDuration(
  minutes: number | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  return durationParts(minutes)
    .map((p) => t(p.key, p.params))
    .join(' ');
}

/** Blank / whitespace-only strings become null; others are trimmed. */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

/** Parse an integer input ('' -> null; non-integers -> NaN for validation). */
export function parseIntOrNull(raw: string): number | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

/** The keys of `next` whose value differs from `current` (deep JSON compare). */
export function changedFields<T extends object>(current: T, next: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (JSON.stringify(current[key]) !== JSON.stringify(next[key])) {
      out[key] = next[key];
    }
  }
  return out;
}

/** Today as `YYYY-MM-DD` in local time (the shared task helper). */
export function todayIso(now: Date = new Date()): string {
  return todayDay(now);
}

/** Actions that need a confirmation note (reject needs one; the rest accept one). */
export function actionNeedsNote(action: string): boolean {
  return action === 'reject';
}

/** Button variant of a controlled-record action. */
export function actionVariant(action: string): 'primary' | 'secondary' | 'ghost' | 'danger' {
  switch (action) {
    case 'approve':
    case 'submit':
      return 'primary';
    case 'reject':
      return 'danger';
    default:
      return 'secondary';
  }
}

/** Order the backend's allowed actions consistently for display. */
export function orderedActions(allowed: readonly string[]): string[] {
  const order = ['submit', 'approve', 'review', 'reject', 'restore', 'retire'];
  return order.filter((a) => allowed.includes(a));
}

/** `tel:` link of a phone number (digits and a leading +), or null. */
export function telHref(phone: string | null | undefined): string | null {
  const cleaned = (phone ?? '').replace(/[^\d+]/g, '');
  return cleaned.length >= 3 ? `tel:${cleaned}` : null;
}
