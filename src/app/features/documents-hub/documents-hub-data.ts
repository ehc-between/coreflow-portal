import { DocumentSummary } from '../../core/documents/document.models';
import { WorkItem } from '../../core/tasks/task.models';
import { BadgeTone } from '../../shared/ui/badge/badge';
import { daysUntil } from '../company/hub-kit/hub-data';

/**
 * Pure helpers of Dokumenter (`/documents`, docs/ia-v2.md §5.6): "everything that
 * isn't a work procedure". Procedures live in Håndbok (decision D9).
 */

/**
 * Document types that are work procedures by default (the cf230 backfill, §6.4).
 * Used only when the backend does not send a type's own `handbook` flag yet.
 */
export const HANDBOOK_TYPE_KEYS: readonly string[] = [
  'procedure',
  'instruction',
  'work_instruction',
  'checklist',
  'routine',
  'form',
  // A process's own description document (no org type): shown with its process in Håndbok.
  'process',
];

/** A document type as far as the split needs it (`handbook` from cf230 on). */
export interface TypeFlag {
  readonly key: string;
  readonly handbook?: boolean | null;
}

/** Whether documents of type `key` belong in Håndbok rather than Dokumenter. */
export function isHandbookType(key: string, types: readonly TypeFlag[]): boolean {
  const type = types.find((t) => t.key === key);
  if (type && typeof type.handbook === 'boolean') {
    return type.handbook;
  }
  return HANDBOOK_TYPE_KEYS.includes(key);
}

/** Dokumenter's documents: every document whose type is not a work procedure. */
export function nonHandbookDocuments(
  documents: readonly DocumentSummary[],
  types: readonly TypeFlag[],
): DocumentSummary[] {
  return documents.filter((d) => !isHandbookType(d.type, types));
}

/** Whether a type key matches a `?kind=` (plan also matches `plan_*` keys). */
export function kindMatches(typeKey: string, kind: string): boolean {
  return typeKey === kind || (kind === 'plan' && typeKey.startsWith('plan'));
}

/** Documents made from a record (no org document type), named in the hubs scope. */
export const SYSTEM_TYPES = ['process', 'scope', 'context_analysis'] as const;

const STATUS_ORDER: Readonly<Record<string, number>> = {
  in_review: 0,
  draft: 1,
  approved: 2,
  obsolete: 3,
};

/** Waiting for approval first, then drafts, approved, obsolete; then the soonest review. */
export function sortDocuments(documents: readonly DocumentSummary[]): DocumentSummary[] {
  return [...documents].sort((a, b) => {
    const status = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (status) {
      return status;
    }
    const ra = a.next_review_at ?? '9999';
    const rb = b.next_review_at ?? '9999';
    return ra.localeCompare(rb) || a.title.localeCompare(b.title);
  });
}

export const STATUS_TONE: Readonly<Record<string, BadgeTone>> = {
  draft: 'neutral',
  in_review: 'warn',
  approved: 'pass',
  obsolete: 'neutral',
};

/** "Neste gjennomgang": a pill when overdue or within 30 days, else the month (muted). */
export type ReviewCell =
  | {
      readonly kind: 'pill';
      readonly tone: BadgeTone;
      readonly key: string;
      readonly count?: number;
    }
  | { readonly kind: 'month'; readonly iso: string }
  | { readonly kind: 'none' };

export function reviewCell(
  nextReview: string | null | undefined,
  now: Date = new Date(),
): ReviewCell {
  if (!nextReview) {
    return { kind: 'none' };
  }
  const days = daysUntil(nextReview, now);
  if (days < 0) {
    return { kind: 'pill', tone: 'fail', key: 'hubs.documents.review.overdue' };
  }
  if (days <= 13) {
    return { kind: 'pill', tone: 'warn', key: 'hubs.documents.review.inDays', count: days };
  }
  if (days <= 30) {
    return {
      kind: 'pill',
      tone: 'warn',
      key: 'hubs.documents.review.inWeeks',
      count: Math.round(days / 7),
    };
  }
  return { kind: 'month', iso: nextReview };
}

// --- Venter på deg -------------------------------------------------------------------

/** My-work sources that ask the user to approve a document. */
const APPROVE_SOURCES = ['document_review', 'proposal'];

/** A document approval or read confirmation of the user (`GET /my-work`, module documents). */
export function isWaitingDocument(item: WorkItem): boolean {
  return (
    item.module === 'documents' &&
    (item.lane === 'acknowledge' ||
      item.lane === 'review' ||
      item.group === 'awaiting_review' ||
      APPROVE_SOURCES.includes(item.source) ||
      item.source === 'document_ack')
  );
}

/** What the user must do: approve, or read and confirm. */
export function waitingKind(item: WorkItem): 'approve' | 'acknowledge' {
  return item.lane === 'acknowledge' || item.source === 'document_ack' ? 'acknowledge' : 'approve';
}

/** Approvals first, then read confirmations; overdue and soonest first within each. */
export function sortWaiting(items: readonly WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    const kind = (waitingKind(a) === 'approve' ? 0 : 1) - (waitingKind(b) === 'approve' ? 0 : 1);
    if (kind) {
      return kind;
    }
    return (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999');
  });
}

/** Unique readable requirement labels of a row (`iso27001-2022:A.5.15.r1` -> one chip). */
export function requirementLabels(
  refs: readonly string[] | null | undefined,
  label: (ref: string) => string,
): string[] {
  const out: string[] = [];
  for (const ref of refs ?? []) {
    const text = label(ref);
    if (text && !out.includes(text)) {
      out.push(text);
    }
  }
  return out;
}
