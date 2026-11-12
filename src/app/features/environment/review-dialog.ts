import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { ReviewIn } from './data/environment.models';
import { dayToDatetime, localDay } from './data/environment-display';

/**
 * "Mark as reviewed" for an aspect or an emergency plan: the next review date
 * (a year ahead by default) and an optional note, posted to `.../review`.
 */
@Component({
  selector: 'app-env-review-dialog',
  imports: [TranslocoPipe, ConfirmDialog, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-confirm-dialog
      [open]="open()"
      [title]="'environment.review.title' | transloco"
      [message]="'environment.review.message' | transloco"
      [confirmLabel]="'environment.review.confirm' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy()"
      initialFocus="#cf-env-review-next"
      (confirmed)="confirm()"
      (cancelled)="cancelled.emit()"
    >
      <div class="mt-4 flex flex-col gap-3">
        <app-form-field
          [label]="'environment.review.nextReview' | transloco"
          inputId="cf-env-review-next"
        >
          <input
            id="cf-env-review-next"
            type="date"
            [value]="next()"
            (change)="next.set($any($event.target).value)"
            data-testid="review-next"
          />
        </app-form-field>
        <app-form-field
          [label]="'environment.review.note' | transloco"
          inputId="cf-env-review-note"
        >
          <textarea
            id="cf-env-review-note"
            rows="3"
            maxlength="2000"
            [value]="note()"
            (input)="note.set($any($event.target).value)"
          ></textarea>
        </app-form-field>
      </div>
    </app-confirm-dialog>
  `,
})
export class EnvReviewDialog {
  readonly open = input(false);
  readonly busy = input(false);

  readonly confirmed = output<ReviewIn>();
  readonly cancelled = output<void>();

  protected readonly next = signal(localDay(365));
  protected readonly note = signal('');

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.next.set(localDay(365));
          this.note.set('');
        });
      }
    });
  }

  protected confirm(): void {
    this.confirmed.emit({
      next_review_at: dayToDatetime(this.next()),
      note: this.note().trim() || null,
    });
  }
}
