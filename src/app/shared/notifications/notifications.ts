import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import {
  NotificationLevel,
  NotificationService,
} from '../../core/notifications/notification.service';

/**
 * A toast that was already showing for this long when the user navigates is
 * cleared: it belongs to the previous page. Younger toasts survive the navigation
 * (e.g. "Lagret" shown by a form right before it routes to the saved record).
 */
export const TOAST_NAVIGATION_GRACE_MS = 1500;

/**
 * Toast container. Renders the NotificationService's signal-backed list and
 * translates each message key. Drop it once near the app root.
 *
 * Toasts sit above the floating Ask button (never covering it), fit a 375 px
 * screen, and are cleared on navigation once they belong to an earlier page.
 */
@Component({
  selector: 'app-notifications',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed right-4 bottom-20 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 sm:right-5 sm:bottom-[84px]"
      aria-live="polite"
    >
      @for (n of notifications.notifications(); track n.id) {
        <div
          [attr.role]="n.level === 'error' || n.level === 'warning' ? 'alert' : 'status'"
          class="animate-cf-pop pointer-events-auto flex items-start justify-between gap-3 rounded-card border px-3.5 py-2.5 shadow-pop"
          [class]="levelClasses[n.level]"
          data-testid="toast"
        >
          <span class="text-ui font-medium">{{ n.message | transloco: n.params }}</span>
          <button
            type="button"
            class="min-h-6 text-micro font-semibold tracking-wide uppercase opacity-80 hover:opacity-100"
            (click)="notifications.dismiss(n.id)"
          >
            {{ 'common.dismiss' | transloco }}
          </button>
        </div>
      }
    </div>
  `,
})
export class Notifications {
  protected readonly notifications = inject(NotificationService);

  protected readonly levelClasses: Record<NotificationLevel, string> = {
    success: 'border-pass/30 bg-pass-soft text-pass-ink',
    info: 'border-info/30 bg-info-soft text-info-ink',
    warning: 'border-warn/30 bg-warn-soft text-warn-ink',
    error: 'border-fail/30 bg-fail-soft text-fail-ink',
  };

  /** When each toast id was first seen by this container. */
  private readonly seenAt = new Map<number, number>();

  constructor() {
    // Record when each toast appeared.
    effect(() => {
      const now = Date.now();
      const ids = new Set<number>();
      for (const n of this.notifications.notifications()) {
        ids.add(n.id);
        if (!this.seenAt.has(n.id)) {
          this.seenAt.set(n.id, now);
        }
      }
      for (const id of [...this.seenAt.keys()]) {
        if (!ids.has(id)) {
          this.seenAt.delete(id);
        }
      }
    });
    const router = inject(Router, { optional: true });
    if (!router) {
      return;
    }
    const sub = router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.clearStale());
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  /** Drop toasts that were already showing before this navigation started. */
  clearStale(now = Date.now()): void {
    for (const n of this.notifications.notifications()) {
      const seen = this.seenAt.get(n.id) ?? now;
      if (now - seen >= TOAST_NAVIGATION_GRACE_MS) {
        this.notifications.dismiss(n.id);
        this.seenAt.delete(n.id);
      }
    }
  }
}
