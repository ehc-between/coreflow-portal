import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  APPROVAL_STATUSES,
  Answer,
  AnswerValue,
  Criticality,
  Decision,
  EvaluationStatus,
  Question,
  Recommendation,
  SupplierFields,
  SupplierStatus,
} from './supplier.models';

/** Badge tone of a supplier status. */
export function statusTone(status: SupplierStatus): BadgeTone {
  switch (status) {
    case 'approved':
      return 'pass';
    case 'conditional':
    case 'under_evaluation':
      return 'warn';
    case 'suspended':
    case 'rejected':
      return 'fail';
    case 'prospective':
      return 'info';
    default:
      return 'neutral';
  }
}

/** Badge tone of a criticality. */
export function criticalityTone(criticality: Criticality): BadgeTone {
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

export function evaluationStatusTone(status: EvaluationStatus): BadgeTone {
  switch (status) {
    case 'draft':
      return 'info';
    case 'submitted':
      return 'warn';
    case 'completed':
      return 'pass';
    default:
      return 'neutral';
  }
}

export function decisionTone(decision: Decision | Recommendation | null): BadgeTone {
  switch (decision) {
    case 'approved':
    case 'approve':
      return 'pass';
    case 'conditional':
      return 'warn';
    case 'rejected':
    case 'reject':
      return 'fail';
    default:
      return 'neutral';
  }
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
