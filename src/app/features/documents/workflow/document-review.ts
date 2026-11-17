import { ReviewState } from '../../../core/documents/review-state';

export {
  REVIEW_DUE_SOON_DAYS,
  type ReviewState,
  reviewState,
} from '../../../core/documents/review-state';

/** i18n key for a review-state badge. */
export function reviewLabelKey(state: Exclude<ReviewState, null>): string {
  return state === 'overdue' ? 'documents.review.overdue' : 'documents.review.dueSoon';
}

/** The `YYYY-MM-DD` part of an ISO date/datetime, for a date input. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/** Review-interval choices (months) offered in the settings panel. */
export const REVIEW_INTERVALS: readonly number[] = [3, 6, 12, 24, 36];
