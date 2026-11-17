import { formatNumber } from '@angular/common';
import { ToneMeaning } from '../../../shared/ui/tones';
import {
  APPROVAL_STATUSES,
  Answer,
  AnswerValue,
  AttentionCode,
  CertificateIn,
  CertificateStatus,
  Criticality,
  Decision,
  DpaStatus,
  EvaluationKind,
  EvaluationStatus,
  Question,
  Recommendation,
  SupplierFields,
  SupplierStatus,
} from './supplier.models';

/** A badge on the shared tone map: `<app-status-badge [meaning] [value] [labelKey]>`. */
export interface BadgeSpec {
  readonly meaning: ToneMeaning;
  readonly value: string;
}

const lifecycle = (value: string): BadgeSpec => ({ meaning: 'lifecycle', value });
const compliance = (value: string): BadgeSpec => ({ meaning: 'compliance', value });

const SUPPLIER_STATUS_BADGES: Readonly<Record<SupplierStatus, BadgeSpec>> = {
  prospective: lifecycle('planned'),
  under_evaluation: lifecycle('in_progress'),
  approved: lifecycle('approved'),
  conditional: compliance('partial'),
  suspended: lifecycle('failed'),
  rejected: lifecycle('rejected'),
  inactive: lifecycle('archived'),
};

/** A supplier status: approved green, conditional amber, suspended / rejected red. */
export function supplierStatusBadge(status: SupplierStatus): BadgeSpec {
  return SUPPLIER_STATUS_BADGES[status] ?? lifecycle(status);
}

/** Criticality uses the severity scale (critical / high red, medium amber, low grey). */
export function criticalityBadge(criticality: Criticality): BadgeSpec {
  return { meaning: 'severity', value: criticality };
}

/** An evaluation status: draft grey, waiting for a decision blue, decided green. */
export function evaluationStatusBadge(status: EvaluationStatus): BadgeSpec {
  return lifecycle(status);
}

/** A decision or the score's recommendation: approve green, conditional amber, reject red. */
export function decisionBadge(decision: Decision | Recommendation): BadgeSpec {
  switch (decision) {
    case 'approved':
    case 'approve':
      return lifecycle('approved');
    case 'conditional':
      return compliance('partial');
    default:
      return lifecycle('rejected');
  }
}

/** EU/EEA green, adequacy blue, third country amber (it needs a transfer tool). */
export function zoneBadge(zone: string): BadgeSpec {
  switch (zone) {
    case 'eea':
      return compliance('compliant');
    case 'adequacy':
      return lifecycle('open');
    default:
      return lifecycle('due');
  }
}

/** A certificate: valid green, expiring amber, expired red, no expiry date grey. */
export function certificateBadge(status: CertificateStatus): BadgeSpec {
  switch (status) {
    case 'valid':
      return lifecycle('effective');
    case 'expiring':
      return lifecycle('expiring');
    case 'expired':
      return lifecycle('failed');
    default:
      return compliance('not_assessed');
  }
}

/** Data processing agreement coverage: covered green, pending amber, missing red. */
export function dpaBadge(status: DpaStatus): BadgeSpec {
  switch (status) {
    case 'covered':
      return compliance('compliant');
    case 'pending':
      return compliance('partial');
    case 'missing':
      return compliance('non_compliant');
    default:
      return compliance('not_applicable');
  }
}

/** A "Trenger oppfølging" flag: always amber, never only colour (it has a label). */
export const ATTENTION_BADGE: BadgeSpec = lifecycle('due');

/**
 * What to do about a flag: the action the page offers next to its explanation.
 * `flow` keys start a create-from-here flow; the others are page actions.
 */
export type AttentionAction =
  | { readonly kind: 'evaluate'; readonly evaluation: EvaluationKind }
  | { readonly kind: 'edit' }
  | { readonly kind: 'flow'; readonly flow: string; readonly permission: string }
  | { readonly kind: 'agreements' };

export function attentionAction(code: AttentionCode, approved: boolean): AttentionAction {
  switch (code) {
    case 'not_approved':
      return { kind: 'evaluate', evaluation: approved ? 'periodic' : 'initial' };
    case 'evaluation_overdue':
      return { kind: 'evaluate', evaluation: 'periodic' };
    case 'weak_performance':
      return { kind: 'evaluate', evaluation: 'ad_hoc' };
    case 'dpa_missing':
      return { kind: 'flow', flow: 'supplier.to_dpa', permission: 'contracts:write' };
    case 'dpa_pending':
      return { kind: 'agreements' };
    case 'transfer_assessment_missing':
      return { kind: 'flow', flow: 'supplier.to_transfer', permission: 'privacy:write' };
    default:
      return { kind: 'edit' };
  }
}

/** "64 / 100" or "64 / 100 (grense 70)" params for a score; null without a score. */
export function scoreParams(
  score: number | null | undefined,
  pass: number | null | undefined,
  locale: string,
): { readonly score: string; readonly pass: number | null } | null {
  if (score === null || score === undefined) {
    return null;
  }
  return {
    score: formatNumber(score, locale, '1.0-1'),
    pass: pass === null || pass === undefined ? null : pass,
  };
}

/** Whether moving between these statuses needs `suppliers:approve`. */
export function needsApproval(from: SupplierStatus, to: SupplierStatus): boolean {
  return APPROVAL_STATUSES.includes(from) || APPROVAL_STATUSES.includes(to);
}

/** The statuses a user may pick for a supplier currently in `current`. */
export function allowedTargets(
  current: SupplierStatus,
  all: readonly SupplierStatus[],
  canApprove: boolean,
): readonly SupplierStatus[] {
  return all.filter((s) => s !== current && (canApprove || !needsApproval(current, s)));
}

/** Criticality default re-evaluation interval in months (mirrors the backend). */
export const DEFAULT_INTERVAL_MONTHS: Readonly<Record<Criticality, number>> = {
  critical: 12,
  high: 12,
  medium: 24,
  low: 36,
};

// --- local scoring preview ----------------------------------------------------------

export interface ScorePreview {
  /** Weighted percentage (0-100, one decimal), or null when nothing scored is answered. */
  readonly score: number | null;
  readonly answered: number;
  readonly total: number;
  readonly criticalFailures: readonly string[];
  readonly recommendation: Recommendation | null;
  /** Required questions without an answer. */
  readonly unanswered: readonly string[];
}

/**
 * The score of an answer set, computed the same way as the backend so the evaluator
 * sees the result while answering (the server's score is authoritative). Text and
 * "na" answers are not scored; a "no" or a 0 on a critical question is a critical
 * failure. The recommendation is advisory only.
 */
export function previewScore(
  questions: readonly Question[],
  answers: Readonly<Record<string, Pick<Answer, 'value'>>>,
  passScore: number,
): ScorePreview {
  let points = 0;
  let max = 0;
  let answered = 0;
  const failures: string[] = [];
  const unanswered: string[] = [];
  for (const q of questions) {
    const value = answers[q.id]?.value;
    const hasValue = value !== null && value !== undefined && value !== '';
    if (hasValue) {
      answered++;
    } else if (q.required) {
      unanswered.push(q.id);
    }
    if (q.type === 'text' || !hasValue || value === 'na') {
      continue;
    }
    const weight = q.weight || 1;
    let fraction: number;
    if (q.type === 'yes_no') {
      fraction = value === 'yes' ? 1 : 0;
    } else {
      fraction = Math.min(Math.max(Number(value) / (q.max_score || 5), 0), 1);
    }
    points += weight * fraction;
    max += weight;
    if (q.critical && fraction === 0) {
      failures.push(q.id);
    }
  }
  const score = max > 0 ? Math.round((points / max) * 1000) / 10 : null;
  return {
    score,
    answered,
    total: questions.length,
    criticalFailures: failures,
    recommendation: recommend(score, failures.length > 0, passScore),
    unanswered,
  };
}

export function recommend(
  score: number | null,
  criticalFailure: boolean,
  passScore: number,
): Recommendation | null {
  if (score === null) {
    return null;
  }
  if (score >= passScore && !criticalFailure) {
    return 'approve';
  }
  if (score >= passScore - 20) {
    return 'conditional';
  }
  return 'reject';
}

/** Normalise an answer value from a form control (score answers become integers). */
export function answerValue(question: Question, raw: string): AnswerValue {
  if (raw === '') {
    return null;
  }
  if (question.type === 'score' && raw !== 'na') {
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  }
  return raw;
}

// --- form helpers ---------------------------------------------------------------------

/** Split a comma / newline separated list into trimmed, unique, non-empty items. */
export function splitList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** The wire form of certificate rows (blank rows dropped; blank strings become null). */
export function certificatesBody(rows: readonly CertificateIn[]): CertificateIn[] {
  return rows
    .map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      standard: r.standard || null,
      label: blankToNull(r.label),
      number: blankToNull(r.number),
      issuer: blankToNull(r.issuer),
      valid_until: r.valid_until || null,
      attachment_id: r.attachment_id || null,
    }))
    .filter((r) => r.standard || r.label);
}

/** `''` -> null, otherwise the trimmed text. */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

/** The fields of `next` that differ from `current` (for a minimal PATCH body). */
export function changedFields(
  current: SupplierFields,
  next: SupplierFields,
): Partial<SupplierFields> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof SupplierFields)[]) {
    const a = current[key];
    const b = next[key];
    const same = Array.isArray(a) && Array.isArray(b) ? a.join('\n') === b.join('\n') : a === b;
    if (!same) {
      out[key] = b;
    }
  }
  return out as Partial<SupplierFields>;
}

/** A `YYYY-MM-DD` day as the naive-UTC start-of-day wire value, or null. */
export function dayToWire(day: string | null | undefined): string | null {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00` : null;
}

/** The leading `YYYY-MM-DD` of a wire date-time, or ''. */
export function wireToDay(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

/** A percentage rate (0-100, from the API) rounded to a whole number, or null. */
export function ratePercent(rate: number | null | undefined): number | null {
  return rate === null || rate === undefined ? null : Math.round(rate);
}
