import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatStore } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import { ConversationSummary } from '../../core/chat/chat.models';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { BrowseChannels } from './browse-channels';
import { ConversationList } from './conversation-list';
import { ConversationView } from './conversation-view';
import { NewConversationDialog } from './new-conversation-dialog';
import { ThreadPanel } from './thread-panel';

/**
 * The chat shell (docs/chat-design.md §4.3, §4.4). From `lg`: three panes —
 * list 320 px · messages · thread 380 px. From `md`: list + messages, the
 * thread as an overlay panel. Phones: one pane at a time (list →
 * conversation with a back button → thread full screen), no horizontal
 * scroll at 375 px.
 *
 * Routes: `/chat`, `/chat/:conversationId` (`?m=` jumps to a message,
 * `?thread=` opens a thread), `/chat/browse`; `?tag=` searches a tag.
 */
@Component({
  selector: 'app-chat-page',
  imports: [
    TranslocoPipe,
    EmptyState,
    BrowseChannels,
    ConversationList,
    ConversationView,
    NewConversationDialog,
    ThreadPanel,
  ],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-[420px] w-full overflow-hidden border-b border-border' },
  template: `
    @let main = hasMain();
    <app-chat-conversation-list
      class="w-full flex-none border-r border-border md:flex md:w-[280px] lg:w-[320px]"
      [class.hidden]="main"
      [class.flex]="!main"
      [tag]="tag() ?? null"
      (newConversation)="dialogOpen.set(true)"
      (clearTag)="clearTag()"
    />

    <section class="min-w-0 flex-1 flex-col md:flex" [class.hidden]="!main" [class.flex]="main">
      @if (connectionNotice(); as key) {
        <p
          class="border-b border-border bg-warn-soft px-4 py-1.5 text-meta text-warn-ink"
          role="status"
          data-testid="chat-connection"
        >
          {{ key | transloco }}
        </p>
      }
      @if (view() === 'browse') {
        <app-chat-browse-channels class="min-h-0 flex-1" [showBack]="true" (back)="toList()" />
      } @else if (conversationId(); as id) {
        <app-chat-conversation-view
          class="min-h-0 flex-1"
          [conversationId]="id"
          [messageId]="m() ?? null"
          [showBack]="!isMd()"
          (openThread)="openThread($event)"
          (back)="toList()"
        />
      } @else {
        <app-empty-state
          class="m-auto block max-w-md p-6"
          icon="comment"
          titleKey="chat.page.pickTitle"
          bodyKey="chat.page.pickBody"
          ctaKey="chat.list.new"
          (cta)="dialogOpen.set(true)"
        />
      }
    </section>

    @if (threadConversation(); as tc) {
      @if (isLg()) {
        <app-chat-thread-panel
          class="w-[380px] flex-none border-l border-border"
          [conversation]="tc"
          [rootId]="thread()!"
          (closed)="closeThread()"
        />
      } @else {
        <div
          class="fixed inset-0 z-50 flex justify-end"
          tabindex="-1"
          (keydown.escape)="closeThread()"
        >
          <button
            type="button"
            tabindex="-1"
            class="absolute inset-0 cursor-default bg-black/40"
            [attr.aria-label]="'chat.thread.close' | transloco"
            (click)="closeThread()"
          ></button>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-thread-title"
            class="relative flex h-full w-full max-w-[420px] flex-col border-l border-border shadow-pop"
          >
            <app-chat-thread-panel
              class="min-h-0 flex-1"
              [conversation]="tc"
              [rootId]="thread()!"
              (closed)="closeThread()"
            />
          </div>
        </div>
      }
    }

    <app-chat-new-conversation-dialog
      [open]="dialogOpen()"
      (created)="onCreated($event)"
      (closed)="dialogOpen.set(false)"
    />
  `,
})
export class ChatPage {
  private readonly store = inject(ChatStore);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  // Route bindings (withComponentInputBinding).
  readonly conversationId = input<string | undefined>(undefined);
  readonly m = input<string | undefined>(undefined);
  readonly thread = input<string | undefined>(undefined);
  readonly tag = input<string | undefined>(undefined);
  readonly view = input<string | undefined>(undefined);

  protected readonly dialogOpen = signal(false);
  protected readonly isLg = signal(true);
  protected readonly isMd = signal(true);

  protected readonly hasMain = computed(() => !!this.conversationId() || this.view() === 'browse');
  protected readonly threadConversation = computed(() => {
    const id = this.conversationId();
    return id && this.thread() ? this.store.conversation(id) : null;
  });

  protected readonly connectionNotice = computed(() => {
    if (!this.store.orgId()) {
      return null;
    }
    const state = this.store.connection();
    if (state === 'offline') {
      return 'chat.connection.offline';
    }
    return state === 'reconnecting' ? 'chat.connection.reconnecting' : null;
  });

  constructor() {
    const win = this.document.defaultView;
    const lg = win?.matchMedia?.('(min-width: 1024px)');
    const md = win?.matchMedia?.('(min-width: 768px)');
    const sync = () => {
      this.isLg.set(lg ? lg.matches : true);
      this.isMd.set(md ? md.matches : true);
    };
    sync();
    lg?.addEventListener?.('change', sync);
    md?.addEventListener?.('change', sync);
    inject(DestroyRef).onDestroy(() => {
      lg?.removeEventListener?.('change', sync);
      md?.removeEventListener?.('change', sync);
      this.store.setCurrent(null);
    });
  }

  protected openThread(rootId: string): void {
    void this.router.navigate([], {
      queryParams: { thread: rootId, m: null },
      queryParamsHandling: 'merge',
    });
  }

  protected closeThread(): void {
    void this.router.navigate([], { queryParams: { thread: null }, queryParamsHandling: 'merge' });
  }

  protected toList(): void {
    void this.router.navigate(['/chat']);
  }

  protected clearTag(): void {
    void this.router.navigate([], { queryParams: { tag: null }, queryParamsHandling: 'merge' });
  }

  protected onCreated(conversation: ConversationSummary): void {
    this.dialogOpen.set(false);
    void this.router.navigate(['/chat', conversation.id]);
  }
}
