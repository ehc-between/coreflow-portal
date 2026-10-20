import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Button, ButtonVariant } from '../button/button';

let nextId = 0;

const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), [href], input, select, textarea';

/**
 * In-app confirmation dialog (replaces `window.confirm`). Purely presentational:
 * the host owns `open` and reacts to `confirmed` / `cancelled`. Labels are passed
 * already translated.
 *
 * Accessibility: modal `alertdialog` with per-instance title/message ids; focus
 * moves to the cancel button on open (so a stray Enter never confirms), Tab /
 * Shift+Tab are trapped inside the dialog, and focus returns to the element that
 * opened it when it closes. Escape and a backdrop click cancel (unless `busy`).
 *
 * Extra controls (e.g. a reason textarea) can be projected between the message
 * and the buttons; pair them with `confirmDisabled` for required input.
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
          #panel
          role="alertdialog"
          aria-modal="true"
          tabindex="-1"
          [attr.aria-labelledby]="titleId"
          [attr.aria-describedby]="messageId"
          class="relative w-full max-w-[420px] rounded-card border border-border bg-surface p-5 shadow-card"
          (keydown)="trapTab($event)"
        >
          <h2 [id]="titleId" class="font-display text-[17px] font-bold tracking-[-0.02em] text-fg">
            {{ title() }}
          </h2>
          <p [id]="messageId" class="mt-2 text-[13.5px] leading-relaxed text-fg-muted">
            {{ message() }}
          </p>
          <ng-content />
          <div class="mt-5 flex justify-end gap-2">
            <span data-role="cancel">
              <app-button variant="secondary" [disabled]="busy()" (click)="cancelled.emit()">
                {{ cancelLabel() }}
              </app-button>
            </span>
            <app-button
              [variant]="confirmVariant()"
              [loading]="busy()"
              [disabled]="confirmDisabled()"
              (click)="confirmed.emit()"
            >
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
  /** Disables only the confirm button (e.g. until a required reason is typed). */
  readonly confirmDisabled = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly instance = nextId++;
  protected readonly titleId = `confirm-dialog-${this.instance}-title`;
  protected readonly messageId = `confirm-dialog-${this.instance}-message`;

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  /** Element focused before the dialog opened; focus returns here on close. */
  private returnFocusTo: HTMLElement | null = null;
  private wasOpen = false;

  constructor() {
    // Runs after the DOM reflects `open`, so the panel exists when we focus it.
    afterRenderEffect(() => {
      const open = this.open();
      const panel = this.panel()?.nativeElement;
      if (open && !this.wasOpen) {
        const active = document.activeElement;
        this.returnFocusTo = active instanceof HTMLElement ? active : null;
        const cancel = panel?.querySelector<HTMLElement>('[data-role="cancel"] button');
        (cancel ?? panel)?.focus();
      } else if (!open && this.wasOpen) {
        const target = this.returnFocusTo;
        this.returnFocusTo = null;
        if (target?.isConnected) {
          target.focus();
        }
      }
      this.wasOpen = open;
    });

    // While busy the buttons are disabled, so a focused cancel button drops focus
    // to <body> (escaping the trap). Pull it back onto the panel.
    afterRenderEffect(() => {
      const panel = this.panel()?.nativeElement;
      if (this.open() && this.busy() && panel && !panel.contains(document.activeElement)) {
        panel.focus();
      }
    });
  }

  protected trapTab(event: KeyboardEvent): void {
    const panel = this.panel()?.nativeElement;
    if (event.key !== 'Tab' || !panel) {
      return;
    }
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
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
