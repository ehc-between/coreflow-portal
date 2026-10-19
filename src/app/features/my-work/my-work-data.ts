import { DeviationListItem } from '../../core/deviations/deviation.models';
import { DocumentSummary, Proposal } from '../../core/documents/document.models';
import { isOverdue } from '../deviations/deviation-enums';

/** Statuses that take a deviation off the owner's plate. */
const INACTIVE_STATUSES: ReadonlySet<string> = new Set(['closed', 'cancelled']);

/** A deviation the current user owns, flagged when past its due date. */
export interface OwnedDeviation {
  readonly item: DeviationListItem;
  readonly overdue: boolean;
}

/**
 * The current user's active deviations: drops closed / cancelled ones, flags
 * overdue ones and sorts by due date (soonest first; undated last, then by
 * code for a stable order).
 */
export function assembleOwnedDeviations(
  items: readonly DeviationListItem[],
): readonly OwnedDeviation[] {
  return items
    .filter((d) => !INACTIVE_STATUSES.has(d.status))
    .map((item) => ({ item, overdue: isOverdue(item.due_at, item.status) }))
    .sort((a, b) => {
      const aDue = a.item.due_at ? new Date(a.item.due_at).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.item.due_at ? new Date(b.item.due_at).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) {
        return aDue < bDue ? -1 : 1;
      }
      return a.item.code.localeCompare(b.item.code);
    });
}

/** Something waiting on the user's approval: a pending AI proposal or a document in review. */
export interface ApprovalItem {
  readonly kind: 'proposal' | 'document';
  readonly id: string;
  readonly title: string;
  /** Proposal summary or document code. */
  readonly detail: string | null;
  /** When it entered the queue (proposal created / document last updated). */
  readonly since: string;
  /** Router link to act on it. */
  readonly link: readonly string[];
}

/**
 * Merges pending proposals and in-review documents into one approval queue,
 * oldest first (longest-waiting at the top).
 */
export function assembleApprovals(
  proposals: readonly Proposal[],
  documents: readonly DocumentSummary[],
): readonly ApprovalItem[] {
  const items: ApprovalItem[] = [
    ...proposals.map(
      (p): ApprovalItem => ({
        kind: 'proposal',
        id: p.id,
        title: p.title,
        detail: p.summary || null,
        since: p.created_at,
        link: ['/review', p.id],
      }),
    ),
    ...documents
      .filter((d) => d.status === 'in_review')
      .map(
        (d): ApprovalItem => ({
          kind: 'document',
          id: d.id,
          title: d.title,
          detail: d.doc_code || null,
          since: d.updated_at,
          link: ['/documents', d.id],
        }),
      ),
  ];
  return items.sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime());
}
