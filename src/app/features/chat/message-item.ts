import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  untracked,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AttachmentsApi } from '../../core/attachments/attachments-api';
import { ChatStore, chatErrorCode } from '../../core/chat/chat-store';
import { dateTimeLabel, fileSize, timeLabel } from '../../core/chat/chat-format';
import { provideChatScope } from '../../core/chat/chat-scope';
import { AttachmentRef, ChatMessage, ConversationSummary } from '../../core/chat/chat.models';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { RelativeTimePipe } from '../../shared/relative-time/relative-time';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { MessageBody } from './message-body';
import { ReactionBar } from './reaction-bar';

/**
 * One message (docs/chat-design.md §4.4): sender and time on the first of a
 * run, the body, files (inline images, file chips, "Sjekkes …"/"Blokkert"),
 * reactions, the thread link, "(redigert)", tombstones, and actions that
 * show on hover *and* keyboard focus (always on touch screens).
 */
@Component({
  selector: 'app-chat-message-item',
  imports: [
    TranslocoPipe,
    RelativeTimePipe,
    Avatar,
    ConfirmDialog,
    Icon,
    MenuItem,
    OverflowMenu,
    MessageBody,
    ReactionBar,
  ],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let m = message();
    @if (m.kind === 'system') {
      <p class="px-4 py-1.5 text-center text-meta text-fg-subtle" data-testid="chat-system-line">
        {{ 'chat.messages.system.' + m.system?.event | transloco: systemParams() }}
      </p>
    } @else {
      <article
        class="group relative flex gap-3 px-4 transition-colors motion-reduce:transition-none"
        [class]="
          (head() ? 'pt-2.5 pb-1 ' : 'py-0.5 ') +
          (highlighted() ? 'bg-warn-soft' : 'hover:bg-surface-2 focus-within:bg-surface-2')
        "
        [attr.aria-label]="
          'chat.messages.articleLabel' | transloco: { name: senderName(), time: time() }
        "
        [attr.data-message-id]="m.id"
        data-testid="chat-message"
        style="contain-intrinsic-size: auto 56px"
        [style.content-visibility]="reactions()?.pickerOpen() ? 'visible' : 'auto'"
      >
        <div class="w-9 flex-none">
          @if (head()) {
            <app-avatar [name]="senderName()" size="md" [gradient]="false" />
          } @else {
            <span
              class="block pt-1 text-right text-micro text-fg-subtle opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              aria-hidden="true"
              >{{ time() }}</span
            >
          }
        </div>
        <div class="min-w-0 flex-1">
          @if (head()) {
            <div class="flex items-baseline gap-2">
              <span class="truncate text-ui font-semibold text-fg">{{ senderName() }}</span>
              <time
                class="flex-none text-micro text-fg-subtle"
                [attr.datetime]="m.created_at"
                [title]="fullTime()"
                >{{ time() }}</time
              >
            </div>
          }

          @if (m.deleted_at) {
            <p class="text-ui text-fg-subtle italic" data-testid="chat-tombstone">
              {{ 'chat.messages.deleted' | transloco }}
            </p>
          } @else {
            <div [class.opacity-60]="m.localState === 'pending'">
              @if (m.body) {
                <app-chat-message-body [body]="m.body" [meId]="meId()" />
              }
              @if (m.edited_at) {
                <span class="text-micro text-fg-subtle">{{
                  'chat.messages.edited' | transloco
                }}</span>
              }
            </div>

            @if (m.attachments.length) {
              <div class="mt-1.5 flex flex-wrap gap-2">
                @for (a of m.attachments; track a.id; let i = $index) {
                  @if (a.is_image && a.status !== 'quarantined' && a.status !== 'deleted') {
                    @let src = m.localPreviews?.[i] ?? imageUrls()[a.id];
                    <button
                      type="button"
                      class="relative overflow-hidden rounded-tile border border-border bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      [attr.aria-label]="'chat.attachments.image' | transloco: { name: a.filename }"
                      (click)="openFile(a)"
                    >
                      @if (src) {
                        <img
                          [src]="src"
                          [alt]="a.filename"
                          class="block max-h-[240px] max-w-[min(360px,70vw)] object-contain"
                          loading="lazy"
                        />
                      } @else {
                        <span
                          class="flex h-[120px] w-[180px] items-center justify-center text-fg-subtle"
                        >
                          <app-icon name="upload" [size]="20" />
                        </span>
                      }
                      @if (a.status === 'scanning' || a.status === 'pending') {
                        <span
                          class="absolute bottom-1 left-1 rounded bg-surface/90 px-1.5 text-micro font-semibold text-fg-muted"
                          >{{ 'chat.attachments.scanning' | transloco }}</span
                        >
                      }
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="flex max-w-[320px] min-w-0 items-center gap-2.5 rounded-tile border border-border bg-surface px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none enabled:hover:bg-surface-2 disabled:cursor-not-allowed"
                      [disabled]="a.status !== 'available'"
                      [attr.aria-label]="'chat.attachments.open' | transloco: { name: a.filename }"
                      [title]="
                        a.status === 'quarantined'
                          ? ('chat.attachments.blockedHint' | transloco)
                          : a.filename
                      "
                      (click)="openFile(a)"
                    >
                      <app-icon
                        [name]="a.status === 'quarantined' ? 'alert' : 'documents'"
                        [size]="18"
                      />
                      <span class="flex min-w-0 flex-col">
                        <span class="truncate text-ui font-semibold text-fg">{{ a.filename }}</span>
                        <span class="text-micro text-fg-subtle">
                          @switch (a.status) {
                            @case ('quarantined') {
                              <span class="font-semibold text-fail-ink">{{
                                'chat.attachments.blocked' | transloco
                              }}</span>
                            }
                            @case ('deleted') {
                              {{ 'chat.attachments.removed' | transloco }}
                            }
                            @case ('available') {
                              {{ size(a) }}
                            }
                            @default {
                              {{ 'chat.attachments.scanning' | transloco }}
                            }
                          }
                        </span>
                      </span>
                    </button>
                  }
                }
              </div>
            }

            @if (m.localState === 'failed') {
              <p
                class="mt-1 flex flex-wrap items-center gap-2 text-meta text-fail-ink"
                role="alert"
              >
                <app-icon name="alert" [size]="14" />
                {{ 'chat.messages.failed' | transloco }}
                <button type="button" class="font-semibold underline" (click)="retry()">
                  {{ 'chat.messages.retry' | transloco }}
                </button>
                <button type="button" class="text-fg-muted underline" (click)="store.discard(m)">
                  {{ 'chat.messages.discard' | transloco }}
                </button>
              </p>
            } @else if (m.localState === 'pending') {
              <p class="sr-only">{{ 'chat.messages.sending' | transloco }}</p>
            }

            <app-chat-reaction-bar
              class="mt-1 empty:hidden"
              [message]="m"
              [meId]="meId()"
              [canReact]="canAct()"
            />

            @if (!inThread() && m.reply_count > 0) {
              <button
                type="button"
                class="mt-1 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-meta font-semibold text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                data-testid="chat-thread-link"
                (click)="openThread.emit(m.id)"
              >
                <app-icon name="comment" [size]="14" />
                {{
                  (m.reply_count === 1 ? 'chat.messages.reply' : 'chat.messages.replies')
                    | transloco: { count: m.reply_count }
                }}
                @if (m.last_reply_at) {
                  <span class="font-normal text-fg-subtle">
                    ·
                    {{
                      'chat.messages.lastReply'
                        | transloco: { when: (m.last_reply_at | relativeTime: language.active()) }
                    }}
                  </span>
                }
              </button>
            }
          }
        </div>

        @if (!m.deleted_at && !m.localState) {
          <div
            class="absolute -top-3 right-3 flex items-center gap-0.5 rounded-tile border border-border bg-surface p-0.5 opacity-0 shadow-card group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            data-testid="chat-message-actions"
          >
            @if (canAct()) {
              <button
                type="button"
                class="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="'chat.messages.actions.react' | transloco"
                (click)="reactions()?.openPicker()"
              >
                <app-icon name="smile" [size]="16" />
              </button>
              @if (!inThread()) {
                <button
                  type="button"
                  class="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  [attr.aria-label]="'chat.messages.actions.reply' | transloco"
                  data-testid="chat-reply"
                  (click)="openThread.emit(m.id)"
                >
                  <app-icon name="comment" [size]="16" />
                </button>
              }
            }
            <app-overflow-menu
              variant="ghost"
              [iconOnly]="true"
              labelKey="chat.messages.actions.more"
              triggerTestId="chat-message-more"
            >
              <button appMenuItem type="button" (click)="copyLink()">
                <app-icon name="link" [size]="15" />
                {{ 'chat.messages.actions.copyLink' | transloco }}
              </button>
              @if (canEdit()) {
                <button appMenuItem type="button" data-testid="chat-edit" (click)="edit.emit(m)">
                  <app-icon name="pencil" [size]="15" />
                  {{ 'chat.messages.actions.edit' | transloco }}
                </button>
              }
              @if (canDelete()) {
                <button
                  appMenuItem
                  type="button"
                  [danger]="true"
                  data-testid="chat-delete"
                  (click)="confirmDelete.set(true)"
                >
                  <app-icon name="trash" [size]="15" />
                  {{ 'chat.messages.actions.delete' | transloco }}
                </button>
              }
            </app-overflow-menu>
          </div>
        }
      </article>

      <app-confirm-dialog
        [open]="confirmDelete()"
        [title]="'chat.messages.deleteConfirm.title' | transloco"
        [message]="'chat.messages.deleteConfirm.body' | transloco"
        [confirmLabel]="'chat.messages.deleteConfirm.confirm' | transloco"
        [cancelLabel]="'chat.messages.deleteConfirm.cancel' | transloco"
        [busy]="deleting()"
        (confirmed)="remove()"
        (cancelled)="confirmDelete.set(false)"
      />
    }
  `,
})
export class MessageItem {
  protected readonly store = inject(ChatStore);
  protected readonly language = inject(LanguageService);
  private readonly attachments = inject(AttachmentsApi);
  private readonly notifications = inject(NotificationService);
  private readonly document = inject(DOCUMENT);

  readonly message = input.required<ChatMessage>();
  readonly conversation = input<ConversationSummary | null>(null);
  readonly head = input(true);
  readonly meId = input<string | null>(null);
  readonly inThread = input(false);
  readonly highlighted = input(false);

  readonly openThread = output<string>();
  readonly edit = output<ChatMessage>();

  protected readonly reactions = viewChild(ReactionBar);
  protected readonly confirmDelete = signal(false);
  protected readonly deleting = signal(false);
  protected readonly imageUrls = signal<Readonly<Record<string, string>>>({});
  private requestedImages = new Set<string>();

  protected readonly senderName = computed(
    () => this.message().sender?.name ?? this.language.translate('chat.names.unknownUser'),
  );
  protected readonly time = computed(() =>
    timeLabel(this.message().created_at, this.language.locale()),
  );
  protected readonly fullTime = computed(() =>
    dateTimeLabel(this.message().created_at, this.language.locale()),
  );

  private readonly mine = computed(
    () => !!this.meId() && this.message().sender?.id === this.meId(),
  );
  protected readonly canAct = computed(() => {
    const c = this.conversation();
    return !c || (c.can_post && !c.archived_at);
  });
  protected readonly canEdit = computed(
    () => this.mine() && this.canAct() && this.message().kind === 'user',
  );
  protected readonly canDelete = computed(() => {
    if (this.mine()) {
      return true;
    }
    const c = this.conversation();
    if (this.store.isChatAdmin()) {
      return true;
    }
    return !!c && c.kind !== 'dm' && c.can_manage;
  });

  protected readonly systemParams = computed(() => {
    const system = this.message().system;
    const someone = this.language.translate('chat.messages.system.someone');
    return {
      actor: system?.params.actor?.name ?? someone,
      users: (system?.params.users ?? []).map((u) => u.name).join(', '),
      name: system?.params.name ?? '',
    };
  });

  constructor() {
    // Inline images: fetch a short-lived download URL once per image.
    effect(() => {
      const message = this.message();
      untracked(() => this.loadImages(message));
    });
  }

  private loadImages(message: ChatMessage): void {
    const orgId = this.store.orgId();
    if (!orgId || message.localState || message.deleted_at) {
      return;
    }
    for (const a of message.attachments) {
      if (a.is_image && a.status === 'available' && !this.requestedImages.has(a.id)) {
        this.requestedImages.add(a.id);
        this.attachments.download(orgId, a.id).subscribe({
          next: (d) => this.imageUrls.update((urls) => ({ ...urls, [a.id]: d.url })),
          error: () => this.requestedImages.delete(a.id),
        });
      }
    }
  }

  protected size(a: AttachmentRef): string {
    return fileSize(a.size_bytes, this.language.locale());
  }

  protected openFile(a: AttachmentRef): void {
    const orgId = this.store.orgId();
    if (!orgId || a.status !== 'available') {
      return;
    }
    // Open the tab synchronously (popup blockers), then point it at the fresh URL.
    const win = this.document.defaultView?.open('', '_blank');
    this.attachments.download(orgId, a.id).subscribe({
      next: (d) => {
        if (win) {
          win.opener = null;
          win.location.href = d.url;
        }
      },
      error: () => {
        win?.close();
        this.notifications.error('chat.attachments.downloadError');
      },
    });
  }

  protected retry(): void {
    this.store.retry(this.message()).subscribe({ error: () => undefined });
  }

  protected copyLink(): void {
    const m = this.message();
    const origin = this.document.location?.origin ?? '';
    const url = `${origin}/chat/${m.conversation_id}?m=${m.id}`;
    const clipboard = this.document.defaultView?.navigator?.clipboard;
    if (clipboard) {
      clipboard.writeText(url).then(
        () => this.notifications.success('chat.messages.linkCopied'),
        () => undefined,
      );
    }
  }

  protected remove(): void {
    this.deleting.set(true);
    this.store.delete(this.message()).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmDelete.set(false);
      },
      error: (e: unknown) => {
        this.deleting.set(false);
        this.confirmDelete.set(false);
        void chatErrorCode(e);
        this.notifications.error('chat.messages.deleteErrors.generic');
      },
    });
  }
}
