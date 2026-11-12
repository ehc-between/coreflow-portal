import { todayDay } from '../../../shared/tasks/task-display';
import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  ControlledStatus,
  Criticality,
  ExerciseStatus,
  Outcome,
  ReadinessState,
  ReviewState,
} from './continuity.models';

/** Badge tone of a BIA / plan status. */
export function controlledStatusTone(status: ControlledStatus | string): BadgeTone {
  switch (status) {
    case 'approved':
      return 'pass';
    case 'in_review':
      return 'warn';
    case 'draft':
      return 'info';
    default:
      return 'neutral';
  }
}

export function criticalityTone(criticality: Criticality | string | null): BadgeTone {
  switch (criticality) {
    case 'critical':
      return 'fail';
    case 'high':
      return 'warn';
    case 'medium':
      return 'info';
    default:
      return 'neutral';
  }
}

export function reviewStateTone(state: ReviewState): BadgeTone {
  switch (state) {
    case 'overdue':
      return 'fail';
    case 'due_soon':
      return 'warn';
    case 'ok':
      return 'pass';
    default:
      return 'neutral';
  }
}

export function exerciseStatusTone(status: ExerciseStatus | string): BadgeTone {
  switch (status) {
    case 'planned':
      return 'info';
    case 'completed':
      return 'pass';
    default:
      return 'neutral';
  }
}

export function outcomeTone(outcome: Outcome | string | null): BadgeTone {
  switch (outcome) {
    case 'successful':
      return 'pass';
    case 'partially_successful':
      return 'warn';
    case 'unsuccessful':
      return 'fail';
    default:
      return 'neutral';
  }
}

export function readinessTone(state: ReadinessState): BadgeTone {
  switch (state) {
    case 'ready':
      return 'pass';
    case 'attention':
      return 'warn';
    case 'gap':
      return 'fail';
    default:
      return 'neutral';
  }
}

/** Badge tone of an impact rating 0-5. */
export function impactTone(rating: number | null | undefined): BadgeTone {
  if (rating === null || rating === undefined) {
    return 'neutral';
  }
  if (rating >= 4) {
    return 'fail';
  }
  if (rating >= 3) {
    return 'warn';
  }
  if (rating >= 1) {
    return 'info';
  }
  return 'neutral';
}

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
 * The i18n key and params of a duration (`continuity.duration.<unit>` with
 * `{count}`), or the "not set" key for null.
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
    case 'retire':
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
