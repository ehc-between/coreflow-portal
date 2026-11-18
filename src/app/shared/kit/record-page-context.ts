import { Injectable, signal } from '@angular/core';

/**
 * One line of a record's "Hva mangler" box (U29): something the record still
 * needs. `labelKey` is an i18n key (with `params`); the line is a link
 * (`link` + `queryParams` / `fragment`) or a button (`action`).
 */
export interface RecordMissingItem {
  readonly key: string;
  readonly labelKey: string;
  readonly params?: Record<string, unknown>;
  readonly link?: string | readonly unknown[];
  readonly queryParams?: Record<string, unknown>;
  readonly fragment?: string;
  readonly action?: () => void;
}

/** What the requirements panel offers the record page (U29). */
export interface RecordRequirementsHandle {
  /** Number of suggested requirements waiting for a decision. */
  readonly pending: number;
  /** Ask for more suggestions ("Foreslå flere krav"), or null when not offered now. */
  readonly suggestMore: (() => void) | null;
  /** Open the full panel (confirm / reject the suggestions). */
  readonly review: () => void;
}

/**
 * The record page a component sits on (simplify U29, "record page diet").
 *
 * `app-record-detail-layout` provides one per page in its `providers`, so the
 * kit pieces a page projects into it (the help strip, the follow button, the
 * requirements panel) can find it with `inject(RecordPageContext, { optional:
 * true })` and hand their controls over to the layout's single places: the "?"
 * in the header, "Mer ⋯" and the "Hva mangler" box. Outside a record page the
 * token is absent and the components render as before.
 */
@Injectable()
export class RecordPageContext {
  /** The record the page shows (set by the layout). */
  readonly entityType = signal('');
  readonly entityId = signal('');

  /** Opens the page's help panel (set by `app-help-strip`), or null. */
  readonly help = signal<(() => void) | null>(null);

  /** Set by `app-supports-requirements` while it is on the page. */
  readonly requirements = signal<RecordRequirementsHandle | null>(null);

  /** Whether `type`/`id` is the record this page shows. */
  isRecord(type: string, id: string): boolean {
    return !!id && this.entityType() === type && this.entityId() === id;
  }
}
