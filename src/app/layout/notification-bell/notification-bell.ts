import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { InboxService } from '../../core/notifications/inbox.service';
import { notificationLink, notificationText } from '../../core/notifications/notification-text';
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
 * Top-bar notifications bell. Shows the selected org's unread count (polled by
 * `InboxService`) and opens a panel listing notifications — unread first —
 * with mark-read-on-click navigation, "mark all as read" and "load more".
 * Closes on Escape (returning focus to the bell) and on outside click; arrow
 * keys move between entries.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink, TranslocoPipe, Icon, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @let count = inbox.unreadCount();
    <button
      #bell
      type="button"
      aria-haspopup="dialog"
      aria-controls="notification-panel"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="
        count > 0
          ? ('notifications.bellUnread' | transloco: { count })
          : ('topbar.notifications' | transloco)
      "
      (click)="toggle()"
      class="relative flex h-9 w-9 items-center justify-center rounded-[9px] border border-transparent bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <app-icon name="bell" [size]="18" />
      @if (count > 0) {
        <span
          data-testid="unread-badge"
          aria-hidden="true"
          class="absolute -top-0.5 -right-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-[1.5px] border-surface bg-fail px-1 text-[10px] leading-none font-bold text-white"
          >{{ count > 99 ? '99+' : count }}</span
        >
      }
    </button>

    @if (open()) {
      <div
        #panel
        id="notification-panel"
        role="dialog"
        aria-labelledby="notification-panel-title"
        tabindex="-1"
        (keydown)="onPanelKeydown($event)"
        class="absolute top-full right-0 z-20 mt-2 flex max-h-[min(560px,calc(100vh-80px))] w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop focus:outline-none"
      >
        <div class="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 id="notification-panel-title" class="flex-1 text-[14px] font-semibold text-fg">
            {{ 'notifications.panel.title' | transloco }}
          </h2>
          <button
            type="button"
            data-testid="mark-all-read"
            [disabled]="count === 0 || markingAll()"
            (click)="markAllRead()"
            class="rounded-[7px] px-2 py-1 text-[12.5px] font-medium text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:text-fg-subtle disabled:hover:bg-transparent"
          >
            {{ 'notifications.panel.markAllRead' | transloco }}
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
          @if (loading()) {
            <p
              data-testid="notifications-loading"
              class="px-4 py-8 text-center text-[13px] text-fg-muted"
            >
              {{ 'notifications.panel.loading' | transloco }}
            </p>
          } @else if (error()) {
            <div
              data-testid="notifications-error"
              class="flex flex-col items-center gap-2 px-4 py-8 text-center"
            >
              <p class="text-[13px] text-fg-muted">{{ 'notifications.panel.error' | transloco }}</p>
              <button
                type="button"
                (click)="reload()"
                class="rounded-[7px] px-2 py-1 text-[12.5px] font-medium text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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
              <p class="text-[13px]">{{ 'notifications.panel.empty' | transloco }}</p>
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
                        class="line-clamp-3 block text-[13px] leading-snug text-fg"
                        [class.font-semibold]="!n.is_read"
                        >{{ row.key | transloco: row.params }}</span
                      >
                      <span class="mt-0.5 block text-[11.5px] text-fg-subtle">
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
                  class="w-full rounded-[8px] border border-border py-1.5 text-[12.5px] font-medium text-fg-muted hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60"
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

        <div class="border-t border-border px-4 py-2.5">
          <a
            routerLink="/account/notifications"
            (click)="close(false)"
            class="text-[12.5px] font-medium text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {{ 'notifications.panel.settings' | transloco }}
          </a>
        </div>
      </div>
    }
  `,
})
export class NotificationBell {
  protected readonly inbox = inject(InboxService);
  protected readonly language = inject(LanguageService);
  private readonly api = inject(UserNotificationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly toasts = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  private readonly bell = viewChild.required<ElementRef<HTMLButtonElement>>('bell');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal(false);
  protected readonly markingAll = signal(false);
  protected readonly now = signal(Date.now());

  private readonly items = signal<readonly UserNotification[]>([]);
  private readonly total = signal(0);
  /** Incremented per (re)load / close so stale responses are dropped. */
  private generation = 0;

  protected readonly rows = computed<readonly Row[]>(() =>
    this.items().map((notification) => ({
      notification,
      ...notificationText(notification, this.language.active()),
    })),
  );
  protected readonly hasMore = computed(() => this.items().length < this.total());

  constructor() {
    // Reload the open panel when the user switches org.
    effect(() => {
      this.selectedOrg.currentOrgId();
      if (untracked(this.open)) {
        untracked(() => this.reload());
      }
    });
  }

  protected toggle(): void {
    if (this.open()) {
      this.close(false);
    } else {
      this.show();
    }
  }

  private show(): void {
    this.open.set(true);
    this.reload();
    afterNextRender(() => this.panel()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Close the panel; optionally return focus to the bell. */
  protected close(restoreFocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.generation++;
    this.loading.set(false);
    this.loadingMore.set(false);
    if (restoreFocus) {
      this.bell().nativeElement.focus();
    }
  }

  protected reload(): void {
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
    const link = notificationLink(notification);
    this.close(false);
    if (link) {
      void this.router.navigate(link);
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

  protected onEscape(): void {
    this.close(true);
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const panel = this.panel()?.nativeElement;
    const entries = Array.from(
      panel?.querySelectorAll<HTMLElement>('[data-notification-item]') ?? [],
    );
    if (entries.length === 0) {
      return;
    }
    event.preventDefault();
    const current = entries.indexOf(panel?.ownerDocument.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next =
      current === -1
        ? step === 1
          ? 0
          : entries.length - 1
        : (current + step + entries.length) % entries.length;
    entries[next].focus();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close(false);
    }
  }

  private replace(updated: UserNotification): void {
    this.items.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
  }
}
