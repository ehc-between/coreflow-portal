import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatApi } from '../../core/chat/chat-api';
import { ChatDisplay } from '../../core/chat/chat-display';
import { ChatStore } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import { ConversationSummary, NotifyLevel } from '../../core/chat/chat.models';
import { NotificationService } from '../../core/notifications/notification.service';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Icon } from '../../shared/ui/icon/icon';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { MemberPanel } from './member-panel';
import { PresenceDot } from './presence-dot';
import { RecordCard } from './record-card';

/**
 * Conversation header (docs/chat-design.md §4.4): name, topic or the record
 * it is about, member count and presence, the members panel, notification
 * level, rename / topic, leave and archive. Presence is text in the label
 * too, never colour alone.
 */
@Component({
  selector: 'app-chat-conversation-header',
  imports: [
    RouterLink,
    TranslocoPipe,
    Avatar,
    Icon,
    MenuItem,
    OverflowMenu,
    PromptDialog,
    MemberPanel,
    PresenceDot,
    RecordCard,
  ],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-b border-border bg-surface' },
  template: `
    @let c = conversation();
    <div class="flex min-h-[58px] items-center gap-2 px-2 py-2 sm:px-4">
      @if (showBack()) {
        <button
          type="button"
          class="flex h-10 w-10 flex-none items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [attr.aria-label]="'chat.header.back' | transloco"
          data-testid="chat-back"
          (click)="back.emit()"
        >
          <app-icon name="back" [size]="18" />
        </button>
      }
      <span class="relative flex-none">
        @if (c.kind === 'dm') {
          <app-avatar [name]="name()" size="md" [gradient]="false" />
          <app-chat-presence-dot class="absolute -right-0.5 -bottom-0.5" [status]="presence()" />
        } @else {
          <span
            class="flex h-[34px] w-[34px] items-center justify-center rounded-tile bg-accent-soft font-bold text-accent"
            aria-hidden="true"
          >
            @if (c.kind === 'channel') {
              #
            } @else {
              <app-icon name="people" [size]="17" />
            }
          </span>
        }
      </span>
      <div class="min-w-0 flex-1">
        <h1
          class="truncate font-display text-card font-bold text-fg"
          data-testid="chat-conversation-name"
        >
          {{ name() }}
          @if (c.visibility === 'private' && c.kind === 'channel') {
            <app-icon
              class="ml-1 inline-block align-[-2px] text-fg-subtle"
              name="lock"
              [size]="13"
            />
            <span class="sr-only">{{ 'chat.header.private' | transloco }}</span>
          }
        </h1>
        <p class="truncate text-micro text-fg-subtle">
          @if (c.kind === 'dm') {
            {{ 'chat.presence.' + presence() | transloco }}
          } @else {
            {{ 'chat.header.members' | transloco: { count: c.member_count } }}
            @if (c.topic) {
              · {{ c.topic }}
            }
          }
        </p>
      </div>
      @if (compact()) {
        <a
          [routerLink]="['/chat', c.id]"
          class="flex-none rounded-lg px-2 py-1.5 text-meta font-semibold text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >{{ 'chat.discuss.openFull' | transloco }}</a
        >
      } @else {
        @if (c.kind !== 'dm') {
          <button
            type="button"
            class="flex h-10 flex-none items-center gap-1.5 rounded-tile px-2.5 text-meta font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.aria-label]="
              ('chat.header.membersButton' | transloco) +
              ', ' +
              ('chat.header.members' | transloco: { count: c.member_count })
            "
            data-testid="chat-members-button"
            (click)="membersOpen.set(true)"
          >
            <app-icon name="people" [size]="17" />
            <span>{{ c.member_count }}</span>
          </button>
        }
        <app-overflow-menu
          variant="ghost"
          [iconOnly]="true"
          labelKey="chat.header.more"
          triggerTestId="chat-conversation-more"
        >
          @if (c.me) {
            @for (level of levels; track level) {
              <button appMenuItem type="button" (click)="setNotify(level)">
                <app-icon [name]="c.me.notify_level === level ? 'check' : 'bell'" [size]="15" />
                {{ 'chat.header.notify.' + level | transloco }}
              </button>
            }
          }
          <button appMenuItem type="button" (click)="membersOpen.set(true)">
            <app-icon name="people" [size]="15" />
            {{ 'chat.members.title' | transloco }}
          </button>
          @if (c.can_manage && c.kind !== 'dm' && !c.archived_at) {
            @if (!c.department_id) {
              <button appMenuItem type="button" (click)="prompt.set('rename')">
                <app-icon name="pencil" [size]="15" />
                {{ 'chat.header.rename' | transloco }}
              </button>
            }
            <button appMenuItem type="button" (click)="prompt.set('topic')">
              <app-icon name="comment" [size]="15" />
              {{ 'chat.header.topic' | transloco }}
            </button>
          }
        </app-overflow-menu>
      }
    </div>
    @if (c.subject && !compact()) {
      <div class="px-4 pb-2.5">
        <app-chat-record-card [ref]="c.subject" />
      </div>
    }

    <app-chat-member-panel
      [conversation]="c"
      [open]="membersOpen()"
      (closed)="membersOpen.set(false)"
    />
    <app-prompt-dialog
      [open]="prompt() !== null"
      [title]="(prompt() === 'rename' ? 'chat.header.rename' : 'chat.header.topic') | transloco"
      [label]="
        (prompt() === 'rename' ? 'chat.header.renamePrompt' : 'chat.header.topicPrompt') | transloco
      "
      [confirmLabel]="'chat.composer.save' | transloco"
      [cancelLabel]="'chat.create.cancel' | transloco"
      [required]="prompt() === 'rename'"
      [maxLength]="prompt() === 'rename' ? 80 : 250"
      (confirmed)="applyPrompt($event)"
      (cancelled)="prompt.set(null)"
    />
  `,
})
export class ConversationHeader {
  private readonly store = inject(ChatStore);
  private readonly display = inject(ChatDisplay);
  private readonly api = inject(ChatApi);
  private readonly notifications = inject(NotificationService);

  readonly conversation = input.required<ConversationSummary>();
  readonly showBack = input(false);
  readonly compact = input(false);
  readonly back = output<void>();

  protected readonly levels: readonly NotifyLevel[] = ['all', 'mentions', 'none'];
  protected readonly membersOpen = signal(false);
  protected readonly prompt = signal<'rename' | 'topic' | null>(null);

  protected readonly name = computed(() => this.display.name(this.conversation()));
  protected readonly presence = computed(() =>
    this.store.presence(this.display.dmPartner(this.conversation())),
  );

  protected setNotify(level: NotifyLevel): void {
    this.store.setNotifyLevel(this.conversation().id, level).subscribe({
      error: () => this.notifications.error('chat.members.errors.generic'),
    });
  }

  protected applyPrompt(value: string): void {
    const which = this.prompt();
    const orgId = this.store.orgId();
    this.prompt.set(null);
    if (!orgId || !which) {
      return;
    }
    const body =
      which === 'rename'
        ? { name: value.trim().replace(/^#/, '') }
        : { topic: value.trim() || null };
    this.api.updateConversation(orgId, this.conversation().id, body).subscribe({
      next: (c) => this.store.putConversation(c),
      error: () => this.notifications.error('chat.members.errors.generic'),
    });
  }
}
