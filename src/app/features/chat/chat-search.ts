import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatApi } from '../../core/chat/chat-api';
import { ChatDisplay } from '../../core/chat/chat-display';
import { ChatStore } from '../../core/chat/chat-store';
import { timeLabel, dayLabel } from '../../core/chat/chat-format';
import { provideChatScope } from '../../core/chat/chat-scope';
import { ChatSearchHit, SearchHas, UserRef } from '../../core/chat/chat.models';
import { LanguageService } from '../../core/i18n/language.service';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PeoplePicker } from './people-picker';

/** A snippet split on `<mark>` (the only markup the server sends) — never bound as HTML. */
export function snippetParts(snippet: string): { readonly text: string; readonly mark: boolean }[] {
  const parts: { text: string; mark: boolean }[] = [];
  const pattern = /<mark>([\s\S]*?)<\/mark>/g;
  let last = 0;
  for (const match of snippet.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ text: snippet.slice(last, index), mark: false });
    }
    parts.push({ text: match[1], mark: true });
    last = index + match[0].length;
  }
  if (last < snippet.length) {
    parts.push({ text: snippet.slice(last), mark: false });
  }
  // Any other tag-like text stays literal (Angular escapes interpolation).
  return parts;
}

/**
 * Message search in the list pane (docs/chat-design.md §2.5, §4.4): free
 * text, a `#tag` chip, from-person and "har fil/bilde/lenke". Results open
 * the conversation at the message (`?m=`).
 */
@Component({
  selector: 'app-chat-search',
  imports: [RouterLink, TranslocoPipe, Icon, LoadingState, PeoplePicker],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    <div class="flex flex-wrap items-center gap-2 px-3 pb-2">
      @if (tag()) {
        <span
          class="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pr-1 pl-2.5 text-meta font-semibold text-accent"
        >
          {{ 'chat.search.tag' | transloco: { tag: tag() } }}
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface"
            [attr.aria-label]="'chat.search.removeTag' | transloco: { tag: tag() }"
            (click)="clearTag.emit()"
          >
            <app-icon name="x" [size]="12" />
          </button>
        </span>
      }
      <label class="sr-only" for="chat-search-has">{{ 'chat.search.has.label' | transloco }}</label>
      <select
        id="chat-search-has"
        class="h-8 rounded-lg border border-border bg-surface px-2 text-meta text-fg"
        [value]="has()"
        (change)="has.set(selectValue($event))"
      >
        <option value="">
          {{ 'chat.search.has.label' | transloco }}: {{ 'chat.search.has.any' | transloco }}
        </option>
        @for (h of hasOptions; track h) {
          <option [value]="h">{{ 'chat.search.has.' + h | transloco }}</option>
        }
      </select>
    </div>
    <div class="px-3 pb-2">
      <app-chat-people-picker
        [(selected)]="from"
        [max]="1"
        [label]="'chat.search.from' | transloco"
      />
    </div>

    <div
      class="min-h-0 flex-1 overflow-y-auto px-2"
      aria-live="polite"
      [attr.aria-busy]="loading()"
    >
      <h2 class="sr-only">{{ 'chat.search.results' | transloco }}</h2>
      @if (loading() && !hits().length) {
        <app-loading-state class="block px-2" [rows]="4" />
      } @else if (error()) {
        <p class="px-2 py-4 text-meta text-fail-ink" role="alert">
          {{ 'chat.search.error' | transloco }}
        </p>
      } @else if (!hits().length && searched()) {
        <div class="px-3 py-6 text-center">
          <p class="text-ui font-semibold text-fg">{{ 'chat.search.none' | transloco }}</p>
          <p class="mt-1 text-meta text-fg-muted">{{ 'chat.search.noneBody' | transloco }}</p>
        </div>
      }
      <ul class="flex flex-col gap-1">
        @for (hit of hits(); track hit.message.id) {
          <li>
            <a
              [routerLink]="['/chat', hit.conversation.id]"
              [queryParams]="{ m: hit.message.id }"
              class="block rounded-tile px-2.5 py-2 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              data-testid="chat-search-hit"
              (click)="opened.emit()"
            >
              <span class="flex items-baseline gap-2 text-micro text-fg-subtle">
                <span class="truncate font-semibold text-fg-muted">{{
                  hit.message.sender?.name
                }}</span>
                <span class="truncate">{{
                  'chat.search.in' | transloco: { name: display.name(hit.conversation) }
                }}</span>
                <span class="ml-auto flex-none">{{ when(hit) }}</span>
              </span>
              <span class="mt-0.5 line-clamp-2 block text-ui text-fg">
                @for (part of parts(hit); track $index) {
                  @if (part.mark) {
                    <mark class="rounded bg-warn-soft px-0.5 text-fg">{{ part.text }}</mark>
                  } @else {
                    {{ part.text }}
                  }
                }
              </span>
            </a>
          </li>
        }
      </ul>
      @if (nextCursor()) {
        <button
          type="button"
          class="my-2 w-full rounded-tile py-2 text-meta font-semibold text-accent hover:bg-accent-soft"
          (click)="run(true)"
        >
          {{ 'chat.search.more' | transloco }}
        </button>
      }
    </div>
  `,
})
export class ChatSearch {
  private readonly api = inject(ChatApi);
  private readonly store = inject(ChatStore);
  protected readonly display = inject(ChatDisplay);
  private readonly language = inject(LanguageService);

  readonly query = input('');
  readonly tag = input<string | null>(null);
  readonly clearTag = output<void>();
  readonly opened = output<void>();

  protected readonly hasOptions: readonly SearchHas[] = ['file', 'image', 'link'];
  protected readonly has = signal<SearchHas | ''>('');
  protected readonly from = signal<readonly UserRef[]>([]);
  protected readonly hits = signal<readonly ChatSearchHit[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly searched = signal(false);

  private readonly criteria = computed(() => ({
    q: this.query().trim(),
    tag: this.tag(),
    has: this.has(),
    from: this.from()[0]?.id ?? null,
    org: this.store.orgId(),
  }));
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.criteria();
      untracked(() => {
        if (this.timer) {
          clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => this.run(false), 250);
      });
    });
  }

  protected selectValue(event: Event): SearchHas | '' {
    return (event.target as HTMLSelectElement).value as SearchHas | '';
  }

  protected parts(hit: ChatSearchHit) {
    return snippetParts(hit.snippet);
  }

  protected when(hit: ChatSearchHit): string {
    const locale = this.language.locale();
    const day = dayLabel(hit.message.created_at, locale);
    const time = timeLabel(hit.message.created_at, locale);
    if (day.kind === 'today') {
      return time;
    }
    return day.kind === 'yesterday' ? this.language.translate('chat.messages.yesterday') : day.text;
  }

  run(more: boolean): void {
    const c = this.criteria();
    if (!c.org || (!c.q && !c.tag && !c.has && !c.from)) {
      this.hits.set([]);
      this.searched.set(false);
      this.nextCursor.set(null);
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    this.api
      .search(c.org, {
        q: c.q || undefined,
        tag: c.tag ?? undefined,
        has: c.has || undefined,
        from_user_id: c.from ?? undefined,
        limit: 20,
        cursor: more ? (this.nextCursor() ?? undefined) : undefined,
      })
      .subscribe({
        next: (res) => {
          this.hits.set(more ? [...this.hits(), ...res.items] : res.items);
          this.nextCursor.set(res.next_cursor);
          this.loading.set(false);
          this.searched.set(true);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }
}
