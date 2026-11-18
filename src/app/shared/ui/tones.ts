import { BadgeTone } from './badge/badge';

/** A badge / dot / bar colour. Same set as `app-badge` tones. */
export type Tone = BadgeTone;

/**
 * What a value means, which decides its colour (docs/ux-guide.md, "Tone map"):
 *
 * - `severity`: how bad something is (severity, criticality, risk level, AI Act class).
 *   Low is `neutral`, not green: a low risk is not an achievement.
 * - `lifecycle`: where a record is in its workflow (draft, open, in progress, done…).
 * - `compliance`: whether a requirement or control is met.
 * - `progress`: maturity, coverage, completion. Never red: low progress is a to-do.
 */
export type ToneMeaning = 'severity' | 'lifecycle' | 'compliance' | 'progress';

const SEVERITY: Readonly<Record<string, Tone>> = {
  critical: 'fail',
  prohibited: 'fail',
  unacceptable: 'fail',
  very_high: 'fail',
  severe: 'fail',
  major: 'fail',
  high: 'fail',
  medium: 'warn',
  moderate: 'warn',
  limited: 'warn',
  minor: 'warn',
  elevated: 'warn',
  low: 'neutral',
  minimal: 'neutral',
  very_low: 'neutral',
  negligible: 'neutral',
  none: 'neutral',
  observation: 'info',
  opportunity: 'info',
};

const LIFECYCLE: Readonly<Record<string, Tone>> = {
  draft: 'neutral',
  new: 'info',
  planned: 'info',
  scheduled: 'info',
  open: 'info',
  submitted: 'info',
  reported: 'info',
  received: 'info',
  in_progress: 'accent',
  ongoing: 'accent',
  active: 'accent',
  under_review: 'accent',
  in_review: 'accent',
  pending: 'accent',
  pending_approval: 'accent',
  awaiting_approval: 'accent',
  overdue: 'warn',
  blocked: 'warn',
  on_hold: 'warn',
  due: 'warn',
  expiring: 'warn',
  done: 'pass',
  completed: 'pass',
  complete: 'pass',
  approved: 'pass',
  closed: 'pass',
  effective: 'pass',
  published: 'pass',
  resolved: 'pass',
  implemented: 'pass',
  verified: 'pass',
  passed: 'pass',
  cancelled: 'neutral',
  canceled: 'neutral',
  archived: 'neutral',
  obsolete: 'neutral',
  withdrawn: 'neutral',
  superseded: 'neutral',
  retired: 'neutral',
  expired: 'neutral',
  rejected: 'fail',
  failed: 'fail',
};

const COMPLIANCE: Readonly<Record<string, Tone>> = {
  compliant: 'pass',
  met: 'pass',
  implemented: 'pass',
  covered: 'pass',
  partial: 'warn',
  partially: 'warn',
  partially_compliant: 'warn',
  partially_implemented: 'warn',
  in_progress: 'warn',
  non_compliant: 'fail',
  not_compliant: 'fail',
  not_met: 'fail',
  not_implemented: 'fail',
  gap: 'fail',
  not_assessed: 'neutral',
  not_applicable: 'neutral',
  na: 'neutral',
  n_a: 'neutral',
  unknown: 'neutral',
};

const MAPS: Readonly<Record<Exclude<ToneMeaning, 'progress'>, Readonly<Record<string, Tone>>>> = {
  severity: SEVERITY,
  lifecycle: LIFECYCLE,
  compliance: COMPLIANCE,
};

/** Normalise an enum value for lookup: `"In progress"` / `"in-progress"` → `in_progress`. */
export function normaliseToneValue(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-/]+/g, '_');
}

/**
 * The tone for `value` given what it means. Unknown values are `neutral`.
 *
 *   toneFor('severity', 'high')        // 'fail'
 *   toneFor('lifecycle', 'in_progress') // 'accent'
 *   toneFor('progress', '42')           // 'accent' (never 'fail')
 */
export function toneFor(meaning: ToneMeaning, value: string | number | null | undefined): Tone {
  if (meaning === 'progress') {
    return progressTone(value);
  }
  const key = normaliseToneValue(value === null || value === undefined ? '' : String(value));
  return MAPS[meaning][key] ?? 'neutral';
}

/** Progress: a percentage (0-100) or a lifecycle word; red is mapped to amber. */
function progressTone(value: string | number | null | undefined): Tone {
  const n = typeof value === 'number' ? value : Number(value);
  if (value !== '' && value !== null && value !== undefined && Number.isFinite(n)) {
    if (n >= 100) {
      return 'pass';
    }
    return n > 0 ? 'accent' : 'neutral';
  }
  const tone = toneFor('lifecycle', value);
  return tone === 'fail' ? 'warn' : tone;
}

/** The global i18n key of a value's label: `common.severity.<v>` or `common.status.<v>`. */
export function toneLabelKey(meaning: ToneMeaning, value: string | null | undefined): string {
  const key = normaliseToneValue(value);
  return meaning === 'severity' ? `common.severity.${key}` : `common.status.${key}`;
}

/** Readable fallback for a value without a translation: `"under_review"` → `"Under review"`. */
export function humaniseValue(value: string | null | undefined): string {
  const text = (value ?? '').trim().replace(/[_-]+/g, ' ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : '';
}

/**
 * The four plain status words a register shows (copy rule U41: at most 4 per
 * register): Open, In progress, Overdue, Closed. Workflow states map onto them
 * by meaning; a value that is not a known workflow state has no plain word (null).
 */
export type PlainStatus = 'open' | 'inProgress' | 'overdue' | 'closed';

const PLAIN_BY_VALUE: Readonly<Record<string, PlainStatus>> = {
  overdue: 'overdue',
  expired: 'overdue',
  on_hold: 'inProgress',
  blocked: 'inProgress',
  due: 'open',
  expiring: 'open',
  draft: 'open',
  rejected: 'closed',
  failed: 'closed',
};

const PLAIN_BY_TONE: Readonly<Partial<Record<Tone, PlainStatus>>> = {
  info: 'open',
  accent: 'inProgress',
  pass: 'closed',
  neutral: 'closed',
};

/** The plain status word for a workflow value (`"under_review"` → `inProgress`), or null. */
export function plainStatus(value: string | null | undefined): PlainStatus | null {
  const key = normaliseToneValue(value);
  if (!key || !(key in LIFECYCLE)) {
    return null;
  }
  return PLAIN_BY_VALUE[key] ?? PLAIN_BY_TONE[LIFECYCLE[key]] ?? null;
}

/** The i18n key of a plain status word (`ui.plainStatus.<word>`). */
export function plainStatusKey(status: PlainStatus): string {
  return `ui.plainStatus.${status}`;
}
