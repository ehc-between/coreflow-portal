import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DocumentControlUpdate, DocumentDetail } from '../../../core/documents/document.models';
import { documentErrorKey } from '../../../core/documents/document-errors';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { REVIEW_INTERVALS, toDateInput } from './document-review';

let nextId = 0;

/**
 * The periodic review settings form (interval and next review date), opened from
 * "Endre" / "Planlegg" in the document page's "Oppfølging" card, which shows the
 * values themselves. Saving PATCHes the document and emits it via `changed`;
 * `closed` fires on cancel and after a save. Read-and-understood lives in its
 * own card (`app-document-acknowledgement-list`).
 */
@Component({
  selector: 'app-document-review-panel',
  imports: [TranslocoPipe, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <form class="flex flex-col gap-3" data-testid="review-form" (submit)="save($event)">
      <div class="flex flex-col gap-1.5">
        <label [attr.for]="ids.interval" class="text-meta font-semibold text-fg-muted">
          {{ 'documents.review.interval' | transloco }}
        </label>
        <select
          [id]="ids.interval"
          [value]="intervalValue()"
          (change)="intervalValue.set(fieldValue($event))"
          class="h-9 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
        >
          <option value="">{{ 'documents.review.noInterval' | transloco }}</option>
          @for (months of intervals; track months) {
            <option [value]="months" [selected]="intervalValue() === '' + months">
              {{ 'documents.review.everyMonths' | transloco: { months } }}
            </option>
          }
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <label [attr.for]="ids.next" class="text-meta font-semibold text-fg-muted">
          {{ 'documents.review.nextReview' | transloco }}
        </label>
        <input
          [id]="ids.next"
          type="date"
          [value]="nextValue()"
          (change)="nextValue.set(fieldValue($event))"
          class="h-9 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
        />
        <span class="text-meta text-fg-subtle">{{
          'documents.review.nextReviewHint' | transloco
        }}</span>
      </div>
      <div class="flex justify-end gap-2">
        <app-button variant="secondary" size="sm" [disabled]="saving()" (click)="cancel()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" size="sm" [loading]="saving()">
          {{ 'common.save' | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class DocumentReviewPanel {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly document = input.required<DocumentDetail>();
  readonly changed = output<DocumentDetail>();
  /** Cancelled, or saved. */
  readonly closed = output<void>();

  protected readonly intervals = REVIEW_INTERVALS;
  protected readonly ids = {
    interval: `review-interval-${nextId}`,
    next: `review-next-${nextId++}`,
  };

  protected readonly saving = signal(false);

  // Form values, reset from the document whenever it changes.
  protected readonly intervalValue = linkedSignal(() =>
    this.document().review_interval_months ? String(this.document().review_interval_months) : '',
  );
  protected readonly nextValue = linkedSignal(() => toDateInput(this.document().next_review_at));
  protected readonly ackValue = linkedSignal(
    () => this.document().acknowledgement?.required ?? false,
  );

  protected fieldValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected cancel(): void {
    const doc = this.document();
    this.intervalValue.set(doc.review_interval_months ? String(doc.review_interval_months) : '');
    this.nextValue.set(toDateInput(doc.next_review_at));
    this.ackValue.set(doc.acknowledgement?.required ?? false);
    this.closed.emit();
  }

  protected save(event: Event): void {
    event.preventDefault();
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api
      .updateControl(
        orgId,
        this.document().id,
        controlChanges(this.document(), {
          interval: this.intervalValue(),
          next: this.nextValue(),
          ack: this.ackValue(),
        }),
      )
      .subscribe({
        next: (document) => {
          this.saving.set(false);
          this.notifications.success('documents.review.savedToast');
          this.changed.emit(document);
          this.closed.emit();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.notifications.error(documentErrorKey(error, 'updateControl'));
        },
      });
  }
}

/**
 * The PATCH body for the review settings form: only the fields that changed.
 * Omitting an unchanged (empty) next-review date lets the backend schedule it
 * from a newly set interval; an explicit null clears it.
 */
export function controlChanges(
  doc: DocumentDetail,
  form: { interval: string; next: string; ack: boolean },
): DocumentControlUpdate {
  const body: { -readonly [K in keyof DocumentControlUpdate]: DocumentControlUpdate[K] } = {};
  const interval = form.interval ? Number(form.interval) : null;
  if (interval !== (doc.review_interval_months ?? null)) {
    body.review_interval_months = interval;
  }
  if (form.next !== toDateInput(doc.next_review_at)) {
    body.next_review_at = form.next || null;
  }
  if (form.ack !== (doc.acknowledgement?.required ?? false)) {
    body.acknowledgement_required = form.ack;
  }
  return body;
}
