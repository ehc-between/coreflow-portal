import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { InboxService } from '../../core/notifications/inbox.service';
import { notificationUrl } from '../../core/notifications/notification-text';
import { NotificationTextResolver } from '../../core/notifications/notification-text.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UserNotification } from '../../core/notifications/user-notification.models';
import { UserNotificationsApi } from '../../core/notifications/user-notifications-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RelativeTimePipe } from '../../shared/relative-time/relative-time';
import { Icon } from '../../shared/ui/icon/icon';

/** Page size for the notification list. */
export const NOTIFICATION_PAGE_SIZE = 20;

/** Rendered row: the notification plus its resolved title. */
interface Row {
  readonly notification: UserNotification;
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * The inbox's "Varsler" tab (IA v2 §4.4; the old top-bar bell's list): the selected
 * org's notifications, unread first, loaded when the tab is shown. A click marks the
 * entry read and opens it; "Merk alle som lest" and "Last flere" as before. Arrow keys
 * move between entries. Emits `navigated` so the inbox can close.
 */
@Component({
  selector: 'app-notification-list',
  imports: [RouterLink, TranslocoPipe, Icon, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col', '(keydown)': 'onKeydown($event)' },
  template: `
    @let count = inbox.unreadCount();
    <div class="flex items-center justify-end border-b border-border px-4 py-1.5">
      <button
        type="button"
        data-testid="mark-all-read"
        [disabled]="count === 0 || markingAll()"
        (click)="markAllRead()"
        class="rounded-lg px-2 py-1 text-meta font-medium text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:text-fg-subtle disabled:hover:bg-transparent"
      >
        {{ 'notifications.panel.markAllRead' | transloco }}
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
      @if (loading()) {
        <p data-testid="notifications-loading" class="px-4 py-8 text-center text-ui text-fg-muted">
          {{ 'notifications.panel.loading' | transloco }}
        </p>
      } @else if (error()) {
        <div
          data-testid="notifications-error"
          class="flex flex-col items-center gap-2 px-4 py-8 text-center"
        >
          <p class="text-ui text-fg-muted">{{ 'notifications.panel.error' | transloco }}</p>
          <button
            type="button"
            (click)="reload()"
            class="rounded-lg px-2 py-1 text-meta font-medium text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {{ 'notifications.panel.retry' | transloco }}
          </button>
        </div>
      } @else if (rows().length === 0) {
        <div
          data-testid="notifications-empty"
          class="flex flex-col items-center gap-2 px-4 py-10 text-center text-fg-muted"
        >
          <app-icon name="inbox" [size]="22" />
          <p class="text-ui">{{ 'notifications.panel.empty' | transloco }}</p>
        </div>
      } @else {
        <ul class="flex flex-col py-1">
          @for (row of rows(); track row.notification.id) {
            @let n = row.notification;
            <li>
              <button
                type="button"
                data-notification-item
                [attr.data-unread]="n.is_read ? null : ''"
                (click)="openNotification(n)"
                class="flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                [class.bg-accent-soft]="!n.is_read"
              >
                <span class="mt-1.5 flex h-2 w-2 flex-none">
                  @if (!n.is_read) {
                    <span class="h-2 w-2 rounded-full bg-accent"></span>
                    <span class="sr-only">{{ 'notifications.panel.unread' | transloco }}</span>
                  }
                </span>
                <span class="min-w-0 flex-1">
                  <span
                    class="line-clamp-3 block text-ui leading-snug text-fg"
                    [class.font-semibold]="!n.is_read"
                    >{{ row.key | transloco: row.params }}</span
                  >
                  <span class="mt-0.5 block text-meta text-fg-subtle">
                    <time [attr.datetime]="n.created_at">{{
                      n.created_at | relativeTime: language.active() : now()
                    }}</time>
                  </span>
                </span>
              </button>
            </li>
          }
        </ul>
        @if (hasMore()) {
          <div class="px-4 pb-3">
            <button
              type="button"
              data-testid="load-more"
              [disabled]="loadingMore()"
              (click)="loadMore()"
              class="w-full rounded-lg border border-border py-1.5 text-meta font-medium text-fg-muted hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60"
            >
              {{
                (loadingMore() ? 'notifications.panel.loading' : 'notifications.panel.loadMore')
                  | transloco
              }}
            </button>
          </div>
        }
      }
    </div>

    <div class="flex items-center justify-end border-t border-border px-4 py-2.5">
      <a
        routerLink="/account/notifications"
        (click)="navigated.emit()"
        class="text-meta font-medium text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        {{ 'notifications.panel.settings' | transloco }}
      </a>
    </div>
  `,
})
export class NotificationList {
  protected readonly inbox = inject(InboxService);
  protected readonly language = inject(LanguageService);
  private readonly api = inject(UserNotificationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly toasts = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly text = inject(NotificationTextResolver);

  /** After a notification (or the settings link) was opened. */
  readonly navigated = output<void>();

  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal(false);
  protected readonly markingAll = signal(false);
  protected readonly now = signal(Date.now());

  private readonly items = signal<readonly UserNotification[]>([]);
  private readonly total = signal(0);
  /** Incremented per (re)load so stale responses are dropped. */
  private generation = 0;

  protected readonly rows = computed<readonly Row[]>(() =>
    this.items().map((notification) => ({
      notification,
      ...this.text.resolve(notification),
    })),
  );
  protected readonly hasMore = computed(() => this.items().length < this.total());

  constructor() {
    // Load the module translation scopes that scoped title keys need.
    effect(() => {
      const items = this.items();
      this.language.active();
      untracked(() => this.text.ensureScopes(items));
    });

    // Load now, and again when the user switches org.
    effect(() => {
      this.selectedOrg.currentOrgId();
      untracked(() => this.reload());
    });
  }

  reload(): void {
    const generation = ++this.generation;
    this.loading.set(true);
    this.loadingMore.set(false);
    this.error.set(false);
    this.now.set(Date.now());
    const orgId = this.selectedOrg.currentOrgId();
    this.api.list({ org_id: orgId, limit: NOTIFICATION_PAGE_SIZE, offset: 0 }).subscribe({
      next: (page) => {
        if (generation !== this.generation) return;
        this.items.set(page.items);
        this.total.set(page.total);
        this.loading.set(false);
        this.inbox.setUnreadCount(page.unread_count);
      },
      error: () => {
        if (generation !== this.generation) return;
        this.loading.set(false);
        this.error.set(true);
      },
    });
  }

  protected loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) {
      return;
    }
    const generation = this.generation;
    this.loadingMore.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    this.api
      .list({ org_id: orgId, limit: NOTIFICATION_PAGE_SIZE, offset: this.items().length })
      .subscribe({
        next: (page) => {
          if (generation !== this.generation) return;
          const seen = new Set(this.items().map((n) => n.id));
          this.items.update((list) => [...list, ...page.items.filter((n) => !seen.has(n.id))]);
          this.total.set(page.total);
          this.loadingMore.set(false);
          this.inbox.setUnreadCount(page.unread_count);
        },
        error: () => {
          if (generation !== this.generation) return;
          this.loadingMore.set(false);
          this.toasts.error('notifications.panel.error');
        },
      });
  }

  protected openNotification(notification: UserNotification): void {
    if (!notification.is_read) {
      this.inbox.markRead(notification).subscribe({
        next: (updated) => this.replace(updated),
        // Navigation still happens; the entry simply stays unread.
        error: () => undefined,
      });
    }
    // Org-aware (`?org=`): the shell's deep-link guard switches to the
    // notification's org if it isn't the selected one.
    const url = notificationUrl(notification);
    this.navigated.emit();
    if (url) {
      void this.router.navigateByUrl(url);
    }
  }

  protected markAllRead(): void {
    if (this.markingAll()) {
      return;
    }
    this.markingAll.set(true);
    this.inbox.markAllRead().subscribe({
      next: () => {
        this.markingAll.set(false);
        const readAt = new Date().toISOString();
        this.items.update((list) =>
          list.map((n) => (n.is_read ? n : { ...n, is_read: true, read_at: readAt })),
        );
      },
      error: () => {
        this.markingAll.set(false);
        this.toasts.error('notifications.panel.markAllFailed');
      },
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const root = this.host.nativeElement as HTMLElement;
    const entries = Array.from(root.querySelectorAll<HTMLElement>('[data-notification-item]'));
    if (entries.length === 0) {
      return;
    }
    event.preventDefault();
    const current = entries.indexOf(root.ownerDocument.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next =
      current === -1
        ? step === 1
          ? 0
          : entries.length - 1
        : (current + step + entries.length) % entries.length;
    entries[next].focus();
  }

  private replace(updated: UserNotification): void {
    this.items.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
  }
}
