import { fixedShortName, shortNameKey } from '../../../shared/requirement-links/requirement-label';
import { parseClause } from '../../../shared/requirement-links/clause-picker';
import {
  CHANGE_STATUSES,
  COMPLIANCE_STATUSES,
  ChangeStatus,
  EVALUATION_RESULTS,
  FRAMEWORKS,
  IMPACTS,
  JURISDICTIONS,
  NON_COMPLIANT_RESULTS,
  OBLIGATION_STATUSES,
  OBLIGATION_TYPES,
  Obligation,
  RENEWABLE_TYPES,
} from './obligation.models';

function keyFor(prefix: string, values: readonly string[], value: string | null | undefined) {
  return values.includes(value ?? '') ? `${prefix}.${value}` : `${prefix}.unknown`;
}

export function obligationStatusKey(status: string | null | undefined): string {
  return keyFor('obligations.status', OBLIGATION_STATUSES, status);
}

export function obligationTypeKey(type: string | null | undefined): string {
  return (OBLIGATION_TYPES as readonly string[]).includes(type ?? '')
    ? `obligations.types.${type}`
    : 'obligations.types.other';
}

export function complianceKey(status: string | null | undefined): string {
  return keyFor('obligations.compliance', COMPLIANCE_STATUSES, status);
}

export function resultKey(result: string | null | undefined): string {
  return keyFor('obligations.compliance', EVALUATION_RESULTS, result);
}

export function impactKey(impact: string | null | undefined): string {
  return keyFor('obligations.impacts', IMPACTS, impact);
}

export function changeStatusKey(status: string | null | undefined): string {
  return keyFor('obligations.changeStatus', CHANGE_STATUSES, status);
}

/**
 * The tone-map value of a change note's status (`app-status-badge meaning="lifecycle"`):
 * an open note is still to be handled, a handled one is done.
 */
export function changeStatusMeaning(status: ChangeStatus | string): string {
  return status === 'assessed' ? 'done' : 'open';
}

/**
 * The tone-map value of an obligation's lifecycle status: active is in force (accent),
 * a draft is not yet in use, a retired obligation no longer applies.
 */
export function obligationStatusMeaning(status: string): string {
  return status === 'active' ? 'active' : status === 'retired' ? 'retired' : 'draft';
}

export function frameworkKey(framework: string | null | undefined): string {
  return keyFor('obligations.frameworks', FRAMEWORKS, framework);
}

/** i18n key of a known jurisdiction code (`NO`, `EU` …), or null for free text. */
export function jurisdictionKey(value: string | null | undefined): string | null {
  return (JURISDICTIONS as readonly string[]).includes(value ?? '')
    ? `obligations.jurisdictions.${value}`
    : null;
}

export function isRenewable(type: string | null | undefined): boolean {
  return (RENEWABLE_TYPES as readonly string[]).includes(type ?? '');
}

export function isFailing(result: string | null | undefined): boolean {
  return (NON_COMPLIANT_RESULTS as readonly string[]).includes(result ?? '');
}

/**
 * A clause ref for reading ("GDPR · 30", "ISO 14001 · 6.1.3"); `translate` resolves the
 * short names that differ per language (the AI Act, the shared ISO clauses).
 */
export function clauseLabel(ref: string, translate: (key: string) => string): string {
  const p = parseClause(ref);
  if (!p.framework) {
    return p.number;
  }
  const key = shortNameKey(p.framework);
  const short = key ? translate(key) : (fixedShortName(p.framework) ?? p.framework);
  return `${short} · ${p.number}`;
}

/** Today as `YYYY-MM-DD` in the viewer's timezone. */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** `days` after `now` as `YYYY-MM-DD` (local calendar). */
export function addDaysIso(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return todayIso(d);
}

/** Whole days from `today` to an ISO day (negative when past); null for no/invalid day. */
export function daysUntil(day: string | null | undefined, today: Date = new Date()): number | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}/.test(day)) {
    return null;
  }
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}

/** A safe external link: only http(s) URLs are rendered as links. */
export function safeUrl(url: string | null | undefined): string | null {
  const value = url?.trim();
  return value && /^https?:\/\//i.test(value) ? value : null;
}

/** The host of a URL for display ("lovdata.no"), or the text itself. */
export function urlHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Offer a downloaded file to the user. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File name of the register export (the backend uses the same names). */
export function exportFileName(format: string, lang: string): string {
  return `${lang === 'nb' ? 'lovregister' : 'obligations-register'}.${format}`;
}

/** What needs doing on an obligation, most urgent first (the detail status strip). */
export type NextStepKind =
  | 'retired'
  | 'draft'
  | 'overdue'
  | 'firstEvaluation'
  | 'noFollowUp'
  | 'noSchedule'
  | 'renewal'
  | 'expired'
  | 'changes'
  | 'ok';

export interface NextStep {
  readonly kind: NextStepKind;
  /** `warn` needs action, `info` is advice, `pass` is all good. */
  readonly tone: 'warn' | 'info' | 'pass';
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * Every open point of an obligation in priority order; the first is the one primary
 * next step. Retired and draft obligations get a single explanatory step.
 */
export function nextSteps(o: Obligation, today: Date = new Date()): NextStep[] {
  if (o.status === 'retired') {
    return [{ kind: 'retired', tone: 'info', params: {} }];
  }
  const steps: NextStep[] = [];
  if (o.status === 'draft') {
    steps.push({ kind: 'draft', tone: 'info', params: {} });
  }
  const daysLeft = daysUntil(o.valid_until, today);
  if (daysLeft !== null && daysLeft < 0) {
    steps.push({ kind: 'expired', tone: 'warn', params: { date: o.valid_until ?? '' } });
  }
  if (o.next_evaluation?.overdue) {
    steps.push({ kind: 'overdue', tone: 'warn', params: { date: o.next_evaluation.due_at ?? '' } });
  } else if (o.evaluation_count === 0 && o.status === 'active') {
    steps.push({ kind: 'firstEvaluation', tone: 'warn', params: {} });
  }
  const latest = o.latest_evaluation;
  if (latest && isFailing(latest.result) && !latest.deviation_id && !latest.task_id) {
    steps.push({ kind: 'noFollowUp', tone: 'warn', params: {} });
  }
  if (o.needs_schedule) {
    steps.push({ kind: 'noSchedule', tone: 'warn', params: {} });
  }
  if (o.renewal_due && o.renewal_due_on && (daysLeft === null || daysLeft >= 0)) {
    steps.push({ kind: 'renewal', tone: 'warn', params: { date: o.renewal_due_on } });
  }
  if (o.open_changes > 0) {
    steps.push({ kind: 'changes', tone: 'info', params: { count: o.open_changes } });
  }
  if (steps.length === 0) {
    steps.push({
      kind: 'ok',
      tone: 'pass',
      params: { date: o.next_evaluation?.due_at ?? '' },
    });
  }
  return steps;
}
