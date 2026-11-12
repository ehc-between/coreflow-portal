import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  CellStatus,
  ChecklistStatus,
  DisciplinaryStatus,
  EmployeeStatus,
  RecordStatus,
  RiskLevel,
  ScreeningStatus,
} from './people.models';

/** Shared look of the native filter selects on the people pages. */
export const FILTER_SELECT_CLASS =
  'h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg';

/** The permissions of the current org (empty when none is selected). */
export function hasPerm(permissions: readonly string[] | undefined, key: string): boolean {
  return (permissions ?? []).includes(key);
}

export function employeeStatusTone(status: EmployeeStatus | string): BadgeTone {
  switch (status) {
    case 'active':
      return 'pass';
    case 'onboarding':
      return 'info';
    case 'on_leave':
      return 'neutral';
    case 'offboarding':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function cellStatusTone(status: CellStatus | string): BadgeTone {
  switch (status) {
    case 'met':
      return 'pass';
    case 'gap':
      return 'warn';
    case 'missing':
    case 'expired':
      return 'fail';
    default:
      return 'neutral';
  }
}

/** Background/text classes of a competence matrix cell (paired with a text symbol). */
export function cellClass(status: CellStatus | string): string {
  switch (status) {
    case 'met':
      return 'bg-pass-soft text-pass';
    case 'gap':
      return 'bg-warn-soft text-warn';
    case 'missing':
    case 'expired':
      return 'bg-fail-soft text-fail';
    default:
      return 'text-fg-subtle';
  }
}

export function checklistStatusTone(status: ChecklistStatus | string): BadgeTone {
  switch (status) {
    case 'open':
      return 'info';
    case 'completed':
      return 'pass';
    default:
      return 'neutral';
  }
}

export function recordStatusTone(status: RecordStatus | string): BadgeTone {
  return status === 'active' ? 'pass' : 'neutral';
}

export function riskTone(level: RiskLevel | string): BadgeTone {
  switch (level) {
    case 'high':
      return 'fail';
    case 'medium':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function screeningTone(status: ScreeningStatus | string): BadgeTone {
  switch (status) {
    case 'completed':
      return 'pass';
    case 'pending':
      return 'warn';
    case 'failed':
      return 'fail';
    default:
      return 'neutral';
  }
}

export function disciplinaryTone(status: DisciplinaryStatus | string): BadgeTone {
  return status === 'open' ? 'warn' : 'neutral';
}

/** Sort option -> i18n key segment (`-name` -> `nameDesc`). */
export function sortKey(sort: string): string {
  return sort.startsWith('-') ? `${sort.slice(1)}Desc` : sort;
}

/** Today's date as `YYYY-MM-DD` in the user's local time zone. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Trimmed text, or null when blank (for optional API fields). */
export function textOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

/**
 * The fields of `after` that differ from `before` (for PATCH bodies: only what the
 * user changed is sent, so the revision history stays meaningful).
 */
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
  const diff: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (after[key] !== before[key]) {
      diff[key] = after[key];
    }
  }
  return diff;
}
