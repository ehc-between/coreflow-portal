/** A document's periodic-review standing: overdue, due soon, or nothing to flag. */
export type ReviewState = 'overdue' | 'due' | null;

/** How far ahead a scheduled review counts as "due soon". */
export const REVIEW_DUE_SOON_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The review fields shared by list rows and the detail view. */
export interface Reviewable {
  readonly status: string;
  readonly next_review_at?: string | null;
  readonly review_overdue?: boolean;
}

/**
 * A `YYYY-MM-DD` (or ISO datetime) value as a calendar-day number. Only the
 * date part is read, so a review date is never shifted by the time zone.
 */
function dayNumber(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

/** Today's local calendar date as a day number comparable with {@link dayNumber}. */
function today(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
}

/**
 * Periodic-review standing for a document. When the backend sends
 * `review_overdue` it decides overdue; otherwise a review is overdue only when
 * `next_review_at` is strictly before today's local date. "Due" is a heads-up
 * for reviews within {@link REVIEW_DUE_SOON_DAYS} days (today included).
 * Obsolete documents are never flagged.
 */
export function reviewState(doc: Reviewable, now: Date = new Date()): ReviewState {
  if (doc.status === 'obsolete') {
    return null;
  }
  if (doc.review_overdue === true) {
    return 'overdue';
  }
  const due = doc.next_review_at ? dayNumber(doc.next_review_at) : null;
  if (due === null) {
    return null;
  }
  const daysLeft = due - today(now);
  if (daysLeft < 0) {
    // Past due by the local clock; an explicit `false` from the backend wins.
    return doc.review_overdue === false ? 'due' : 'overdue';
  }
  return daysLeft <= REVIEW_DUE_SOON_DAYS ? 'due' : null;
}
