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
import { Router, RouterLink, UrlTree } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { ChatDisplay } from '../../core/chat/chat-display';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { InboxService } from '../../core/notifications/inbox.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WorkItem } from '../../core/tasks/task.models';
import { TasksApi } from '../../core/tasks/tasks-api';
import { whyOf } from '../../features/my-work/my-work-data';
import { lazyChatStore } from '../../shared/chat/chat-access';
import { LocalizedTitlePipe } from '../../shared/i18n/localized-title.pipe';
import { Icon } from '../../shared/ui/icon/icon';
import { NotificationList } from './notification-list';

export type InboxTab = 'tasks' | 'messages' | 'notifications';

/** How many of my tasks the Oppgaver tab lists (the rest is one click away in My work). */
export const INBOX_TASK_LIMIT = 6;
/** How often the task count behind the badge is refreshed (ms). */
const TASK_REFRESH_MS = 5 * 60_000;

/** Overdue first, then due this week, then the rest; earliest due first within a group. */
export function inboxTasks(items: readonly WorkItem[], limit = INBOX_TASK_LIMIT): WorkItem[] {
  const rank = (i: WorkItem): number =>
    i.overdue || i.group === 'overdue' ? 0 : i.group === 'this_week' ? 1 : 2;
  return [...items]
    .sort((a, b) => rank(a) - rank(b) || (a.due_at ?? '9').localeCompare(b.due_at ?? '9'))
    .slice(0, limit);
}

/** The inbox badge: "9+" above nine, empty at zero. */
export function inboxBadge(count: number): string {
  return count <= 0 ? '' : count > 9 ? '9+' : String(count);
}

/** The first tab with something new, else Oppgaver. */
export function defaultInboxTab(
  tasks: number,
  messages: number,
  notifications: number,
  chatOn: boolean,
): InboxTab {
  if (tasks > 0) return 'tasks';
  if (chatOn && messages > 0) return 'messages';
  if (notifications > 0) return 'notifications';
  return 'tasks';
}

/**
 * The inbox (IA v2 §4.4): one top-bar button for everything waiting for the user —
 * my tasks due now, unread chat and notifications — replacing the bell and the chat
 * button. The badge adds overdue + this week's tasks, unread conversations and
 * unread notifications. The panel has three tabs (Oppgaver, Meldinger, Varsler) and
 * opens on the first with something new; below `sm` it is a full-width sheet.
 */
@Component({
  selector: 'app-inbox-button',
  imports: [RouterLink, TranslocoPipe, Icon, LocalizedTitlePipe, NotificationList],
  viewProviders: [provideSharedScope('shell', 'tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close(true)',
  },
  template: `
    @let badge = badgeText();
    <button
      #trigger
      type="button"
      data-testid="inbox-button"
      aria-haspopup="dialog"
      aria-controls="inbox-panel"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="
        total() > 0
          ? ('shell.inbox.labelCount' | transloco: { count: total() })
          : ('shell.inbox.label' | transloco)
      "
      (click)="toggle()"
      class="relative flex h-10 w-10 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <app-icon name="inbox" [size]="19" />
      @if (badge) {
        <span
          data-testid="inbox-badge"
          aria-hidden="true"
          class="absolute top-1 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-fail px-1 text-[10px] leading-none font-bold text-white"
          >{{ badge }}</span
        >
      }
    </button>

    @if (open()) {
      <div
        #panel
        id="inbox-panel"
        role="dialog"
        tabindex="-1"
        aria-labelledby="inbox-title"
        data-testid="inbox-panel"
        class="z-40 flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop focus:outline-none max-sm:fixed max-sm:inset-x-2 max-sm:top-[60px] max-sm:max-h-[calc(100dvh-76px)] sm:absolute sm:top-full sm:right-0 sm:mt-2 sm:max-h-[min(580px,calc(100vh-80px))] sm:w-[400px]"
      >
        <div class="flex items-center gap-2 px-4 pt-3">
          <h2 id="inbox-title" class="flex-1 font-display text-body font-semibold text-fg">
            {{ 'shell.inbox.title' | transloco }}
          </h2>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg sm:hidden"
            [attr.aria-label]="'shell.inbox.close' | transloco"
            (click)="close(true)"
          >
            <app-icon name="x" [size]="16" />
          </button>
        </div>
        <div role="tablist" class="flex gap-1 border-b border-border px-3">
          @for (t of tabs(); track t.key) {
            <button
              type="button"
              role="tab"
              [id]="'inbox-tab-' + t.key"
              [attr.data-testid]="'inbox-tab-' + t.key"
              [attr.aria-selected]="tab() === t.key"
              [attr.tabindex]="tab() === t.key ? 0 : -1"
              aria-controls="inbox-tabpanel"
              (click)="tab.set(t.key)"
              (keydown)="onTabKeydown($event)"
              class="-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-ui font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [class]="
                tab() === t.key
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg'
              "
            >
              {{ t.labelKey | transloco }}
              @if (t.count > 0) {
                <span
                  class="rounded-full bg-accent-soft px-1.5 text-micro leading-[18px] font-semibold text-accent"
                  >{{ t.count > 99 ? '99+' : t.count }}</span
                >
              }
            </button>
          }
        </div>

        <div
          id="inbox-tabpanel"
          role="tabpanel"
          [attr.aria-labelledby]="'inbox-tab-' + tab()"
          class="flex min-h-0 flex-1 flex-col"
        >
          @switch (tab()) {
            @case ('tasks') {
              <div class="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
                @if (tasksLoading() && taskItems().length === 0) {
                  <p class="px-4 py-8 text-center text-ui text-fg-muted">
                    {{ 'shell.inbox.loading' | transloco }}
                  </p>
                } @else if (tasksError()) {
                  <div class="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <p class="text-ui text-fg-muted">{{ 'shell.inbox.tasks.error' | transloco }}</p>
                    <button
                      type="button"
                      (click)="loadTasks()"
                      class="rounded-lg px-2 py-1 text-meta font-medium text-accent hover:bg-accent-soft"
                    >
                      {{ 'shell.inbox.retry' | transloco }}
                    </button>
                  </div>
                } @else if (taskItems().length === 0) {
                  <div
                    data-testid="inbox-tasks-empty"
                    class="flex flex-col items-center gap-2 px-4 py-10 text-center text-fg-muted"
                  >
                    <app-icon name="checkcircle" [size]="22" />
                    <p class="text-ui">{{ 'shell.inbox.tasks.empty' | transloco }}</p>
                  </div>
                } @else {
                  <ul class="flex flex-col py-1">
                    @for (item of taskItems(); track item.source + item.id) {
                      <li
                        class="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0"
                        data-testid="inbox-task"
                      >
                        <span
                          class="h-2.5 w-2.5 flex-none rounded-full"
                          [class]="
                            item.overdue
                              ? 'bg-fail'
                              : item.group === 'this_week'
                                ? 'bg-warn'
                                : 'bg-accent'
                          "
                          aria-hidden="true"
                        ></span>
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-ui font-semibold text-fg">{{
                            item | localizedTitle
                          }}</span>
                          @let why = whyOf(item);
                          <span class="block truncate text-meta text-fg-muted">{{
                            why.key | transloco: why.params
                          }}</span>
                        </span>
                        @if (item.url) {
                          <a
                            [routerLink]="link(item.url)"
                            (click)="close(false)"
                            class="flex-none rounded-tile border border-border px-2.5 py-1 text-meta font-medium text-fg hover:bg-surface-2"
                            >{{ 'shell.inbox.tasks.open' | transloco }}</a
                          >
                        }
                      </li>
                    }
                  </ul>
                }
              </div>
              <div
                class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border px-4 py-2.5"
              >
                <a
                  routerLink="/my-work"
                  data-testid="inbox-my-work"
                  (click)="close(false)"
                  class="text-meta font-medium text-accent hover:underline"
                  >{{ 'shell.inbox.tasks.seeAll' | transloco }}</a
                >
                @if (canReadTasks()) {
                  <a
                    routerLink="/tasks"
                    (click)="close(false)"
                    class="text-meta font-medium text-fg-muted hover:text-fg"
                    >{{ 'shell.inbox.tasks.allTasks' | transloco }}</a
                  >
                }
              </div>
            }
            @case ('messages') {
              <div class="min-h-0 flex-1 overflow-y-auto">
                @if (unreadConversations().length === 0) {
                  <div
                    data-testid="inbox-messages-empty"
                    class="flex flex-col items-center gap-2 px-4 py-10 text-center text-fg-muted"
                  >
                    <app-icon name="comment" [size]="22" />
                    <p class="text-ui">{{ 'shell.inbox.messages.empty' | transloco }}</p>
                  </div>
                } @else {
                  <ul class="flex flex-col py-1">
                    @for (c of unreadConversations(); track c.id) {
                      <li>
                        <a
                          [routerLink]="['/chat', c.id]"
                          (click)="close(false)"
                          data-testid="inbox-conversation"
                          class="flex items-start gap-2.5 px-4 py-2.5 hover:bg-surface-2"
                        >
                          <span class="mt-1.5 h-2 w-2 flex-none rounded-full bg-accent"></span>
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-ui font-semibold text-fg">{{
                              c.name
                            }}</span>
                            @if (c.snippet) {
                              <span class="block truncate text-meta text-fg-muted">{{
                                c.snippet
                              }}</span>
                            }
                          </span>
                          <span
                            class="flex-none rounded-full bg-accent-soft px-1.5 text-micro leading-[18px] font-semibold text-accent"
                            >{{ c.count }}</span
                          >
                        </a>
                      </li>
                    }
                  </ul>
                }
              </div>
              <div class="border-t border-border px-4 py-2.5">
                <a
                  routerLink="/chat"
                  (click)="close(false)"
                  class="text-meta font-medium text-accent hover:underline"
                  >{{ 'shell.inbox.messages.open' | transloco }}</a
                >
              </div>
            }
            @case ('notifications') {
              @defer {
                <app-notification-list (navigated)="close(false)" />
              } @loading (minimum 0ms) {
                <p class="px-4 py-8 text-center text-ui text-fg-muted">
                  {{ 'shell.inbox.loading' | transloco }}
                </p>
              }
            }
          }
        </div>
      </div>
    }
  `,
})
export class InboxButton {
  protected readonly notifications = inject(InboxService);
  private readonly tasksApi = inject(TasksApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly chat = lazyChatStore();

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly whyOf = whyOf;
  protected readonly open = signal(false);
  protected readonly tab = signal<InboxTab>('tasks');

  private readonly workItems = signal<readonly WorkItem[]>([]);
  private readonly dueCount = signal(0);
  protected readonly tasksLoading = signal(false);
  protected readonly tasksError = signal(false);
  private taskSub: Subscription | null = null;

  protected readonly taskItems = computed(() => inboxTasks(this.workItems()));
  protected readonly canReadTasks = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('tasks:read') ?? false,
  );

  protected readonly chatOn = computed(() => this.chat()?.available() ?? false);
  private readonly unreadMessages = computed(() =>
    this.chatOn() ? (this.chat()?.unreadBadge() ?? 0) : 0,
  );
  protected readonly unreadConversations = computed(() => {
    const store = this.chat();
    if (!store || !this.chatOn()) {
      return [];
    }
    const display = this.injector.get(ChatDisplay);
    return store
      .conversations()
      .filter(
        (c) =>
          !c.archived_at &&
          (c.kind === 'channel' ? c.mention_count > 0 : c.unread_count > 0) &&
          c.me?.notify_level !== 'none',
      )
      .slice(0, 8)
      .map((c) => ({
        id: c.id,
        name: display.name(c),
        snippet: c.last_message && !c.last_message.deleted ? c.last_message.snippet : '',
        count: c.kind === 'channel' ? c.mention_count : c.unread_count,
      }));
  });

  protected readonly total = computed(
    () => this.dueCount() + this.unreadMessages() + this.notifications.unreadCount(),
  );
  protected readonly badgeText = computed(() => inboxBadge(this.total()));

  protected readonly tabs = computed(() => [
    { key: 'tasks' as const, labelKey: 'shell.inbox.tabs.tasks', count: this.dueCount() },
    ...(this.chatOn()
      ? [
          {
            key: 'messages' as const,
            labelKey: 'shell.inbox.tabs.messages',
            count: this.unreadMessages(),
          },
        ]
      : []),
    {
      key: 'notifications' as const,
      labelKey: 'shell.inbox.tabs.notifications',
      count: this.notifications.unreadCount(),
    },
  ]);

  constructor() {
    // Load the task count for the selected org, and refresh it now and then.
    effect((onCleanup) => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.loadTasks());
      if (!orgId) return;
      const timer = setInterval(() => this.loadTasks(), TASK_REFRESH_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  loadTasks(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.taskSub?.unsubscribe();
    if (!orgId) {
      this.workItems.set([]);
      this.dueCount.set(0);
      return;
    }
    this.tasksLoading.set(true);
    this.tasksError.set(false);
    this.taskSub = this.tasksApi.myWork(orgId).subscribe({
      next: (res) => {
        this.workItems.set(res.items);
        const c = res.counts;
        this.dueCount.set(
          c
            ? c.overdue + c.this_week
            : res.items.filter((i) => i.overdue || i.group === 'this_week').length,
        );
        this.tasksLoading.set(false);
      },
      error: () => {
        this.tasksLoading.set(false);
        this.tasksError.set(true);
      },
    });
  }

  protected toggle(): void {
    if (this.open()) {
      this.close(false);
      return;
    }
    this.tab.set(
      defaultInboxTab(
        this.dueCount(),
        this.unreadMessages(),
        this.notifications.unreadCount(),
        this.chatOn(),
      ),
    );
    this.open.set(true);
    this.loadTasks();
    afterNextRender(() => this.panel()?.nativeElement.focus(), { injector: this.injector });
  }

  close(restoreFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) {
      this.trigger().nativeElement.focus();
    }
  }

  /** Item URLs may carry a query: route them as a tree. */
  protected link(url: string): UrlTree {
    return this.router.parseUrl(url);
  }

  protected onTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const keys = this.tabs().map((t) => t.key);
    const at = keys.indexOf(this.tab());
    const next = keys[(at + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length];
    this.tab.set(next);
    afterNextRender(
      () =>
        (this.host.nativeElement as HTMLElement)
          .querySelector<HTMLElement>(`#inbox-tab-${next}`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close(false);
    }
  }
}
