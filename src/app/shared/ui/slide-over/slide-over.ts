import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Icon } from '../icon/icon';

let nextId = 0;

const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), [href], input, select, textarea';

/**
 * Modal side panel sliding in from the right edge. Purely presentational: the
 * host owns `open` and closes it on `closed`. The title and close label are
 * passed already translated; the body is projected.
 *
 * Accessibility: modal `dialog` labelled by its title; focus moves into the
 * panel on open, Tab is trapped inside, Escape and a backdrop click close it,
 * and focus returns to the opener on close.
 *
 *   <app-slide-over [open]="open()" [title]="'x.title' | transloco"
 *     [closeLabel]="'common.close' | transloco" (closed)="open.set(false)">
 *     …body…
 *   </app-slide-over>
 */
@Component({
  selector: 'app-slide-over',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex justify-end">
        <button
          type="button"
          tabindex="-1"
          class="absolute inset-0 cursor-default bg-black/40"
          [attr.aria-label]="closeLabel()"
          (click)="closed.emit()"
        ></button>
        <div
          #panel
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          [attr.aria-labelledby]="titleId"
          class="relative flex h-full w-full flex-col border-l border-border bg-surface shadow-card outline-none"
          [style.max-width.px]="width()"
          (keydown)="trapTab($event)"
        >
          <div class="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div class="min-w-0">
              <h2
                [id]="titleId"
                class="font-display text-[17px] font-bold tracking-[-0.02em] text-fg"
              >
                {{ title() }}
              </h2>
              @if (subtitle()) {
                <p class="mt-1 text-[12.5px] text-fg-muted">{{ subtitle() }}</p>
              }
            </div>
            <button
              type="button"
              class="flex flex-none rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
              [attr.aria-label]="closeLabel()"
              (click)="closed.emit()"
            >
              <app-icon name="x" [size]="16" />
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <ng-content />
          </div>
        </div>
      </div>
    }
  `,
})
export class SlideOver {
  readonly open = input(false);
  readonly title = input('');
  readonly subtitle = input('');
  readonly closeLabel = input('');
  /** Maximum panel width in px (full width below it). */
  readonly width = input(460);

  readonly closed = output<void>();

  protected readonly titleId = `slide-over-${nextId++}-title`;

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private returnFocusTo: HTMLElement | null = null;
  private wasOpen = false;

  constructor() {
    afterRenderEffect(() => {
      const open = this.open();
      const panel = this.panel()?.nativeElement;
      if (open && !this.wasOpen) {
        const active = document.activeElement;
        this.returnFocusTo = active instanceof HTMLElement ? active : null;
        panel?.focus();
      } else if (!open && this.wasOpen) {
        const target = this.returnFocusTo;
        this.returnFocusTo = null;
        if (target?.isConnected) {
          target.focus();
        }
      }
      this.wasOpen = open;
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
    if (this.open()) {
      this.closed.emit();
    }
  }
}
