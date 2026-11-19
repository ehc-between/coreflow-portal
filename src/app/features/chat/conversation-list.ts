import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatDisplay } from '../../core/chat/chat-display';
import { ChatStore } from '../../core/chat/chat-store';
import { badgeText, dayLabel, parseTs, timeLabel } from '../../core/chat/chat-format';
import { provideChatScope } from '../../core/chat/chat-scope';
import { ConversationSummary } from '../../core/chat/chat.models';
import { LanguageService } from '../../core/i18n/language.service';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ChatSearch } from './chat-search';
import { PresenceDot } from './presence-dot';

interface Section {
  readonly key: 'dms' | 'groups' | 'teams' | 'channels';
  readonly items: readonly ConversationSummary[];
}

/**
 * Conversation list (docs/chat-design.md §4.4): Direktemeldinger · Grupper ·
 * Team-kanaler · Kanaler, bold + count for unread, `@` for mentions, a
 * presence dot on DMs, one field that filters conversations by name and
 * searches messages on Enter (or for a `#tag`), "Ny samtale" and "Finn
 * kanaler". ↑/↓ move between conversations, Enter opens.
 */
@Component({
  selector: 'app-chat-conversation-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    Avatar,
    Button,
    EmptyState,
    ErrorState,
    Icon,
    LoadingState,
    ChatSearch,
    PresenceDot,
  ],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col bg-surface' },
  template: `
    <div class="flex items-center gap-2 px-4 pt-4 pb-3">
      <h1 class="flex-1 font-display text-section font-bold tracking-[-0.02em] text-fg">
        {{ 'chat.title' | transloco }}
      </h1>
      <app-button size="sm" (click)="newConversation.emit()" data-testid="chat-new">
        <app-icon name="plus" [size]="15" />
        {{ 'chat.list.new' | transloco }}
      </app-button>
    </div>

    <div class="px-3 pb-2">
      <label class="sr-only" for="chat-list-filter">{{ 'chat.list.filter' | transloco }}</label>
      <div
        class="flex items-center gap-2 rounded-tile border border-border bg-bg px-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
      >
        <app-icon class="text-fg-subtle" name="search" [size]="15" />
        <input
          id="chat-list-filter"
          type="search"
          autocomplete="off"
          class="h-9 w-full bg-transparent text-ui text-fg outline-none placeholder:text-fg-placeholder"
          [placeholder]="'chat.search.placeholder' | transloco"
          [value]="filter()"
          (input)="onFilter($event)"
          (keydown.enter)="searchMessages()"
          (keydown.escape)="clearFilter()"
          data-testid="chat-filter"
        />
        @if (filter() || searching()) {
          <button
            type="button"
            class="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-2"
            [attr.aria-label]="'chat.search.clear' | transloco"
            (click)="clearFilter()"
          >
            <app-icon name="x" [size]="13" />
          </button>
        }
      </div>
    </div>

    @if (searching()) {
      <app-chat-search
        class="min-h-0 flex-1"
        [query]="messageQuery()"
        [tag]="tag()"
        (clearTag)="clearTag.emit()"
      />
    } @else {
      <nav
        tabindex="-1"
        class="min-h-0 flex-1 overflow-y-auto px-2 pb-3 outline-none"
        [attr.aria-label]="'chat.list.label' | transloco"
        (keydown)="onKeydown($event)"
      >
        @if (store.listState() === 'loading') {
          <app-loading-state class="block px-2" [rows]="6" />
        } @else if (store.listState() === 'error') {
          <app-error-state
            class="block p-2"
            titleKey="chat.list.loadError"
            (retry)="store.loadList()"
          />
        } @else if (!store.conversations().length) {
          <app-empty-state
            class="block p-2"
            icon="comment"
            titleKey="chat.list.empty.title"
            bodyKey="chat.list.empty.body"
            ctaKey="chat.list.browse"
            ctaLink="/chat/browse"
            ctaVariant="secondary"
            [compact]="true"
          />
        } @else {
          @if (filter() && !hasMatches()) {
            <p class="px-2 py-3 text-meta text-fg-muted">
              {{ 'chat.list.noMatch' | transloco: { q: filter() } }}
            </p>
          }
          @if (filter().trim()) {
            <button
              type="button"
              class="mb-2 flex w-full items-center gap-2 rounded-tile px-2.5 py-2 text-left text-meta font-semibold text-accent hover:bg-accent-soft"
              data-testid="chat-search-messages"
              (click)="searchMessages()"
            >
              <app-icon name="search" [size]="14" />
              {{ 'chat.search.label' | transloco }}: “{{ filter().trim() }}”
            </button>
          }
          @for (section of sections(); track section.key) {
            @if (section.items.length) {
              <h2
                class="mt-3 mb-1 px-2.5 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
              >
                {{ 'chat.list.sections.' + section.key | transloco }}
              </h2>
              <ul class="flex flex-col gap-0.5">
                @for (c of section.items; track c.id) {
                  @let unread = c.unread_count > 0 && c.me?.notify_level !== 'none';
                  <li>
                    <a
                      [routerLink]="['/chat', c.id]"
                      [attr.aria-current]="store.currentId() === c.id ? 'page' : null"
                      data-chat-link
                      data-testid="chat-list-item"
                      class="flex min-h-[52px] items-center gap-2.5 rounded-tile px-2.5 py-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      [class]="store.currentId() === c.id ? 'bg-accent-soft' : 'hover:bg-surface-2'"
                      [attr.aria-label]="ariaLabel(c)"
                    >
                      <span class="relative flex-none">
                        @if (c.kind === 'dm') {
                          <app-avatar [name]="display.name(c)" size="sm" [gradient]="false" />
                          <app-chat-presence-dot
                            class="absolute -right-0.5 -bottom-0.5"
                            [status]="store.presence(display.dmPartner(c))"
                          />
                        } @else {
                          <span
                            class="flex h-7 w-7 items-center justify-center rounded-tile bg-surface-2 text-meta font-bold text-fg-muted"
                            aria-hidden="true"
                          >
                            @if (c.kind === 'channel') {
                              #
                            } @else {
                              <app-icon name="people" [size]="14" />
                            }
                          </span>
                        }
                      </span>
                      <span class="flex min-w-0 flex-1 flex-col">
                        <span class="flex items-baseline gap-2">
                          <span
                            class="min-w-0 flex-1 truncate text-ui"
                            [class]="unread ? 'font-bold text-fg' : 'font-medium text-fg'"
                          >
                            {{ display.name(c) }}
                          </span>
                          @if (c.last_message_at) {
                            <span class="flex-none text-micro text-fg-subtle">{{
                              when(c.last_message_at)
                            }}</span>
                          }
                        </span>
                        <span class="flex items-center gap-2">
                          <span
                            class="min-w-0 flex-1 truncate text-meta"
                            [class]="unread ? 'text-fg-muted' : 'text-fg-subtle'"
                          >
                            {{ preview(c) }}
                          </span>
                          @if (c.mention_count > 0) {
                            <span
                              class="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-fail px-1.5 text-micro font-bold text-white"
                              aria-hidden="true"
                              >&#64;</span
                            >
                          }
                          @if (unread && c.kind !== 'channel') {
                            <span
                              class="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-accent px-1.5 text-micro font-bold text-white"
                              aria-hidden="true"
                              >{{ badge(c.unread_count) }}</span
                            >
                          }
                          @if (c.me?.notify_level === 'none') {
                            <app-icon class="flex-none text-fg-subtle" name="bell" [size]="12" />
                          }
                        </span>
                      </span>
                    </a>
                  </li>
                }
              </ul>
            }
          }
        }
        <a
          routerLink="/chat/browse"
          class="mt-4 flex items-center gap-2 rounded-tile px-2.5 py-2 text-meta font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          data-testid="chat-browse-link"
        >
          <span
            class="flex h-7 w-7 items-center justify-center rounded-tile bg-surface-2 font-bold"
            aria-hidden="true"
            >#</span
          >
          {{ 'chat.list.browse' | transloco }}
        </a>
      </nav>
    }
  `,
})
export class ConversationList {
  protected readonly store = inject(ChatStore);
  protected readonly display = inject(ChatDisplay);
  private readonly language = inject(LanguageService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** `?tag=` from a clicked tag: opens message search filtered on it. */
  readonly tag = input<string | null>(null);
  readonly newConversation = output<void>();
  readonly clearTag = output<void>();

  protected readonly filter = signal('');
  protected readonly messageQuery = signal('');
  private readonly searchRequested = signal(false);
  protected readonly searching = computed(() => this.searchRequested() || !!this.tag());

  private readonly filtered = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const list = this.store.conversations();
    if (!q) {
      return list;
    }
    return list.filter((c) => this.display.name(c).toLowerCase().includes(q));
  });
  protected readonly hasMatches = computed(() => this.filtered().length > 0);

  protected readonly sections = computed<readonly Section[]>(() => {
    const list = this.filtered();
    return [
      { key: 'dms', items: list.filter((c) => c.kind === 'dm') },
      { key: 'groups', items: list.filter((c) => c.kind === 'group') },
      { key: 'teams', items: list.filter((c) => c.kind === 'channel' && !!c.department_id) },
      { key: 'channels', items: list.filter((c) => c.kind === 'channel' && !c.department_id) },
    ];
  });

  protected onFilter(event: Event): void {
    this.filter.set((event.target as HTMLInputElement).value);
    if (!this.filter().trim()) {
      this.searchRequested.set(false);
    }
  }

  protected searchMessages(): void {
    const q = this.filter().trim();
    if (!q) {
      return;
    }
    this.messageQuery.set(q);
    this.searchRequested.set(true);
  }

  protected clearFilter(): void {
    this.filter.set('');
    this.messageQuery.set('');
    this.searchRequested.set(false);
    if (this.tag()) {
      this.clearTag.emit();
    }
  }

  protected badge(count: number): string {
    return badgeText(count);
  }

  protected when(iso: string): string {
    const locale = this.language.locale();
    const day = dayLabel(iso, locale);
    if (day.kind === 'today') {
      return timeLabel(iso, locale);
    }
    if (day.kind === 'yesterday') {
      return this.language.translate('chat.messages.yesterday');
    }
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
      new Date(parseTs(iso)),
    );
  }

  protected preview(c: ConversationSummary): string {
    const last = c.last_message;
    if (!last) {
      return this.language.translate('chat.list.noMessages');
    }
    if (last.deleted) {
      return this.language.translate('chat.list.deleted');
    }
    const text =
      last.snippet || (last.has_attachments ? this.language.translate('chat.list.attachment') : '');
    if (last.sender?.id === this.store.meId()) {
      return this.language.translate('chat.list.you', { text });
    }
    return c.kind === 'dm' || !last.sender ? text : `${last.sender.name.split(' ')[0]}: ${text}`;
  }

  protected ariaLabel(c: ConversationSummary): string {
    const parts = [this.display.name(c)];
    if (c.kind === 'dm') {
      const status = this.store.presence(this.display.dmPartner(c));
      parts.push(this.language.translate(`chat.presence.${status}`));
    }
    if (c.unread_count > 0 && c.me?.notify_level !== 'none') {
      parts.push(this.language.translate('chat.list.unread', { count: badgeText(c.unread_count) }));
    }
    if (c.mention_count > 0) {
      parts.push(this.language.translate('chat.list.mentions', { count: c.mention_count }));
    }
    return parts.join(', ');
  }

  /** ↑/↓ move between conversation links (Enter follows the link natively). */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const links = Array.from(
      (this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('a[data-chat-link]'),
    );
    const index = links.indexOf(event.target as HTMLElement);
    if (index < 0) {
      return;
    }
    event.preventDefault();
    const next = links[index + (event.key === 'ArrowDown' ? 1 : -1)];
    next?.focus();
  }
}
