import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Button, ButtonVariant } from '../button/button';

/**
 * In-app confirmation dialog (replaces `window.confirm`). Purely presentational:
 * the host owns `open` and reacts to `confirmed` / `cancelled`. Labels are passed
 * already translated. Escape and a backdrop click cancel (unless `busy`); focus
 * moves to the cancel button on open so a stray Enter never confirms.
 *
 *   <app-confirm-dialog
 *     [open]="pending() !== null"
 *     [title]="'x.title' | transloco"
 *     [message]="'x.body' | transloco: { name }"
 *     [confirmLabel]="'x.confirm' | transloco"
 *     [cancelLabel]="'common.cancel' | transloco"
 *     (confirmed)="doIt()"
 *     (cancelled)="pending.set(null)"
 *   />
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center px-4">
        <button
          type="button"
          tabindex="-1"
          class="absolute inset-0 cursor-default bg-black/40"
          [attr.aria-label]="cancelLabel()"
          (click)="onBackdrop()"
        ></button>
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
          class="relative w-full max-w-[420px] rounded-card border border-border bg-surface p-5 shadow-card"
        >
          <h2
            id="confirm-title"
            class="font-display text-[17px] font-bold tracking-[-0.02em] text-fg"
          >
            {{ title() }}
          </h2>
          <p id="confirm-message" class="mt-2 text-[13.5px] leading-relaxed text-fg-muted">
            {{ message() }}
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <span #cancelHost>
              <app-button variant="secondary" [disabled]="busy()" (click)="cancelled.emit()">
                {{ cancelLabel() }}
              </app-button>
            </span>
            <app-button [variant]="confirmVariant()" [loading]="busy()" (click)="confirmed.emit()">
              {{ confirmLabel() }}
            </app-button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialog {
  readonly open = input(false);
  readonly title = input('');
  readonly message = input('');
  readonly confirmLabel = input('');
  readonly cancelLabel = input('');
  readonly confirmVariant = input<ButtonVariant>('danger');
  /** Disables the actions (and Escape/backdrop dismissal) while the action runs. */
  readonly busy = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly cancelHost = viewChild<ElementRef<HTMLElement>>('cancelHost');

  constructor() {
    effect(() => {
      this.cancelHost()?.nativeElement.querySelector('button')?.focus();
    });
  }

  protected onEscape(): void {
    if (this.open() && !this.busy()) {
      this.cancelled.emit();
    }
  }

  protected onBackdrop(): void {
    if (!this.busy()) {
      this.cancelled.emit();
    }
  }
}
