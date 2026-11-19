import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatStore } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import { ChatMessage, ConversationSummary } from '../../core/chat/chat.models';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { Composer } from './composer';
import { MessageItem } from './message-item';
import { TypingIndicator } from './typing-indicator';

/**
 * A thread (docs/chat-design.md §4.4): the root message, its replies (never
 * nested, D-22) with the same message component, its own composer, and
 * "Følg tråden" / "Slutt å følge".
 */
@Component({
  selector: 'app-chat-thread-panel',
  imports: [TranslocoPipe, ErrorState, Icon, LoadingState, Composer, MessageItem, TypingIndicator],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col bg-surface' },
  template: `
    @let t = thread();
    <div class="flex items-center gap-2 border-b border-border px-4 py-3">
      <h2 class="flex-1 font-display text-card font-bold text-fg" id="chat-thread-title">
        {{ 'chat.thread.title' | transloco }}
      </h2>
      @if (t?.root) {
        <button
          type="button"
          class="h-9 rounded-lg px-2.5 text-meta font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [attr.aria-pressed]="t!.following"
          data-testid="chat-thread-follow"
          (click)="store.followThread(conversation().id, rootId(), !t!.following)"
        >
          {{ (t!.following ? 'chat.thread.unfollow' : 'chat.thread.follow') | transloco }}
        </button>
      }
      <button
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        [attr.aria-label]="'chat.thread.close' | transloco"
        data-testid="chat-thread-close"
        (click)="closed.emit()"
      >
        <app-icon name="x" [size]="16" />
      </button>
    </div>

    <div
      class="min-h-0 flex-1 overflow-y-auto py-2"
      role="feed"
      [attr.aria-busy]="!!t?.loading"
      aria-labelledby="chat-thread-title"
    >
      @if (t?.root; as root) {
        <app-chat-message-item
          [message]="root"
          [conversation]="conversation()"
          [meId]="store.meId()"
          [inThread]="true"
          (edit)="startEdit($event)"
        />
        <div class="mx-4 my-2 h-px bg-border"></div>
      }
      @if (t?.loading && !t?.items?.length) {
        <app-loading-state class="block px-4" [rows]="3" />
      } @else if (t?.error) {
        <app-error-state class="block p-4" titleKey="chat.thread.loadError" (retry)="reload()" />
      } @else {
        @for (m of t?.items ?? []; track m.client_id ?? m.id) {
          <app-chat-message-item
            [message]="m"
            [conversation]="conversation()"
            [meId]="store.meId()"
            [inThread]="true"
            (edit)="startEdit($event)"
          />
        } @empty {
          <p class="px-4 py-3 text-meta text-fg-subtle">{{ 'chat.thread.empty' | transloco }}</p>
        }
      }
    </div>

    <app-chat-typing-indicator [conversationId]="conversation().id" [parentId]="rootId()" />
    <div class="px-3 pb-3">
      <app-chat-composer
        [conversation]="conversation()"
        [parentId]="rootId()"
        [lastOwn]="lastOwn()"
        [label]="'chat.thread.title' | transloco"
      />
    </div>
  `,
})
export class ThreadPanel {
  protected readonly store = inject(ChatStore);

  readonly conversation = input.required<ConversationSummary>();
  readonly rootId = input.required<string>();
  readonly closed = output<void>();

  private readonly composer = viewChild(Composer);

  private readonly conversationId = computed(() => this.conversation().id);
  protected readonly thread = computed(() => this.store.thread(this.rootId()));
  protected readonly lastOwn = computed(() => {
    const me = this.store.meId();
    const items = this.thread()?.items ?? [];
    return (
      [...items].reverse().find((m) => m.sender?.id === me && !m.deleted_at && !m.localState) ??
      null
    );
  });

  constructor() {
    effect(() => {
      const rootId = this.rootId();
      const conversationId = this.conversationId();
      untracked(() => {
        this.store.openThread(conversationId, rootId);
        queueMicrotask(() => this.composer()?.focus());
      });
    });
  }

  protected reload(): void {
    this.store.openThread(this.conversation().id, this.rootId());
  }

  protected startEdit(message: ChatMessage): void {
    this.composer()?.startEdit(message);
  }
}
