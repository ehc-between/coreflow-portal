import { Injectable, inject, signal } from '@angular/core';
import { PageContextService } from '../../core/ai/page-context';
import { ContextChoice, contextFromPage } from './registrer-data';
import { QuickCreateResponse, QuickTypeKey } from './registrer.models';

/** How the dialog opens: straight into one type's form, or on the first step. */
export interface RegistrerOpenOptions {
  readonly type?: QuickTypeKey;
  /** Preselected kind (HMS / security / feedback types). */
  readonly kind?: string;
  /** Link to this instead of the record or requirement the current page shows. */
  readonly context?: ContextChoice | null;
}

/** A record just registered, shown with "Fullfør posten" when its page opens. */
export interface RegisteredRecord {
  readonly response: QuickCreateResponse;
  /** The record's page path (no query), matched against the current URL. */
  readonly path: string;
}

/**
 * The universal "Registrer" dialog (U05): one per app, mounted by the main layout.
 * Anything can open it (the nav button, the N shortcut, "Meld noe" on Home) with
 * `show()`; the record or requirement the page shows is captured at that moment
 * so the new record is linked to it.
 */
@Injectable({ providedIn: 'root' })
export class RegistrerService {
  private readonly pageContext = inject(PageContextService);

  private readonly openState = signal(false);
  readonly open = this.openState.asReadonly();

  private readonly request = signal<RegistrerOpenOptions & { readonly seq: number }>({ seq: 0 });
  /** The options of the latest `show()` (a new object every time it is called). */
  readonly options = this.request.asReadonly();

  private readonly pageChoice = signal<ContextChoice | null>(null);
  /** The page context captured when the dialog opened (null: none). */
  readonly context = this.pageChoice.asReadonly();

  private readonly createdState = signal<RegisteredRecord | null>(null);
  /** The latest record registered here, until dismissed. */
  readonly created = this.createdState.asReadonly();

  show(options: RegistrerOpenOptions = {}): void {
    this.pageChoice.set(
      options.context !== undefined ? options.context : contextFromPage(this.pageContext.current()),
    );
    this.request.update((prev) => ({ ...options, seq: prev.seq + 1 }));
    this.openState.set(true);
  }

  close(): void {
    this.openState.set(false);
  }

  /** Drop the page context (the user chose not to link the new record). */
  unlink(): void {
    this.pageChoice.set(null);
  }

  registered(record: RegisteredRecord | null): void {
    this.createdState.set(record);
  }
}
