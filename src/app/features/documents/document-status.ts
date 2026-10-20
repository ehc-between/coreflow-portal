import { BadgeTone } from '../../shared/ui/badge/badge';
import { DocumentStatus } from '../../core/documents/document.models';

/** Maps a document status to a design-system badge tone. */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'approved':
      return 'pass';
    case 'in_review':
      return 'warn';
    case 'obsolete':
    case 'superseded':
    case 'withdrawn':
      return 'neutral';
    case 'draft':
    default:
      return 'info';
  }
}

/** i18n key for a document status label. */
export function statusLabelKey(status: string): string {
  return `documents.status.${status}`;
}

/** The selectable status filters, in display order (plus "all"). */
export const STATUS_FILTERS: readonly DocumentStatus[] = [
  'draft',
  'in_review',
  'approved',
  'obsolete',
];
