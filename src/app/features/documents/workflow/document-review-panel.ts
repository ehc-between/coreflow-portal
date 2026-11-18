import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { DocumentControlUpdate, DocumentDetail } from '../../../core/documents/document.models';
import { documentErrorKey } from '../../../core/documents/document-errors';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { REVIEW_INTERVALS, reviewLabelKey, reviewState, toDateInput } from './document-review';

let nextId = 0;

/**
 * Periodic review card for the detail aside. Everyone sees the review interval,
 * the next review date and a due / overdue badge. Managers (owner or
 * `documents:approve`) can change the interval and the next review date;
 * saving PATCHes the document and emits it via `changed`. Read-and-understood
 * lives in its own card (`app-document-read-confirm`).
 */
@Component({
  selector: 'app-document-review-panel',
  imports: [StatusBadge, LocalDayPipe, TranslocoPipe, Button, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card [padded]="false">
      <div class="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
        <h2 class="font-display text-card font-bold tracking-[-0.02em] text-fg">
          {{ 'documents.review.title' | transloco }}
        </h2>
        @if (state(); as s) {
          <app-status-badge meaning="lifecycle" [value]="s" [labelKey]="reviewLabelKey(s)" />
        }
      </div>

      @if (editing()) {
        <form class="flex flex-col gap-3 px-4 pt-2 pb-4" (submit)="save($event)">
          <div class="flex flex-col gap-1.5">
            <label [attr.for]="ids.interval" class="text-ui font-semibold text-fg-muted">
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
            <label [attr.for]="ids.next" class="text-ui font-semibold text-fg-muted">
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
      } @else {
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 pt-2 pb-4 text-ui">
          <dt class="text-fg-subtle">{{ 'documents.review.interval' | transloco }}</dt>
          <dd class="text-fg">
            @if (document().review_interval_months; as months) {
              {{ 'documents.review.everyMonths' | transloco: { months } }}
            } @else {
              {{ 'documents.review.noInterval' | transloco }}
            }
          </dd>
          <dt class="text-fg-subtle">{{ 'documents.review.nextReview' | transloco }}</dt>
          <dd [class]="state() === 'overdue' ? 'font-semibold text-warn-ink' : 'text-fg'">
            {{
              document().next_review_at
                ? (document().next_review_at | localDay)
                : ('common.empty.notSet' | transloco)
            }}
          </dd>
        </dl>
        @if (canManage() && document().status !== 'obsolete') {
          <div class="px-4 pb-4">
            <app-button variant="secondary" size="sm" (click)="editing.set(true)">
              {{ 'documents.review.edit' | transloco }}
            </app-button>
          </div>
        }
      }
    </app-card>
  `,
})
export class DocumentReviewPanel {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly document = input.required<DocumentDetail>();
  /** Owner or `documents:approve`: may edit the settings. */
  readonly canManage = input(false);

  readonly changed = output<DocumentDetail>();

  protected readonly intervals = REVIEW_INTERVALS;
  protected readonly reviewLabelKey = reviewLabelKey;
  protected readonly ids = {
    interval: `review-interval-${nextId}`,
    next: `review-next-${nextId++}`,
  };

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);

  protected readonly state = computed(() => reviewState(this.document()));

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
    this.editing.set(false);
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
          this.editing.set(false);
          this.notifications.success('documents.review.savedToast');
          this.changed.emit(document);
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
