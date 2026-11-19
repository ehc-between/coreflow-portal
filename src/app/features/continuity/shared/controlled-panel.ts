import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { actionNeedsNote } from '../data/continuity-display';
import { ControlledAction, ControlledDetail } from '../data/continuity.models';

export interface ControlledActionRequest {
  readonly action: ControlledAction;
  readonly note: string | null;
}

/** What the approval row can say about a record. */
export type ApprovalState = 'dated' | 'by' | 'undated' | 'none';

/**
 * The approval row: a date (and who), only who (older records without a date), an
 * approved record without either, or not approved. Never "not approved yet" next to
 * an "approved" badge.
 */
export function approvalState(r: ControlledDetail): ApprovalState {
  if (r.approved_at) {
    return 'dated';
  }
  if (r.approved_by?.name) {
    return 'by';
  }
  return r.status === 'approved' ? 'undated' : 'none';
}

/**
 * The note dialog of a BIA's or continuity plan's workflow step (submit, approve,
 * reject, review, retire, restore). The page header holds the steps
 * (docs/ux-guide.md §2.7) and calls `open(action)`; the note is required to reject.
 * `(acted)` fires on confirm; the page calls `close()` once the step is done.
 */
@Component({
  selector: 'app-continuity-controlled-dialog',
  imports: [TranslocoPipe, PromptDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-prompt-dialog
      [open]="pending() !== null"
      [title]="'continuity.actions.' + (pending() ?? 'submit') | transloco"
      [message]="'continuity.actionHelp.' + (pending() ?? 'submit') | transloco"
      [label]="'continuity.control.note' | transloco"
      [confirmLabel]="'continuity.actions.' + (pending() ?? 'submit') | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [confirmVariant]="pending() === 'reject' ? 'danger' : 'primary'"
      [required]="noteRequired()"
      [busy]="busy()"
      (confirmed)="confirm($event)"
      (cancelled)="pending.set(null)"
    />
  `,
})
export class ContinuityControlledDialog {
  readonly busy = input(false);
  readonly acted = output<ControlledActionRequest>();

  protected readonly pending = signal<ControlledAction | null>(null);
  protected readonly noteRequired = computed(() => actionNeedsNote(this.pending() ?? ''));

  /** Close the note dialog (the host calls this once the action is done). */
  close(): void {
    this.pending.set(null);
  }

  /** Ask for the note of an action. */
  open(action: ControlledAction): void {
    this.pending.set(action);
  }

  protected confirm(note: string): void {
    const action = this.pending();
    if (action) {
      this.acted.emit({ action, note: note || null });
    }
  }
}
