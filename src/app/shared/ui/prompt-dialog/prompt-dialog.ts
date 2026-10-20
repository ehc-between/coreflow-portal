import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { ButtonVariant } from '../button/button';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';

let nextId = 0;

/**
 * A {@link ConfirmDialog} that also collects a short free-text answer — a
 * comment, a reason. The text resets each time the dialog opens; when
 * `required`, the confirm action stays disabled until something non-blank is
 * typed. Emits the trimmed text on confirm. Labels are passed already
 * translated.
 *
 *   <app-prompt-dialog
 *     [open]="obsoleteOpen()"
 *     [title]="'x.title' | transloco"
 *     [message]="'x.body' | transloco"
 *     [label]="'x.reason' | transloco"
 *     [required]="true"
 *     [confirmLabel]="'x.confirm' | transloco"
 *     [cancelLabel]="'common.cancel' | transloco"
 *     [busy]="saving()"
 *     (confirmed)="obsolete($event)"
 *     (cancelled)="obsoleteOpen.set(false)"
 *   />
 */
@Component({
  selector: 'app-prompt-dialog',
  imports: [ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-confirm-dialog
      [open]="open()"
      [title]="title()"
      [message]="message()"
      [confirmLabel]="confirmLabel()"
      [cancelLabel]="cancelLabel()"
      [confirmVariant]="confirmVariant()"
      [busy]="busy()"
      [confirmDisabled]="!valid()"
      (confirmed)="confirm()"
      (cancelled)="cancelled.emit()"
    >
      <div class="mt-4 flex flex-col gap-1.5">
        <label [attr.for]="fieldId" class="text-[13px] font-semibold text-fg-muted">
          {{ label() }}
        </label>
        <textarea
          [id]="fieldId"
          rows="3"
          [value]="text()"
          [attr.placeholder]="placeholder() || null"
          [attr.aria-required]="required()"
          [attr.maxlength]="maxLength()"
          [disabled]="busy()"
          (input)="onInput($event)"
          class="w-full resize-y rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        ></textarea>
      </div>
    </app-confirm-dialog>
  `,
})
export class PromptDialog {
  readonly open = input(false);
  readonly title = input('');
  readonly message = input('');
  readonly label = input('');
  readonly placeholder = input('');
  readonly confirmLabel = input('');
  readonly cancelLabel = input('');
  readonly confirmVariant = input<ButtonVariant>('primary');
  /** When true, the confirm action needs a non-blank answer. */
  readonly required = input(false);
  readonly maxLength = input(2000);
  readonly busy = input(false);

  /** The trimmed answer. */
  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  protected readonly fieldId = `prompt-dialog-${nextId++}-field`;
  protected readonly text = signal('');
  protected readonly valid = computed(() => !this.required() || this.text().trim().length > 0);

  constructor() {
    // Start every opening with an empty answer.
    effect(() => {
      if (this.open()) {
        this.text.set('');
      }
    });
  }

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected confirm(): void {
    if (this.valid() && !this.busy()) {
      this.confirmed.emit(this.text().trim());
    }
  }
}
