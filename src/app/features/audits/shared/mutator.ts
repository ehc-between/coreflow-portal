import { DestroyRef, inject, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { auditErrorKey } from '../data/audit-errors';

export interface MutateOptions<T> {
  /** i18n key of a success toast. */
  readonly success?: string;
  readonly next?: (value: T) => void;
  /** Handle the error yourself; return true to skip the default error toast. */
  readonly error?: (error: unknown) => boolean | void;
  /** Run even while another write is in flight (independent edits such as checklist answers). */
  readonly parallel?: boolean;
}

/**
 * Runs one write at a time with a `busy` signal, a translated success toast and a
 * code-specific error toast (`audits.errors.<code>`).
 */
export class Mutator {
  readonly busy = signal(false);
  private sub: Subscription | null = null;

  constructor(private readonly notifications: NotificationService) {}

  run<T>(source: Observable<T>, options: MutateOptions<T> = {}): void {
    if (this.busy() && !options.parallel) {
      return;
    }
    if (options.parallel) {
      source.subscribe({
        next: (value) => options.next?.(value),
        error: (error: unknown) => {
          if (options.error?.(error) !== true) {
            this.notifications.error(auditErrorKey(error));
          }
        },
      });
      return;
    }
    this.busy.set(true);
    this.sub = source.subscribe({
      next: (value) => {
        this.busy.set(false);
        if (options.success) {
          this.notifications.success(options.success);
        }
        options.next?.(value);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (options.error?.(error) !== true) {
          this.notifications.error(auditErrorKey(error));
        }
      },
    });
  }

  cancel(): void {
    this.sub?.unsubscribe();
    this.busy.set(false);
  }
}

export function mutator(): Mutator {
  const m = new Mutator(inject(NotificationService));
  inject(DestroyRef).onDestroy(() => m.cancel());
  return m;
}
