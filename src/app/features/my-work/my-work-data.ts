import {
  ActionListItem,
  ActionListResponse,
  DeviationListItem,
} from '../../core/deviations/deviation.models';
import { DocumentSummary, Proposal } from '../../core/documents/document.models';
import { isActionOverdue, isOverdue } from '../deviations/deviation-enums';

/** A deviation the current user owns, flagged when past its due date. */
export interface OwnedDeviation {
  readonly item: DeviationListItem;
  readonly overdue: boolean;
}

/**
 * The current user's active deviations (the backend already excludes closed /
 * cancelled via `active=true`): flags overdue ones and sorts by due date
 * (soonest first; undated last, then by code for a stable order).
 */
export function assembleOwnedDeviations(
  items: readonly DeviationListItem[],
): readonly OwnedDeviation[] {
  return items
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

/** The user's open CAPA actions, as shown on My Work. */
export interface MyActions {
  /** Open / in-progress actions in the backend's order (soonest due first, undated last). */
  readonly items: readonly ActionListItem[];
  /** How many of the user's open actions are past their due date (server count, not just this page). */
  readonly overdueCount: number;
  /** Total open actions the user owns (may exceed `items` when the page is capped). */
  readonly total: number;
  /** True when the user owns more open actions than one page returned. */
  readonly truncated: boolean;
}

/**
 * Summarises a page of the user's actions (`owner_user_id=me`, default open
 * statuses). `overdueTotal` is the server's count for the same query with
 * `overdue=true`; without it, the overdue rows on this page are counted.
 */
export function assembleMyActions(page: ActionListResponse, overdueTotal?: number): MyActions {
  return {
    items: page.items,
    overdueCount:
      overdueTotal ?? page.items.filter((a) => isActionOverdue(a.due_at, a.status)).length,
    total: page.total,
    truncated: page.total > page.items.length,
  };
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
