import { DocumentStatus } from '../../core/documents/document.models';

/**
 * i18n key for a document status label. Colours come from the shared tone map
 * (`<app-status-badge meaning="lifecycle">` / `toneFor('lifecycle', status)`).
 */
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

/** The steps of a document's life, in order, for the lifecycle stepper. */
export const LIFECYCLE_STEPS: readonly DocumentStatus[] = [
  'draft',
  'in_review',
  'approved',
  'obsolete',
];

/** Where a document is in its life: each step is done, current or still ahead. */
export type StepState = 'done' | 'current' | 'todo';

/**
 * The state of every lifecycle step for a document. A document with an approved
 * revision and a new draft is still "approved" for its readers, so the draft
 * work shows as the current step while approval stays done.
 */
export function lifecycleSteps(
  status: DocumentStatus,
  hasApprovedRevision: boolean,
): readonly { readonly step: DocumentStatus; readonly state: StepState }[] {
  const index = LIFECYCLE_STEPS.indexOf(status);
  return LIFECYCLE_STEPS.map((step, i) => {
    let state: StepState = i < index ? 'done' : i === index ? 'current' : 'todo';
    if (step === 'approved' && hasApprovedRevision && status !== 'obsolete') {
      state = status === 'approved' ? 'current' : 'done';
    }
    return { step, state };
  });
}

/**
 * The readable name of a document's type: the API's `type_name`, else the org
 * type with that key, else the key with its first letter capitalised (never the
 * raw lowercase key).
 */
export function documentTypeName(
  doc: { readonly type: string; readonly type_name?: string | null },
  types: readonly { readonly key: string; readonly name: string }[] = [],
): string {
  if (doc.type_name) {
    return doc.type_name;
  }
  const known = types.find((t) => t.key === doc.type);
  if (known) {
    return known.name;
  }
  const key = (doc.type ?? '').replace(/_/g, ' ').trim();
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
}
