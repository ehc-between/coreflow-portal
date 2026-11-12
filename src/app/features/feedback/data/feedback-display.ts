import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  FeedbackAction,
  FeedbackKind,
  FeedbackSentiment,
  FeedbackSeverity,
  FeedbackStatus,
  OPEN_FEEDBACK_STATUSES,
  QuestionType,
  SurveyStatus,
} from './feedback.models';

/** i18n keys and badge tones for feedback and survey values (scope `feedback`). */

export const feedbackKindKey = (kind: FeedbackKind | string) => `feedback.kinds.${kind}`;
export const feedbackChannelKey = (channel: string) => `feedback.channels.${channel}`;
export const feedbackStatusKey = (status: FeedbackStatus | string) => `feedback.status.${status}`;
export const feedbackSeverityKey = (s: FeedbackSeverity | string) => `feedback.severities.${s}`;
export const feedbackSentimentKey = (s: FeedbackSentiment | string) => `feedback.sentiments.${s}`;
export const feedbackActionKey = (a: FeedbackAction | string) => `feedback.actions.${a}`;
export const surveyStatusKey = (status: SurveyStatus | string) => `feedback.surveyStatus.${status}`;
export const questionTypeKey = (type: QuestionType | string) => `feedback.questionTypes.${type}`;

/** `-received_on` -> `received_onDesc` (the sort option's i18n key suffix). */
export function sortKey(sort: string): string {
  return sort.startsWith('-') ? `${sort.slice(1)}Desc` : sort;
}

export function feedbackStatusTone(status: FeedbackStatus | string): BadgeTone {
  switch (status) {
    case 'new':
      return 'info';
    case 'acknowledged':
    case 'in_progress':
      return 'warn';
    case 'resolved':
      return 'pass';
    default:
      return 'neutral';
  }
}

export function feedbackKindTone(kind: FeedbackKind | string): BadgeTone {
  switch (kind) {
    case 'complaint':
      return 'fail';
    case 'compliment':
      return 'pass';
    case 'suggestion':
      return 'accent';
    case 'inquiry':
      return 'info';
    default:
      return 'neutral';
  }
}

export function severityTone(severity: FeedbackSeverity | string | null): BadgeTone {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'fail';
    case 'medium':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function sentimentTone(sentiment: FeedbackSentiment | string | null): BadgeTone {
  switch (sentiment) {
    case 'positive':
      return 'pass';
    case 'negative':
      return 'fail';
    default:
      return 'neutral';
  }
}

export function surveyStatusTone(status: SurveyStatus | string): BadgeTone {
  switch (status) {
    case 'open':
      return 'pass';
    case 'draft':
      return 'info';
    default:
      return 'neutral';
  }
}

export function isOpenFeedback(status: FeedbackStatus | string | undefined | null): boolean {
  return !!status && (OPEN_FEEDBACK_STATUSES as readonly string[]).includes(status);
}

/** NPS ranges from -100 to 100: green from 30, amber from 0, otherwise red. */
export function npsTone(nps: number | null | undefined): 'pass' | 'warn' | 'fail' | 'neutral' {
  if (nps === null || nps === undefined) {
    return 'neutral';
  }
  return nps >= 30 ? 'pass' : nps >= 0 ? 'warn' : 'fail';
}

/** A 0–100 score: green from 75, amber from 50, otherwise red. */
export function scoreTone(score: number | null | undefined): 'pass' | 'warn' | 'fail' | 'neutral' {
  if (score === null || score === undefined) {
    return 'neutral';
  }
  return score >= 75 ? 'pass' : score >= 50 ? 'warn' : 'fail';
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
