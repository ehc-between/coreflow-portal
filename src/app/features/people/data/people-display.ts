import { ToneMeaning } from '../../../shared/ui/tones';
import {
  CellStatus,
  ComplianceStatus,
  EmployeeStatus,
  GapActionStatus,
  ScreeningStatus,
} from './people.models';

/** Shared look of the native filter selects on the people pages. */
export const FILTER_SELECT_CLASS =
  'h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg';

/** The permissions of the current org (empty when none is selected). */
export function hasPerm(permissions: readonly string[] | undefined, key: string): boolean {
  return (permissions ?? []).includes(key);
}

/**
 * What a people value means for `app-status-badge` (`toneFor(meaning, value)`):
 * the shared tone map decides the colour, the page passes its own label key.
 */
export interface BadgeLook {
  readonly meaning: ToneMeaning;
  readonly value: string;
}

const look = (meaning: ToneMeaning, value: string): BadgeLook => ({ meaning, value });

const EMPLOYEE_STATUS_LOOK: Readonly<Record<EmployeeStatus, BadgeLook>> = {
  onboarding: look('lifecycle', 'open'),
  active: look('lifecycle', 'approved'),
  on_leave: look('lifecycle', 'draft'),
  offboarding: look('lifecycle', 'due'),
  former: look('lifecycle', 'archived'),
};

export function employeeStatusLook(status: EmployeeStatus | string): BadgeLook {
  return EMPLOYEE_STATUS_LOOK[status as EmployeeStatus] ?? look('lifecycle', status);
}

const CELL_LOOK: Readonly<Record<CellStatus, BadgeLook>> = {
  met: look('compliance', 'met'),
  gap: look('compliance', 'partial'),
  missing: look('compliance', 'not_met'),
  expired: look('compliance', 'not_met'),
  not_required: look('compliance', 'not_applicable'),
};

export function cellLook(status: CellStatus | string): BadgeLook {
  return CELL_LOOK[status as CellStatus] ?? look('compliance', status);
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

const SCREENING_LOOK: Readonly<Record<ScreeningStatus, BadgeLook>> = {
  not_required: look('lifecycle', 'draft'),
  pending: look('lifecycle', 'pending'),
  completed: look('lifecycle', 'completed'),
  failed: look('lifecycle', 'failed'),
};

export function screeningLook(status: ScreeningStatus | string): BadgeLook {
  return SCREENING_LOOK[status as ScreeningStatus] ?? look('lifecycle', status);
}

const COMPLIANCE_LOOK: Readonly<Record<ComplianceStatus, BadgeLook>> = {
  ok: look('compliance', 'met'),
  missing: look('compliance', 'partial'),
  due: look('lifecycle', 'due'),
  pending: look('lifecycle', 'pending'),
  not_required: look('compliance', 'not_applicable'),
};

export function complianceLook(status: ComplianceStatus | string): BadgeLook {
  return COMPLIANCE_LOOK[status as ComplianceStatus] ?? look('compliance', status);
}

const ACTION_LOOK: Readonly<Record<GapActionStatus, BadgeLook>> = {
  open: look('lifecycle', 'open'),
  done: look('lifecycle', 'in_progress'),
  effective: look('lifecycle', 'effective'),
  not_effective: look('compliance', 'partial'),
  cancelled: look('lifecycle', 'cancelled'),
};

export function gapActionLook(status: GapActionStatus | string): BadgeLook {
  return ACTION_LOOK[status as GapActionStatus] ?? look('lifecycle', status);
}

/** Disciplinary cases: open cases stand out, closed ones are history. */
export function disciplinaryLook(status: string): BadgeLook {
  return look('lifecycle', status === 'open' ? 'on_hold' : 'archived');
}

/**
 * The i18n key of a count: `<key>One` for exactly one, else `<key>`
 * (both variants exist in every language file).
 */
export function countKey(key: string, count: number | null | undefined): string {
  return count === 1 ? `${key}One` : key;
}

/** Whether the job title only repeats the position (then it is not shown twice). */
export function sameTitle(
  jobTitle: string | null | undefined,
  position: string | null | undefined,
): boolean {
  const a = (jobTitle ?? '').trim().toLocaleLowerCase();
  const b = (position ?? '').trim().toLocaleLowerCase();
  return !a || a === b;
}

/** A date `months` months after `from` (YYYY-MM-DD, local). */
export function addMonthsIso(from: string, months: number): string {
  const [y, m, d] = from.split('-').map(Number);
  const date = new Date(y, m - 1 + months, d);
  return todayIso(date);
}

/** Trigger a browser download of a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
