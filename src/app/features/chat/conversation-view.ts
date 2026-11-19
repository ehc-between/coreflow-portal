import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatDisplay } from '../../core/chat/chat-display';
import { ChatStore } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import { ChatMessage } from '../../core/chat/chat.models';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { Composer } from './composer';
import { ConversationHeader } from './conversation-header';
import { MessageList } from './message-list';
import { ThreadPanel } from './thread-panel';
import { TypingIndicator } from './typing-indicator';

const ANNOUNCE_EVERY_MS = 3_000;

/**
 * One open conversation: header, the message feed, typing indicator and the
 * composer, plus the polite live region that announces new messages from
 * others (throttled and coalesced, D-19). In `compact` mode (the "Diskuter"
 * slide-over) a thread replaces the feed instead of opening beside it.
 */
@Component({
  selector: 'app-chat-conversation-view',
  imports: [
    TranslocoPipe,
    Button,
    EmptyState,
    LoadingState,
    Composer,
    ConversationHeader,
    MessageList,
    ThreadPanel,
    TypingIndicator,
  ],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 min-w-0 flex-1 flex-col bg-bg' },
  template: `
    <div class="sr-only" aria-live="polite" aria-atomic="true" data-testid="chat-live">
      {{ liveText() }}
    </div>
    @if (conversation(); as c) {
      @if (compact() && compactThread()) {
        <app-chat-thread-panel
          class="min-h-0 flex-1"
          [conversation]="c"
          [rootId]="compactThread()!"
          (closed)="compactThread.set(null)"
        />
      } @else {
        <app-chat-conversation-header
          [conversation]="c"
          [showBack]="showBack()"
          [compact]="compact()"
          (back)="back.emit()"
        />
        <app-chat-message-list
          [conversation]="c"
          [name]="name()"
          (openThread)="onOpenThread($event)"
          (edit)="composer()?.startEdit($event)"
        />
        <app-chat-typing-indicator [conversationId]="c.id" />
        <div class="px-2 pb-2 sm:px-4 sm:pb-3">
          @if (c.archived_at) {
            <p class="rounded-tile bg-surface-2 px-3 py-2.5 text-meta text-fg-muted" role="status">
              {{ 'chat.header.archivedBanner' | transloco }}
            </p>
          } @else if (!c.me && c.kind === 'channel') {
            <div
              class="flex flex-wrap items-center gap-3 rounded-tile border border-border bg-surface px-3 py-2.5"
            >
              <p class="flex-1 text-meta text-fg-muted">{{ 'chat.header.joinHint' | transloco }}</p>
              <app-button
                size="sm"
                [loading]="joining()"
                (click)="join()"
                data-testid="chat-join"
                >{{ 'chat.header.join' | transloco }}</app-button
              >
            </div>
          } @else if (!c.can_post) {
            <p class="rounded-tile bg-surface-2 px-3 py-2.5 text-meta text-fg-muted" role="status">
              {{ 'chat.header.readOnly' | transloco }}
            </p>
          } @else {
            <app-chat-composer [conversation]="c" [lastOwn]="lastOwn()" [label]="name()" />
          }
        </div>
      }
    } @else if (notFound()) {
      <app-empty-state
        class="m-auto block max-w-md p-6"
        icon="comment"
        titleKey="chat.page.notFoundTitle"
        bodyKey="chat.page.notFoundBody"
      />
    } @else {
      <app-loading-state class="block p-6" [rows]="5" />
    }
  `,
})
export class ConversationView {
  private readonly store = inject(ChatStore);
  private readonly display = inject(ChatDisplay);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  readonly conversationId = input.required<string>();
  /** `?m=`: a message to jump to. */
  readonly messageId = input<string | null>(null);
  readonly compact = input(false);
  readonly showBack = input(false);

  readonly openThread = output<string>();
  readonly back = output<void>();

  protected readonly composer = viewChild(Composer);
  protected readonly notFound = signal(false);
  protected readonly joining = signal(false);
  protected readonly compactThread = signal<string | null>(null);
  protected readonly liveText = signal('');

  protected readonly conversation = computed(() => this.store.conversation(this.conversationId()));
  protected readonly name = computed(() => this.display.name(this.conversation()));
  protected readonly lastOwn = computed(() => {
    const me = this.store.meId();
    const items = this.store.page(this.conversationId()).items;
    for (let i = items.length - 1; i >= 0; i--) {
      const m = items[i];
      if (m.sender?.id === me && !m.deleted_at && !m.localState && m.kind === 'user') {
        return m;
      }
    }
    return null;
  });

  private announcedSeq = 0;
  private pendingAnnounce: ChatMessage[] = [];
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAnnounceAt = 0;

  constructor() {
    effect(() => {
      const id = this.conversationId();
      const messageId = this.messageId();
      const orgId = this.store.orgId();
      untracked(() => this.openConversation(id, messageId, orgId));
    });

    // Announce new messages from others (not on the first load).
    effect(() => {
      const page = this.store.page(this.conversationId());
      untracked(() => this.collectAnnouncements(page.items, page.loaded));
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.announceTimer) {
        clearTimeout(this.announceTimer);
      }
      if (this.store.currentId() === this.conversationId()) {
        this.store.setCurrent(null);
      }
    });
  }

  private openConversation(id: string, messageId: string | null, orgId: string | null): void {
    if (!orgId) {
      return;
    }
    this.notFound.set(false);
    this.compactThread.set(null);
    this.announcedSeq = 0;
    this.store.setCurrent(id);
    this.store.ensureConversation(id).subscribe((c) => {
      if (!c) {
        this.notFound.set(true);
        return;
      }
      this.store.open(id, messageId);
    });
  }

  protected onOpenThread(rootId: string): void {
    if (this.compact()) {
      this.compactThread.set(rootId);
    } else {
      this.openThread.emit(rootId);
    }
  }

  protected join(): void {
    this.joining.set(true);
    this.store.join(this.conversationId()).subscribe({
      next: () => this.joining.set(false),
      error: () => {
        this.joining.set(false);
        this.notifications.error('chat.members.errors.generic');
      },
    });
  }

  private collectAnnouncements(items: readonly ChatMessage[], loaded: boolean): void {
    if (!loaded) {
      return;
    }
    const newest = items.reduce((max, m) => (m.localState ? max : Math.max(max, m.seq)), 0);
    if (this.announcedSeq === 0) {
      this.announcedSeq = newest;
      return;
    }
    const me = this.store.meId();
    const fresh = items.filter(
      (m) =>
        !m.localState &&
        m.seq > this.announcedSeq &&
        m.sender?.id !== me &&
        m.kind === 'user' &&
        !m.deleted_at,
    );
    this.announcedSeq = Math.max(this.announcedSeq, newest);
    if (!fresh.length) {
      return;
    }
    this.pendingAnnounce.push(...fresh);
    if (this.announceTimer) {
      return;
    }
    const wait = Math.max(0, this.lastAnnounceAt + ANNOUNCE_EVERY_MS - Date.now());
    this.announceTimer = setTimeout(() => this.announce(), wait);
  }

  private announce(): void {
    this.announceTimer = null;
    const batch = this.pendingAnnounce;
    this.pendingAnnounce = [];
    if (!batch.length) {
      return;
    }
    this.lastAnnounceAt = Date.now();
    this.liveText.set(
      batch.length === 1
        ? this.language.translate('chat.page.liveOne', { name: batch[0].sender?.name ?? '' })
        : this.language.translate('chat.page.liveMany', { count: batch.length, name: this.name() }),
    );
  }
}
