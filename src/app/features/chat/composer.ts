import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { AttachmentUploadError, AttachmentsApi } from '../../core/attachments/attachments-api';
import { Attachment } from '../../core/attachments/attachment.models';
import { preCheckFile, uploadErrorKey } from '../../core/attachments/attachment-utils';
import { ChatApi } from '../../core/chat/chat-api';
import {
  ChosenMention,
  activeTag,
  decodeBody,
  encodeBody,
  insertLink,
  insertTag,
  prefixLines,
  uniqueRefs,
  wrapSelection,
} from '../../core/chat/chat-compose';
import { ChatStore, OutgoingAttachment, chatErrorCode } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import {
  CHAT_ATTACHMENT_ENTITY,
  CHAT_LIMITS,
  ChatMessage,
  ConversationSummary,
  EntityLinkRef,
  MessageWarning,
} from '../../core/chat/chat.models';
import { LanguageService } from '../../core/i18n/language.service';
import { internalLink } from '../../core/search/internal-link';
import { activeMention, insertMention } from '../../shared/kit/mentions';
import { Icon } from '../../shared/ui/icon/icon';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { EmojiPicker } from './emoji-picker';
import { RecordCard } from './record-card';
import { RecordLinkPicker } from './record-link-picker';

interface Suggestion {
  readonly key: string;
  readonly kind: 'user' | 'team' | 'tag';
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

interface SuggestState {
  readonly mode: 'mention' | 'tag';
  readonly start: number;
  readonly query: string;
}

interface Upload {
  readonly key: string;
  readonly file: File;
  readonly previewUrl: string | null;
  readonly loaded: number;
  readonly state: 'uploading' | 'scanning' | 'ready' | 'failed';
  readonly attachment: Attachment | null;
  readonly errorKey: string | null;
}

const UUID_IN_PATH =
  /\/([a-z][a-z0-9-]*)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;

let nextId = 0;

/**
 * Message composer (docs/chat-design.md §4.4): labelled auto-growing textarea
 * (Enter sends, Shift+Enter new line, ↑ edits my last message, Escape
 * cancels an edit), `@` and `#` autocomplete as an ARIA combobox, a small
 * markdown toolbar, files (button, paste, drag-and-drop) through the
 * attachment service with progress and image previews, record links,
 * emoji, throttled typing signals, and pasted portal URLs of records turned
 * into record links (when the record resolves for me).
 */
@Component({
  selector: 'app-chat-composer',
  imports: [TranslocoPipe, Icon, EmojiPicker, RecordCard, RecordLinkPicker, PromptDialog],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'dragging.set(false)',
    '(drop)': 'onDrop($event)',
  },
  template: `
    @let c = conversation();
    <div
      class="@container relative rounded-card border bg-surface shadow-sm transition-colors motion-reduce:transition-none"
      [class]="
        dragging()
          ? 'border-accent ring-2 ring-accent/30'
          : 'border-border focus-within:border-accent-border'
      "
    >
      @if (editing()) {
        <div
          class="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-meta"
        >
          <span class="font-semibold text-accent">{{ 'chat.composer.editing' | transloco }}</span>
          <button
            type="button"
            class="font-semibold text-fg-muted hover:text-fg"
            (click)="cancelEdit()"
          >
            {{ 'chat.composer.cancelEdit' | transloco }}
          </button>
        </div>
      }

      @if (records().length) {
        <div
          class="flex flex-col gap-1.5 border-b border-border px-3 py-2"
          [attr.aria-label]="'chat.composer.linkedRecords' | transloco"
          role="group"
        >
          @for (ref of records(); track ref.entity_id) {
            <div class="flex items-center gap-2">
              <app-chat-record-card class="min-w-0 flex-1" [ref]="ref" />
              <button
                type="button"
                class="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg"
                [attr.aria-label]="'chat.composer.removeRecord' | transloco"
                (click)="removeRecord(ref)"
              >
                <app-icon name="x" [size]="15" />
              </button>
            </div>
          }
        </div>
      }

      @if (uploads().length) {
        <ul class="flex flex-wrap gap-2 border-b border-border px-3 py-2">
          @for (up of uploads(); track up.key) {
            <li
              class="relative flex max-w-[260px] items-center gap-2 rounded-tile border border-border bg-surface-2 py-1.5 pr-9 pl-1.5"
              data-testid="chat-upload"
            >
              @if (up.previewUrl) {
                <img
                  [src]="up.previewUrl"
                  alt=""
                  class="h-10 w-10 flex-none rounded-lg object-cover"
                />
              } @else {
                <span
                  class="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-surface text-fg-subtle"
                  ><app-icon name="documents" [size]="18"
                /></span>
              }
              <span class="flex min-w-0 flex-col">
                <span class="truncate text-meta font-semibold text-fg">{{ up.file.name }}</span>
                <span
                  class="text-micro"
                  [class]="up.state === 'failed' ? 'text-fail-ink' : 'text-fg-subtle'"
                  role="status"
                >
                  @switch (up.state) {
                    @case ('uploading') {
                      {{
                        'chat.composer.upload.progress'
                          | transloco: { name: up.file.name, percent: percent(up) }
                      }}
                    }
                    @case ('scanning') {
                      {{ 'chat.composer.upload.scanning' | transloco: { name: up.file.name } }}
                    }
                    @case ('ready') {
                      {{ 'chat.composer.upload.ready' | transloco: { name: up.file.name } }}
                    }
                    @case ('failed') {
                      {{ up.errorKey ?? 'attachments.errors.generic' | transloco }}
                    }
                  }
                </span>
                @if (up.state === 'uploading') {
                  <span
                    class="mt-1 block h-1 w-full overflow-hidden rounded-full bg-border"
                    aria-hidden="true"
                  >
                    <span class="block h-full bg-accent" [style.width.%]="percent(up)"></span>
                  </span>
                }
              </span>
              <button
                type="button"
                class="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface hover:text-fg"
                [attr.aria-label]="
                  'chat.composer.upload.remove' | transloco: { name: up.file.name }
                "
                (click)="removeUpload(up)"
              >
                <app-icon name="x" [size]="14" />
              </button>
            </li>
          }
        </ul>
      }

      <div class="relative">
        <label class="sr-only" [for]="textareaId">{{
          'chat.composer.label' | transloco: { name: label() }
        }}</label>
        <textarea
          #textarea
          [id]="textareaId"
          rows="1"
          role="combobox"
          aria-autocomplete="list"
          [attr.aria-expanded]="suggestOpen()"
          [attr.aria-controls]="listboxId"
          [attr.aria-activedescendant]="
            suggestOpen() && activeSuggestion() ? optionId(activeIndex()) : null
          "
          [attr.aria-describedby]="hintId"
          [placeholder]="
            (parentId() ? 'chat.composer.placeholderThread' : 'chat.composer.placeholder')
              | transloco
          "
          [disabled]="disabled()"
          [value]="text()"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
          (click)="refreshSuggest()"
          (paste)="onPaste($event)"
          (blur)="onBlur()"
          data-testid="chat-composer-input"
          class="block max-h-[calc(8*1.55em+16px)] min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-body text-fg outline-none placeholder:text-fg-placeholder disabled:cursor-not-allowed"
        ></textarea>
        <span [id]="hintId" class="sr-only">{{ 'chat.composer.sendHint' | transloco }}</span>

        @if (suggestOpen()) {
          <ul
            [id]="listboxId"
            role="listbox"
            data-testid="chat-suggestions"
            class="absolute bottom-full left-2 z-30 mb-1 max-h-[260px] w-[min(340px,calc(100%-16px))] overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-pop"
            [attr.aria-label]="
              (suggest()?.mode === 'tag'
                ? 'chat.composer.suggest.tags'
                : 'chat.composer.suggest.people'
              ) | transloco
            "
          >
            @for (s of suggestions(); track s.key; let i = $index) {
              <li
                [id]="optionId(i)"
                role="option"
                [attr.aria-selected]="i === activeIndex()"
                class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-ui"
                [class]="
                  i === activeIndex() ? 'bg-accent-soft text-accent' : 'text-fg hover:bg-surface-2'
                "
                (mousedown)="$event.preventDefault(); choose(s)"
              >
                <app-icon
                  [name]="s.kind === 'tag' ? 'flag' : s.kind === 'team' ? 'people' : 'smile'"
                  [size]="15"
                />
                <span class="min-w-0 flex-1 truncate font-semibold"
                  >{{ s.kind === 'tag' ? '#' : '@' }}{{ s.label }}</span
                >
                @if (s.detail) {
                  <span class="flex-none truncate text-micro text-fg-subtle">{{ s.detail }}</span>
                }
              </li>
            }
          </ul>
        }
      </div>

      <div class="flex items-center gap-0.5 px-1.5 pb-1.5">
        <div
          class="flex items-center gap-0.5"
          role="toolbar"
          [attr.aria-label]="'chat.composer.toolbar' | transloco"
        >
          @for (tool of tools; track tool.key) {
            <button
              type="button"
              class="hidden h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50 @lg:flex"
              [attr.aria-label]="'chat.composer.format.' + tool.key | transloco"
              [title]="'chat.composer.format.' + tool.key | transloco"
              [disabled]="disabled()"
              (click)="format(tool.key)"
            >
              <span class="font-mono text-meta font-bold" aria-hidden="true">{{ tool.glyph }}</span>
            </button>
          }
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
            [attr.aria-label]="'chat.composer.attach' | transloco"
            [title]="'chat.composer.attach' | transloco"
            [disabled]="disabled() || !!editing()"
            data-testid="chat-attach"
            (click)="fileInput.click()"
          >
            <app-icon name="upload" [size]="17" />
          </button>
          <input
            #fileInput
            type="file"
            multiple
            class="hidden"
            tabindex="-1"
            aria-hidden="true"
            (change)="onFiles($event)"
          />
          <button
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-lg px-2 text-meta font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
            [disabled]="disabled()"
            data-testid="chat-link-record"
            (click)="pickerOpen.set(true)"
          >
            <app-icon name="link" [size]="16" />
            <span class="hidden @md:inline">{{ 'chat.composer.linkRecord' | transloco }}</span>
            <span class="sr-only @md:hidden">{{ 'chat.composer.linkRecord' | transloco }}</span>
          </button>
          <span class="relative">
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
              [attr.aria-label]="'chat.composer.emoji' | transloco"
              [attr.aria-expanded]="emojiOpen()"
              [disabled]="disabled()"
              (click)="emojiOpen.set(!emojiOpen())"
            >
              <app-icon name="smile" [size]="17" />
            </button>
            @if (emojiOpen()) {
              <app-chat-emoji-picker
                class="absolute bottom-full left-0 z-30 mb-1"
                (picked)="insertEmoji($event)"
                (closed)="closeEmoji()"
              />
            }
          </span>
        </div>
        <span class="flex-1"></span>
        @if (editing()) {
          <button
            type="button"
            class="h-9 rounded-lg px-3 text-meta font-semibold text-fg-muted hover:bg-surface-2"
            (click)="cancelEdit()"
          >
            {{ 'chat.composer.cancelEdit' | transloco }}
          </button>
        }
        <button
          type="button"
          class="flex h-9 min-w-9 flex-none items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-meta font-semibold text-white hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          [disabled]="!canSend()"
          [attr.aria-label]="(editing() ? 'chat.composer.save' : 'chat.composer.send') | transloco"
          data-testid="chat-send"
          (click)="submit()"
        >
          <app-icon [name]="editing() ? 'check' : 'send'" [size]="16" />
          <span class="hidden @xs:inline">{{
            (editing() ? 'chat.composer.save' : 'chat.composer.send') | transloco
          }}</span>
        </button>
      </div>
      @if (dragging()) {
        <div
          class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-card bg-accent-soft/90 text-ui font-semibold text-accent"
        >
          {{ 'chat.composer.dropHint' | transloco }}
        </div>
      }
    </div>

    @if (errorKey(); as key) {
      <p class="mt-1.5 px-1 text-meta text-fail-ink" role="alert" data-testid="chat-composer-error">
        {{ key | transloco: errorParams() }}
      </p>
    }
    @if (warning(); as w) {
      <div
        class="mt-1.5 flex flex-wrap items-center gap-2 rounded-tile bg-warn-soft px-3 py-2 text-meta text-warn-ink"
        role="status"
      >
        <span class="flex-1">{{
          'chat.composer.warnings.mentionNotMember' | transloco: { names: w.names }
        }}</span>
        @if (c?.can_manage || c?.kind === 'group') {
          <button type="button" class="font-semibold underline" (click)="addWarned()">
            {{ 'chat.composer.warnings.addThem' | transloco }}
          </button>
        }
        <button type="button" class="text-fg-muted underline" (click)="warning.set(null)">
          {{ 'chat.composer.warnings.dismiss' | transloco }}
        </button>
      </div>
    }

    <app-chat-record-link-picker
      [open]="pickerOpen()"
      (picked)="addRecord($event)"
      (closed)="pickerOpen.set(false)"
    />
    <app-prompt-dialog
      [open]="linkPromptOpen()"
      [title]="'chat.composer.linkPrompt.title' | transloco"
      [label]="'chat.composer.linkPrompt.label' | transloco"
      placeholder="https://"
      [confirmLabel]="'chat.composer.linkPrompt.confirm' | transloco"
      [cancelLabel]="'chat.composer.linkPrompt.cancel' | transloco"
      [required]="true"
      [maxLength]="2000"
      (confirmed)="applyLink($event)"
      (cancelled)="linkPromptOpen.set(false)"
    />
  `,
})
export class Composer {
  private readonly store = inject(ChatStore);
  private readonly api = inject(ChatApi);
  private readonly attachmentsApi = inject(AttachmentsApi);
  private readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);

  readonly conversation = input.required<ConversationSummary>();
  /** Thread root when this composer replies in a thread. */
  readonly parentId = input<string | null>(null);
  /** My newest editable message (↑ in an empty composer edits it). */
  readonly lastOwn = input<ChatMessage | null>(null);
  /** Display name for the textarea label ("Melding til #hms"). */
  readonly label = input('');

  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');

  protected readonly textareaId = `chat-composer-${++nextId}`;
  protected readonly listboxId = `${this.textareaId}-list`;
  protected readonly hintId = `${this.textareaId}-hint`;

  protected readonly text = signal('');
  protected readonly mentions = signal<readonly ChosenMention[]>([]);
  protected readonly records = signal<readonly EntityLinkRef[]>([]);
  protected readonly uploads = signal<readonly Upload[]>([]);
  protected readonly editing = signal<ChatMessage | null>(null);
  protected readonly suggest = signal<SuggestState | null>(null);
  protected readonly suggestions = signal<readonly Suggestion[]>([]);
  protected readonly activeIndex = signal(0);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly errorParams = signal<Record<string, unknown>>({});
  protected readonly warning = signal<{ names: string; userIds: string[] } | null>(null);
  protected readonly pickerOpen = signal(false);
  protected readonly emojiOpen = signal(false);
  protected readonly linkPromptOpen = signal(false);
  protected readonly dragging = signal(false);
  private sending = false;
  private selection = { start: 0, end: 0 };
  private readonly uploadSubs = new Map<string, Subscription>();
  private readonly query$ = new Subject<SuggestState | null>();

  protected readonly tools = [
    { key: 'bold', glyph: 'B' },
    { key: 'italic', glyph: 'I' },
    { key: 'code', glyph: '</>' },
    { key: 'list', glyph: '•' },
    { key: 'link', glyph: '↗' },
  ] as const;

  protected readonly disabled = computed(() => {
    const c = this.conversation();
    return !c.can_post || !!c.archived_at;
  });

  protected readonly suggestOpen = computed(
    () => this.suggest() !== null && this.suggestions().length > 0,
  );
  protected readonly activeSuggestion = computed(
    () => this.suggestions()[this.activeIndex()] ?? null,
  );

  protected readonly canSend = computed(() => {
    if (this.disabled()) {
      return false;
    }
    const ups = this.uploads();
    if (ups.some((u) => u.state === 'uploading')) {
      return false;
    }
    const ready = ups.some((u) => u.state === 'ready' || u.state === 'scanning');
    return !!this.text().trim() || this.records().length > 0 || ready;
  });

  constructor() {
    const sub = this.query$
      .pipe(
        debounceTime(120),
        switchMap((state) => {
          const orgId = this.store.orgId();
          if (!state || !orgId) {
            return of([] as Suggestion[]);
          }
          if (state.mode === 'tag') {
            return this.api.tags(orgId, state.query.toLowerCase(), 8).pipe(
              map((res) =>
                res.items.map(
                  (t): Suggestion => ({
                    key: `tag:${t.name}`,
                    kind: 'tag',
                    id: t.name,
                    label: t.display || t.name,
                    detail: '',
                  }),
                ),
              ),
              catchError(() => of([] as Suggestion[])),
            );
          }
          if (!state.query.trim()) {
            return of([] as Suggestion[]);
          }
          const me = this.store.meId();
          return this.api.directory(orgId, state.query.trim(), 8).pipe(
            map((res) =>
              res.items
                .filter((e) => e.id !== me)
                .map(
                  (e): Suggestion => ({
                    key: `${e.type}:${e.id}`,
                    kind: e.type,
                    id: e.id,
                    label: e.name,
                    detail:
                      e.type === 'team' && /^\d+$/.test(e.detail)
                        ? this.language.translate('chat.composer.suggest.teamDetail', {
                            count: e.detail,
                          })
                        : e.detail,
                  }),
                ),
            ),
            catchError(() => of([] as Suggestion[])),
          );
        }),
      )
      .subscribe((items) => {
        this.suggestions.set(this.suggest() ? items : []);
        this.activeIndex.set(0);
      });
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      for (const s of this.uploadSubs.values()) {
        s.unsubscribe();
      }
      for (const up of this.uploads()) {
        this.revoke(up);
      }
    });
  }

  /** Focus the textarea (after opening a conversation or a thread). */
  focus(): void {
    this.textarea()?.nativeElement.focus();
  }

  /** Put a message into the composer for editing. */
  startEdit(message: ChatMessage): void {
    const draft = decodeBody(message.body);
    this.editing.set(message);
    this.mentions.set(draft.mentions);
    this.records.set(draft.records);
    this.setText(draft.text, draft.text.length);
    this.errorKey.set(null);
    this.focus();
  }

  protected cancelEdit(): void {
    this.editing.set(null);
    this.clear();
  }

  // --- input & autocomplete ---

  protected onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.text.set(el.value);
    this.autoGrow(el);
    this.errorKey.set(null);
    this.refreshSuggest();
    if (el.value.trim() && !this.editing()) {
      this.store.notifyTyping(this.conversation().id, this.parentId());
    }
  }

  protected refreshSuggest(): void {
    const el = this.textarea()?.nativeElement;
    if (!el) {
      return;
    }
    const caret = el.selectionStart ?? el.value.length;
    const mention = activeMention(el.value, caret);
    const tag = mention ? null : activeTag(el.value, caret);
    const state: SuggestState | null = mention
      ? { mode: 'mention', start: mention.start, query: mention.query }
      : tag
        ? { mode: 'tag', start: tag.start, query: tag.query }
        : null;
    this.suggest.set(state);
    if (!state) {
      this.suggestions.set([]);
    }
    this.query$.next(state);
  }

  protected onBlur(): void {
    const el = this.textarea()?.nativeElement;
    if (el) {
      this.selection = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
    }
    // Let a click on an option land first (options use mousedown).
    setTimeout(() => {
      if (this.document.activeElement !== el) {
        this.suggest.set(null);
        this.suggestions.set([]);
      }
    }, 150);
  }

  protected optionId(index: number): string {
    return `${this.listboxId}-${index}`;
  }

  protected choose(s: Suggestion): void {
    const state = this.suggest();
    const el = this.textarea()?.nativeElement;
    if (!state || !el) {
      return;
    }
    const caret = el.selectionStart ?? el.value.length;
    if (s.kind === 'tag') {
      const next = insertTag(el.value, state.start, caret, s.id);
      this.setText(next.text, next.caret);
    } else {
      const next = insertMention(
        el.value,
        { start: state.start, query: state.query },
        caret,
        s.label,
      );
      this.mentions.update((list) => [
        ...list.filter((m) => m.id !== s.id),
        { type: s.kind as 'user' | 'team', id: s.id, name: s.label },
      ]);
      this.setText(next.text, next.caret);
    }
    this.suggest.set(null);
    this.suggestions.set([]);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.suggestOpen()) {
      const count = this.suggestions().length;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        this.activeIndex.set((this.activeIndex() + delta + count) % count);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        const s = this.activeSuggestion();
        if (s) {
          event.preventDefault();
          this.choose(s);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.suggest.set(null);
        this.suggestions.set([]);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.submit();
      return;
    }
    if (event.key === 'Escape' && this.editing()) {
      event.preventDefault();
      event.stopPropagation();
      this.cancelEdit();
      return;
    }
    if (event.key === 'ArrowUp' && !this.text() && !this.editing() && !this.uploads().length) {
      const last = this.lastOwn();
      if (last) {
        event.preventDefault();
        this.startEdit(last);
      }
    }
  }

  // --- formatting, emoji, links ---

  protected format(key: 'bold' | 'italic' | 'code' | 'list' | 'link'): void {
    const el = this.textarea()?.nativeElement;
    if (!el) {
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    if (key === 'link') {
      this.selection = { start, end };
      this.linkPromptOpen.set(true);
      return;
    }
    const result =
      key === 'list'
        ? prefixLines(el.value, start, end, '- ')
        : wrapSelection(el.value, start, end, key === 'bold' ? '**' : key === 'italic' ? '*' : '`');
    this.setText(result.text, result.start, result.end);
  }

  protected applyLink(url: string): void {
    this.linkPromptOpen.set(false);
    const clean = url.trim();
    if (!/^(https?:\/\/|mailto:)/i.test(clean)) {
      return;
    }
    const { start, end } = this.selection;
    const result = insertLink(this.text(), start, end, clean);
    this.setText(result.text, result.start, result.end);
  }

  protected insertEmoji(emoji: string): void {
    const el = this.textarea()?.nativeElement;
    const value = this.text();
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    this.emojiOpen.set(false);
    this.setText(value.slice(0, start) + emoji + value.slice(end), start + emoji.length);
  }

  protected closeEmoji(): void {
    this.emojiOpen.set(false);
    this.focus();
  }

  protected addRecord(ref: EntityLinkRef): void {
    this.pickerOpen.set(false);
    const next = uniqueRefs([...this.records(), ref]);
    if (next.length > CHAT_LIMITS.links) {
      this.showError('chat.composer.tooManyLinks', { max: CHAT_LIMITS.links });
      return;
    }
    this.records.set(next);
    this.focus();
  }

  protected removeRecord(ref: EntityLinkRef): void {
    this.records.update((list) => list.filter((r) => r.entity_id !== ref.entity_id));
  }

  // --- files ---

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    if (this.disabled() || this.editing() || !event.dataTransfer?.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    this.dragging.set(false);
    if (this.disabled() || this.editing() || !event.dataTransfer?.files.length) {
      return;
    }
    event.preventDefault();
    this.addFiles(Array.from(event.dataTransfer.files));
  }

  protected onPaste(event: ClipboardEvent): void {
    const data = event.clipboardData;
    if (!data) {
      return;
    }
    const files = Array.from(data.files ?? []);
    if (files.length && !this.editing()) {
      event.preventDefault();
      this.addFiles(files);
      return;
    }
    const pasted = data.getData('text/plain').trim();
    const ref = this.recordFromUrl(pasted);
    if (!ref) {
      return;
    }
    // A record URL of this portal: link it as a card when it resolves for me.
    event.preventDefault();
    const el = this.textarea()?.nativeElement;
    const start = el?.selectionStart ?? this.text().length;
    const end = el?.selectionEnd ?? start;
    this.store.fetchPreviews([ref]).subscribe((items) => {
      const preview = items.find((p) => p.entity_id === ref.entity_id);
      if (preview?.visible) {
        this.addRecord({ entity_type: preview.entity_type, entity_id: preview.entity_id });
      } else {
        const value = this.text();
        this.setText(value.slice(0, start) + pasted + value.slice(end), start + pasted.length);
      }
    });
  }

  /** `https://<this host>/<module>/<uuid>` → a guessed record ref (verified by the preview). */
  private recordFromUrl(text: string): EntityLinkRef | null {
    if (!/^https?:\/\/\S+$/i.test(text)) {
      return null;
    }
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (url.origin !== this.document.location?.origin) {
      return null;
    }
    const link = internalLink(url.pathname + url.search);
    const match = link ? UUID_IN_PATH.exec(link.path) : null;
    if (!match) {
      return null;
    }
    const segment = match[1].toLowerCase();
    const type = segment.replace(/-/g, '_').replace(/ies$/, 'y').replace(/s$/, '');
    return { entity_type: type, entity_id: match[2].toLowerCase() };
  }

  private addFiles(files: File[]): void {
    const conversation = this.conversation();
    const orgId = this.store.orgId();
    if (!orgId || !files.length || this.disabled()) {
      return;
    }
    const room = CHAT_LIMITS.attachments - this.uploads().length;
    if (files.length > room) {
      this.showError('chat.composer.tooManyFiles', { max: CHAT_LIMITS.attachments });
    }
    for (const file of files.slice(0, Math.max(0, room))) {
      const key = `up-${++nextId}`;
      const problem = preCheckFile(file);
      const isImage = /^image\/(png|jpeg|gif|webp)$/.test(file.type);
      const previewUrl = isImage && !problem ? this.objectUrl(file) : null;
      const upload: Upload = {
        key,
        file,
        previewUrl,
        loaded: 0,
        state: problem ? 'failed' : 'uploading',
        attachment: null,
        errorKey: problem,
      };
      this.uploads.update((list) => [...list, upload]);
      if (problem) {
        continue;
      }
      const sub = this.attachmentsApi
        .upload(orgId, CHAT_ATTACHMENT_ENTITY, conversation.id, file)
        .subscribe({
          next: (e) => {
            if (e.kind === 'progress') {
              this.patchUpload(key, { loaded: e.loaded });
            } else if (e.kind === 'completing') {
              this.patchUpload(key, { state: 'scanning', loaded: file.size });
            } else if (e.kind === 'done') {
              const quarantined = e.attachment.status === 'quarantined';
              this.patchUpload(key, {
                attachment: e.attachment,
                state: quarantined ? 'failed' : 'ready',
                errorKey: quarantined ? 'attachments.errors.quarantined' : null,
              });
            }
          },
          error: (error: unknown) => {
            const key2 =
              error instanceof AttachmentUploadError
                ? uploadErrorKey(error.phase, error.status, error.code)
                : 'attachments.errors.generic';
            this.patchUpload(key, { state: 'failed', errorKey: key2 });
          },
        });
      this.uploadSubs.set(key, sub);
    }
  }

  private patchUpload(key: string, patch: Partial<Upload>): void {
    this.uploads.update((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }

  protected removeUpload(up: Upload): void {
    this.uploadSubs.get(up.key)?.unsubscribe();
    this.uploadSubs.delete(up.key);
    this.revoke(up);
    this.uploads.update((list) => list.filter((u) => u.key !== up.key));
    // A completed but unsent file stays unlinked; the server purges orphans.
  }

  protected percent(up: Upload): number {
    return up.file.size ? Math.min(100, Math.round((up.loaded / up.file.size) * 100)) : 0;
  }

  private objectUrl(file: File): string | null {
    try {
      return URL.createObjectURL(file);
    } catch {
      return null;
    }
  }

  private revoke(up: Upload): void {
    if (up.previewUrl) {
      try {
        URL.revokeObjectURL(up.previewUrl);
      } catch {
        // Ignore.
      }
    }
  }

  // --- send / save ---

  protected submit(): void {
    if (!this.canSend() || this.sending) {
      return;
    }
    const body = encodeBody({
      text: this.text(),
      mentions: this.mentions(),
      records: this.records(),
    });
    if (body.length > CHAT_LIMITS.body) {
      this.showError('chat.composer.tooLong', { count: body.length, max: CHAT_LIMITS.body });
      return;
    }
    const editing = this.editing();
    const mentionNames = new Map(this.mentions().map((m) => [m.id, m.name]));
    if (editing) {
      this.sending = true;
      this.store.edit(editing, body).subscribe({
        next: (res) => {
          this.sending = false;
          this.editing.set(null);
          this.clear();
          this.handleWarnings(res.warnings, mentionNames);
        },
        error: (error: unknown) => {
          this.sending = false;
          this.showError(errorKeyFor(error));
        },
      });
      return;
    }
    const ready = this.uploads().filter(
      (u) => u.attachment && (u.state === 'ready' || u.state === 'scanning'),
    );
    const attachments: OutgoingAttachment[] = ready.map((u) => ({
      ref: {
        id: u.attachment!.id,
        filename: u.attachment!.filename,
        content_type: u.attachment!.content_type,
        size_bytes: u.attachment!.size_bytes,
        status: u.attachment!.status,
        is_image: /^image\/(png|jpeg|gif|webp)$/.test(u.attachment!.content_type),
      },
      previewUrl: u.previewUrl,
    }));
    if (!body && !attachments.length) {
      return;
    }
    const conversationId = this.conversation().id;
    // Previews stay alive while the optimistic message shows them.
    for (const u of this.uploads()) {
      this.uploadSubs.get(u.key)?.unsubscribe();
    }
    this.uploadSubs.clear();
    this.uploads.set([]);
    this.clear();
    this.store.send(conversationId, body, { parentId: this.parentId(), attachments }).subscribe({
      next: (res) => this.handleWarnings(res.warnings, mentionNames),
      error: (error: unknown) => this.showError(errorKeyFor(error)),
    });
    this.focus();
  }

  private handleWarnings(warnings: readonly MessageWarning[], names: Map<string, string>): void {
    const missing = warnings.filter((w) => w.code === 'mention_not_member' && w.user_id);
    if (!missing.length) {
      return;
    }
    const userIds = missing.map((w) => w.user_id!);
    this.warning.set({
      userIds,
      names: userIds
        .map((id) => names.get(id) ?? this.language.translate('chat.names.unknownUser'))
        .join(', '),
    });
  }

  protected addWarned(): void {
    const warning = this.warning();
    const orgId = this.store.orgId();
    if (!warning || !orgId) {
      return;
    }
    this.api.addMembers(orgId, this.conversation().id, warning.userIds).subscribe({
      next: (c) => {
        this.store.putConversation(c);
        this.warning.set(null);
      },
      error: (error: unknown) => {
        this.warning.set(null);
        const code = chatErrorCode(error);
        this.showError(
          code === 'member_no_record_access'
            ? 'chat.members.errors.member_no_record_access'
            : 'chat.members.errors.generic',
        );
      },
    });
  }

  private showError(key: string, params: Record<string, unknown> = {}): void {
    this.errorKey.set(key);
    this.errorParams.set(params);
  }

  private clear(): void {
    this.mentions.set([]);
    this.records.set([]);
    this.setText('', 0);
    this.suggest.set(null);
    this.suggestions.set([]);
  }

  private setText(value: string, caret: number, end = caret): void {
    this.text.set(value);
    const el = this.textarea()?.nativeElement;
    if (el) {
      el.value = value;
      this.autoGrow(el);
      el.focus();
      el.setSelectionRange(caret, end);
    }
  }

  private autoGrow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }
}

const KNOWN_SEND_ERRORS = new Set([
  'conversation_archived',
  'conversation_read_only',
  'body_too_long',
  'empty_message',
  'too_many_links',
  'entity_link_no_access',
  'unsupported_entity_type',
  'invalid_mentions',
  'invalid_attachments',
  'rate_limited',
  'network',
]);

function errorKeyFor(error: unknown): string {
  const code = chatErrorCode(error);
  return code && KNOWN_SEND_ERRORS.has(code)
    ? `chat.composer.errors.${code}`
    : 'chat.composer.errors.generic';
}
