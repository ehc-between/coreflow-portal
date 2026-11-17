import { DOCUMENT, DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, Subscription, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { UserNotificationsApi } from './user-notifications-api';
import { MarkAllReadResponse, UserNotification } from './user-notification.models';

/** How often the unread badge is refreshed while the tab is visible. */
export const INBOX_POLL_INTERVAL_MS = 60_000;

/**
 * Unread-notification badge state for the selected org. Polls the unread count
 * every minute while the user is signed in and the tab is visible (pausing on
 * `document.hidden`, refreshing immediately on return), refreshes on org switch,
 * and stops entirely on sign-out. Mark-read helpers keep the badge in sync.
 *
 * Each poll also fetches the unread count of every org the user belongs to
 * (`unreadByOrg`), so the org switcher can show where else something waits.
 */
@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly api = inject(UserNotificationsApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly document = inject(DOCUMENT);

  private readonly _unreadCount = signal(0);
  /** Unread notifications in the selected org. */
  readonly unreadCount = this._unreadCount.asReadonly();
  readonly hasUnread = computed(() => this._unreadCount() > 0);

  private readonly _unreadByOrg = signal<ReadonlyMap<string, number>>(new Map());
  /** Unread notifications per org id (orgs the user belongs to; empty until loaded). */
  readonly unreadByOrg = this._unreadByOrg.asReadonly();
  /** Unread notifications in orgs other than the selected one. */
  readonly unreadElsewhere = computed(() => {
    const current = this.selectedOrg.currentOrgId();
    let total = 0;
    for (const [orgId, count] of this._unreadByOrg()) {
      if (orgId !== current) {
        total += count;
      }
    }
    return total;
  });

  /** The org being polled, or null when signed out / no org. */
  private activeOrgId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private countSub: Subscription | null = null;
  private byOrgSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const signedIn = this.auth.isAuthenticated();
      const orgId = this.selectedOrg.currentOrgId();
      this.activate(signedIn ? orgId : null);
    });

    const onVisibility = (): void => this.onVisibilityChange();
    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onVisibility);
      this.activate(null);
    });
  }

  /** Re-fetch the unread count now (no-op when signed out / no org). */
  refresh(): void {
    const orgId = this.activeOrgId;
    if (!orgId) {
      return;
    }
    this.countSub?.unsubscribe();
    this.countSub = this.api.unreadCount(orgId).subscribe({
      next: ({ count }) => {
        // Ignore a late answer for an org the user has since switched away from.
        if (this.activeOrgId === orgId) {
          this._unreadCount.set(count);
        }
      },
      // Transient failures keep the last known count; the error interceptor reports them.
      error: () => undefined,
    });
    this.refreshByOrg();
  }

  /** Re-fetch the per-org unread counts now (no-op when signed out / no org). */
  refreshByOrg(): void {
    if (!this.activeOrgId) {
      return;
    }
    this.byOrgSub?.unsubscribe();
    this.byOrgSub = this.api.unreadCountsByOrg().subscribe({
      next: ({ items }) => {
        if (this.activeOrgId) {
          this._unreadByOrg.set(new Map(items.map((item) => [item.org_id, item.count])));
        }
      },
      // Best-effort: the switcher simply shows the last known counts.
      error: () => undefined,
    });
  }

  /** Overwrite the count with a fresh value (e.g. from a list response). */
  setUnreadCount(count: number): void {
    this._unreadCount.set(Math.max(0, count));
    const orgId = this.activeOrgId;
    if (orgId) {
      this.setOrgCount(orgId, () => Math.max(0, count));
    }
  }

  /** Mark one notification read and decrement the badge if it was unread. */
  markRead(notification: UserNotification): Observable<UserNotification> {
    return this.api.markRead(notification.id).pipe(
      tap(() => {
        if (!notification.is_read) {
          if (notification.org_id === this.activeOrgId) {
            this._unreadCount.update((count) => Math.max(0, count - 1));
          }
          this.setOrgCount(notification.org_id, (count) => Math.max(0, count - 1));
        }
      }),
    );
  }

  /** Mark everything in the selected org read and clear the badge. */
  markAllRead(): Observable<MarkAllReadResponse> {
    const orgId = this.activeOrgId;
    return this.api.markAllRead(orgId).pipe(
      tap(() => {
        if (this.activeOrgId === orgId) {
          this._unreadCount.set(0);
        }
        if (orgId) {
          this.setOrgCount(orgId, () => 0);
        }
      }),
    );
  }

  /** Update one org's entry in `unreadByOrg` (only orgs already listed). */
  private setOrgCount(orgId: string, next: (count: number) => number): void {
    const counts = this._unreadByOrg();
    const count = counts.get(orgId);
    if (count === undefined) {
      return;
    }
    const updated = new Map(counts);
    updated.set(orgId, next(count));
    this._unreadByOrg.set(updated);
  }

  private activate(orgId: string | null): void {
    if (orgId === this.activeOrgId) {
      return;
    }
    this.stopTimer();
    this.countSub?.unsubscribe();
    this.countSub = null;
    if (!orgId) {
      // Signed out: never let a later session see these counts.
      this.byOrgSub?.unsubscribe();
      this.byOrgSub = null;
      this._unreadByOrg.set(new Map());
    }
    this.activeOrgId = orgId;
    this._unreadCount.set(0);
    if (orgId && !this.document.hidden) {
      this.refresh();
      this.startTimer();
    }
  }

  private onVisibilityChange(): void {
    if (!this.activeOrgId) {
      return;
    }
    if (this.document.hidden) {
      this.stopTimer();
    } else if (this.timer === null) {
      this.refresh();
      this.startTimer();
    }
  }

  private startTimer(): void {
    this.timer = setInterval(() => this.refresh(), INBOX_POLL_INTERVAL_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
