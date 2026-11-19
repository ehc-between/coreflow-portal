import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
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
import { ChatStore } from '../../core/chat/chat-store';
import { ListRow, buildRows, dayLabel } from '../../core/chat/chat-format';
import { provideChatScope } from '../../core/chat/chat-scope';
import { ChatMessage, ConversationSummary } from '../../core/chat/chat.models';
import { LanguageService } from '../../core/i18n/language.service';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MessageItem } from './message-item';

const BOTTOM_SLACK_PX = 80;

/**
 * The message feed of one conversation (docs/chat-design.md §4.4, D-15): a
 * windowed list — pages of 50 loaded by IntersectionObserver sentinels at
 * both ends, at most 300 messages in the DOM, rows with
 * `content-visibility: auto` — with day separators, sender grouping, a
 * "Nye meldinger" divider, a "Hopp til nyeste" pill when new messages arrive
 * while scrolled up, and jump-to-message (`?m=`) with a highlight.
 * Bottom-anchored: it follows new messages while the reader is at the end.
 */
@Component({
  selector: 'app-chat-message-list',
  imports: [TranslocoPipe, EmptyState, ErrorState, Icon, LoadingState, MessageItem],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative flex min-h-0 flex-1 flex-col' },
  template: `
    @let p = page();
    <div
      #scroller
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
      role="feed"
      tabindex="0"
      [attr.aria-busy]="p.loading"
      [attr.aria-label]="'chat.messages.feedLabel' | transloco: { name: name() }"
      data-testid="chat-feed"
      (scroll)="onScroll()"
    >
      <div #top class="h-px" aria-hidden="true"></div>
      @if (p.loaded && p.hasMoreBefore) {
        <p class="py-3 text-center text-meta text-fg-subtle" role="status">
          {{ 'chat.messages.loadingOlder' | transloco }}
        </p>
      } @else if (p.loaded && rows().length) {
        <p class="px-4 pt-6 pb-2 text-meta text-fg-subtle">
          {{ 'chat.messages.beginning' | transloco }}
        </p>
      }

      @if (!p.loaded && p.loading) {
        <app-loading-state class="block p-4" [rows]="5" />
      } @else if (!p.loaded && p.error) {
        <app-error-state class="block p-4" (retry)="store.loadLatest(conversation().id)" />
      } @else if (p.loaded && !rows().length) {
        <app-empty-state
          class="block p-6"
          icon="comment"
          titleKey="chat.messages.emptyTitle"
          bodyKey="chat.messages.emptyBody"
          [compact]="true"
        />
      }

      @for (row of rows(); track row.key) {
        @switch (row.kind) {
          @case ('day') {
            <div class="sticky top-0 z-[1] flex justify-center py-2" role="separator">
              <span
                class="rounded-full border border-border bg-surface px-3 py-0.5 text-micro font-semibold text-fg-muted shadow-sm"
                >{{ dayText(row) }}</span
              >
            </div>
          }
          @case ('unread') {
            <div
              class="flex items-center gap-2 px-4 py-1"
              role="separator"
              data-testid="chat-unread-divider"
            >
              <span class="h-px flex-1 bg-fail/60"></span>
              <span class="text-micro font-bold text-fail-ink uppercase">{{
                'chat.messages.newDivider' | transloco
              }}</span>
              <span class="h-px flex-1 bg-fail/60"></span>
            </div>
          }
          @case ('message') {
            <app-chat-message-item
              [message]="messageOf(row)"
              [head]="headOf(row)"
              [conversation]="conversation()"
              [meId]="store.meId()"
              [highlighted]="p.highlightId === messageOf(row).id"
              (openThread)="openThread.emit($event)"
              (edit)="edit.emit($event)"
            />
          }
        }
      }
      <div #bottom class="h-px" aria-hidden="true"></div>
    </div>

    @if (showJump()) {
      <button
        type="button"
        class="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-meta font-semibold text-white shadow-pop hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
        data-testid="chat-jump-latest"
        (click)="jumpToLatest()"
      >
        <app-icon name="arrow" [size]="14" class="rotate-90" />
        {{ 'chat.messages.jumpLatest' | transloco }}
      </button>
    }
  `,
})
export class MessageList {
  protected readonly store = inject(ChatStore);
  private readonly language = inject(LanguageService);
  private readonly injector = inject(Injector);

  readonly conversation = input.required<ConversationSummary>();
  readonly name = input('');

  readonly openThread = output<string>();
  readonly edit = output<ChatMessage>();

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly top = viewChild<ElementRef<HTMLElement>>('top');
  private readonly bottom = viewChild<ElementRef<HTMLElement>>('bottom');

  protected readonly page = computed(() => this.store.page(this.conversation().id));
  protected readonly rows = computed(() =>
    buildRows(this.page().items, this.page().readMarker, this.store.meId()),
  );

  private readonly atBottom = signal(true);
  private readonly newWhileAway = signal(false);
  protected readonly showJump = computed(
    () =>
      (!this.atBottom() && this.newWhileAway()) || (this.page().loaded && this.page().hasMoreAfter),
  );

  private lastFirstKey: string | null = null;
  private lastLastKey: string | null = null;
  private lastConversation: string | null = null;
  private observer: IntersectionObserver | null = null;

  constructor() {
    effect(() => {
      const rows = this.rows();
      const conversationId = this.conversation().id;
      const highlight = this.page().highlightId;
      untracked(() => this.beforeRender(rows, conversationId, highlight));
    });

    afterNextRender(() => this.observe());
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  protected messageOf(row: ListRow): ChatMessage {
    return (row as Extract<ListRow, { kind: 'message' }>).message;
  }

  protected headOf(row: ListRow): boolean {
    return (row as Extract<ListRow, { kind: 'message' }>).head;
  }

  protected dayText(row: ListRow): string {
    const label = dayLabel((row as Extract<ListRow, { kind: 'day' }>).iso, this.language.locale());
    if (label.kind === 'today') {
      return this.language.translate('chat.messages.today');
    }
    if (label.kind === 'yesterday') {
      return this.language.translate('chat.messages.yesterday');
    }
    return label.text;
  }

  protected onScroll(): void {
    const el = this.scroller()?.nativeElement;
    if (!el) {
      return;
    }
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK_PX;
    this.atBottom.set(bottom);
    if (bottom) {
      this.newWhileAway.set(false);
      if (!this.page().hasMoreAfter) {
        this.store.scheduleRead();
      }
    }
  }

  protected jumpToLatest(): void {
    this.newWhileAway.set(false);
    if (this.page().hasMoreAfter) {
      this.store.loadLatest(this.conversation().id);
      this.atBottom.set(true);
      return;
    }
    this.scrollToBottom('smooth');
  }

  /** Measure before the DOM changes, then anchor after it rendered. */
  private beforeRender(
    rows: readonly ListRow[],
    conversationId: string,
    highlight: string | null,
  ): void {
    const el = this.scroller()?.nativeElement;
    const firstKey = rows.find((r) => r.kind === 'message')?.key ?? null;
    const lastKey = [...rows].reverse().find((r) => r.kind === 'message')?.key ?? null;
    const switched = conversationId !== this.lastConversation;
    const prepended =
      !switched &&
      !!firstKey &&
      !!this.lastFirstKey &&
      firstKey !== this.lastFirstKey &&
      lastKey === this.lastLastKey;
    const appended = !switched && !!lastKey && lastKey !== this.lastLastKey;
    const wasBottom = this.atBottom();
    const heightBefore = el?.scrollHeight ?? 0;
    const topBefore = el?.scrollTop ?? 0;
    this.lastFirstKey = firstKey;
    this.lastLastKey = lastKey;
    this.lastConversation = conversationId;
    if (switched) {
      this.atBottom.set(true);
      this.newWhileAway.set(false);
    }

    afterNextRender(
      () => {
        const scroller = this.scroller()?.nativeElement;
        if (!scroller) {
          return;
        }
        if (highlight) {
          const target = scroller.querySelector<HTMLElement>(
            `[data-message-id="${CSS.escape(highlight)}"]`,
          );
          if (target) {
            target.scrollIntoView?.({ block: 'center' });
            setTimeout(() => this.store.clearHighlight(conversationId), 4000);
            return;
          }
        }
        if (switched || (appended && wasBottom)) {
          this.scrollToBottom('auto');
        } else if (prepended) {
          scroller.scrollTop = topBefore + (scroller.scrollHeight - heightBefore);
        } else if (appended && !wasBottom) {
          this.newWhileAway.set(true);
        }
      },
      { injector: this.injector },
    );
  }

  private scrollToBottom(behavior: ScrollBehavior): void {
    const el = this.scroller()?.nativeElement;
    if (!el) {
      return;
    }
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    this.atBottom.set(true);
  }

  private observe(): void {
    const root = this.scroller()?.nativeElement;
    const top = this.top()?.nativeElement;
    const bottom = this.bottom()?.nativeElement;
    if (!root || !top || !bottom || typeof IntersectionObserver === 'undefined') {
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          const page = this.page();
          if (!page.loaded || page.loading) {
            continue;
          }
          if (entry.target === top && page.hasMoreBefore) {
            this.store.loadOlder(this.conversation().id);
          } else if (entry.target === bottom && page.hasMoreAfter) {
            this.store.loadNewer(this.conversation().id);
          }
        }
      },
      { root, rootMargin: '400px 0px' },
    );
    this.observer.observe(top);
    this.observer.observe(bottom);
  }
}
