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
 * Periodic-review standing for a document. The backend's `review_overdue` is
 * authoritative; "due" is a client-side heads-up for reviews falling within
 * {@link REVIEW_DUE_SOON_DAYS}. Obsolete documents are never flagged.
 */
export function reviewState(doc: Reviewable, now: Date = new Date()): ReviewState {
  if (doc.status === 'obsolete') {
    return null;
  }
  if (doc.review_overdue) {
    return 'overdue';
  }
  if (!doc.next_review_at) {
    return null;
  }
  const due = new Date(doc.next_review_at).getTime();
  if (Number.isNaN(due)) {
    return null;
  }
  if (due < now.getTime()) {
    return 'overdue';
  }
  return due - now.getTime() <= REVIEW_DUE_SOON_DAYS * DAY_MS ? 'due' : null;
}
