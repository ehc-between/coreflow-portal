import { KpiTone } from '../../../shared/ui/kpi-tile/kpi-tile';
import {
  FeedbackAction,
  FeedbackKind,
  FeedbackSentiment,
  FeedbackSeverity,
  FeedbackStatus,
  MonthlyStat,
  OPEN_FEEDBACK_STATUSES,
  QuestionType,
  SurveyStatus,
} from './feedback.models';

/**
 * i18n keys and small display helpers for feedback and survey values (scope
 * `feedback`). Badge colours come from the shared tone map (`app-status-badge`);
 * the kind of feedback is not a status, so it is shown as a neutral badge.
 */

export const feedbackKindKey = (kind: FeedbackKind | string) => `feedback.kinds.${kind}`;
export const feedbackChannelKey = (channel: string) => `feedback.channels.${channel}`;
export const feedbackStatusKey = (status: FeedbackStatus | string) => `feedback.status.${status}`;
export const feedbackSeverityKey = (s: FeedbackSeverity | string) => `feedback.severities.${s}`;
export const feedbackSentimentKey = (s: FeedbackSentiment | string) => `feedback.sentiments.${s}`;
export const feedbackActionKey = (a: FeedbackAction | string) => `feedback.actions.${a}`;
export const surveyStatusKey = (status: SurveyStatus | string) => `feedback.surveyStatus.${status}`;
export const questionTypeKey = (type: QuestionType | string) => `feedback.questionTypes.${type}`;
export const replyChannelKey = (channel: string) => `feedback.replyChannels.${channel}`;
export const subjectTypeKey = (type: string) => `feedback.subjectTypes.${type}`;

/** `-received_on` -> `received_onDesc` (the sort option's i18n key suffix). */
export function sortKey(sort: string): string {
  return sort.startsWith('-') ? `${sort.slice(1)}Desc` : sort;
}

export function isOpenFeedback(status: FeedbackStatus | string | undefined | null): boolean {
  return !!status && (OPEN_FEEDBACK_STATUSES as readonly string[]).includes(status);
}

/**
 * The tile colour of a net promoter score (−100 to 100): green from 30, amber
 * from 0, otherwise amber too. A low score is something to work on, not a failure.
 */
export function npsLevel(nps: number | null | undefined): KpiTone {
  if (nps === null || nps === undefined) {
    return 'neutral';
  }
  return nps >= 30 ? 'pass' : 'warn';
}

/** The tile colour of a 0–100 score: green from 75, amber below. */
export function scoreLevel(score: number | null | undefined): KpiTone {
  if (score === null || score === undefined) {
    return 'neutral';
  }
  return score >= 75 ? 'pass' : 'warn';
}

/** Round for display (one decimal), or null. */
export function round1(value: number | null | undefined): number | null {
  return value === null || value === undefined || Number.isNaN(value)
    ? null
    : Math.round(value * 10) / 10;
}

/** The share of `count` in `total` as a whole percentage (0 when total is 0). */
export function percentOf(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

/** ISO day (`YYYY-MM-DD`) for a local date. */
export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today plus `days` as an ISO day. */
export function addDays(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return isoDay(d);
}

/** A 0–100 survey threshold on a 1–5 rating scale ("2 of 5"), or null. */
export function thresholdOnFive(threshold: number | null | undefined): number | null {
  if (threshold === null || threshold === undefined || Number.isNaN(threshold)) {
    return null;
  }
  // Scores map 1..5 linearly onto 0..100 (1 = 0, 5 = 100).
  return Math.max(1, Math.min(5, Math.round((threshold / 100) * 4 + 1)));
}

/**
 * The months of a trend worth showing: leading and trailing months without any
 * feedback are dropped, gaps in between are kept so the chart stays honest.
 */
export function trimmedMonths(monthly: readonly MonthlyStat[]): readonly MonthlyStat[] {
  const first = monthly.findIndex((m) => m.total > 0);
  if (first < 0) {
    return [];
  }
  let last = monthly.length - 1;
  while (last > first && monthly[last].total === 0) {
    last--;
  }
  return monthly.slice(first, last + 1);
}

/** A download file name: `<slug>-<YYYY-MM-DD>.<ext>`. */
export function exportFileName(title: string, format: string, today: Date = new Date()): string {
  const slug =
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'o')
      .replace(/å/g, 'a')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'feedback';
  return `${slug}-${isoDay(today)}.${format}`;
}

/** Trigger a browser download of a Blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Router link of a backend portal `url` (`/suppliers/…`), else null. */
export function portalLink(url: string | null | undefined): string | null {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : null;
}
