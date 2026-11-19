import { DocumentDetail } from '../../core/documents/document.models';
import { RecordMissingItem } from '../../shared/kit/record-detail-layout';
import { StatusLineTone } from '../../shared/kit/record-sections';

/** The "Hovedinformasjon" status sentence of a document (docs/ux-guide.md §2.7). */
export interface DocumentStatusLine {
  readonly key: string;
  readonly params: Record<string, unknown>;
  readonly tone: StatusLineTone;
  /** Second sentence (e.g. "Rev B gjelder fram til da."), or null. */
  readonly extraKey: string | null;
  readonly extraParams: Record<string, unknown>;
}

const KEY = 'documents.page.detail.status';

/**
 * Where the document stands, in plain words: approved (green), a draft or one
 * waiting for approval (a to-do, amber, never red), obsolete (neutral). While a
 * new version is written or approved, the sentence says which version applies.
 */
export function documentStatusLine(doc: DocumentDetail): DocumentStatusLine {
  const approved = doc.current_revision;
  const applies = approved
    ? { extraKey: `${KEY}.stillApplies`, extraParams: { rev: approved.rev } }
    : { extraKey: null, extraParams: {} };
  switch (doc.status) {
    case 'approved':
      return { key: `${KEY}.approved`, params: {}, tone: 'pass', extraKey: null, extraParams: {} };
    case 'obsolete':
      return {
        key: `${KEY}.obsolete`,
        params: {},
        tone: 'neutral',
        extraKey: null,
        extraParams: {},
      };
    case 'in_review': {
      const name = (doc.draft_revision ?? approved)?.requested_approver_name;
      return {
        key: name ? `${KEY}.inReview` : `${KEY}.inReviewAny`,
        params: { name },
        tone: 'warn',
        ...applies,
      };
    }
    default:
      return approved
        ? { key: `${KEY}.revising`, params: {}, tone: 'pass', ...applies }
        : { key: `${KEY}.draft`, params: {}, tone: 'warn', extraKey: null, extraParams: {} };
  }
}

/**
 * What a document still needs, for the "Oppfølging" card: the changes an
 * approver asked for (drafters) and an overdue periodic review (owner or
 * approver). The kit adds requirement and link suggestions itself.
 */
export function documentMissing(
  doc: DocumentDetail,
  opts: {
    readonly canEdit: boolean;
    readonly canManage: boolean;
    readonly reviewOverdue: boolean;
    readonly editLink: readonly unknown[];
    readonly planReview: () => void;
  },
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (opts.canEdit && doc.status === 'draft' && doc.pending_change_request) {
    items.push({
      key: 'changes',
      labelKey: 'documents.page.detail.missing.changes',
      link: opts.editLink,
    });
  }
  if (opts.canManage && opts.reviewOverdue && doc.status !== 'obsolete') {
    items.push({
      key: 'review',
      labelKey: 'documents.page.detail.missing.review',
      action: opts.planReview,
    });
  }
  return items;
}
