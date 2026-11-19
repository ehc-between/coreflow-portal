import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatApi } from '../../core/chat/chat-api';
import { ChatStore } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import { Message } from '../../core/chat/chat.models';
import { Icon } from '../../shared/ui/icon/icon';
import { EmojiPicker } from './emoji-picker';

/**
 * Reactions under a message: toggle buttons (`aria-pressed`, "Reager med 👍,
 * 3 personer"), a tooltip with the names (fetched lazily on first hover or
 * focus) and "+" for the emoji picker.
 */
@Component({
  selector: 'app-chat-reaction-bar',
  imports: [TranslocoPipe, Icon, EmojiPicker],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative flex flex-wrap items-center gap-1' },
  template: `
    @for (r of message().reactions; track r.emoji) {
      @let mine = r.user_ids.includes(meId() ?? '');
      <button
        type="button"
        class="inline-flex h-7 min-w-[36px] items-center gap-1 rounded-full border px-2 text-meta font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        [class]="
          mine
            ? 'border-accent-border bg-accent-soft text-accent'
            : 'border-border bg-surface text-fg-muted hover:border-border-strong'
        "
        [attr.aria-pressed]="mine"
        [attr.aria-label]="
          (r.count === 1 ? 'chat.reactions.labelOne' : 'chat.reactions.label')
            | transloco: { emoji: r.emoji, count: r.count }
        "
        [title]="names()[r.emoji] ?? ''"
        [disabled]="!canReact()"
        (pointerenter)="loadNames()"
        (focus)="loadNames()"
        (click)="store.toggleReaction(message(), r.emoji)"
      >
        <span class="text-[15px] leading-none" aria-hidden="true">{{ r.emoji }}</span>
        <span>{{ r.count }}</span>
      </button>
    }
    @if (canReact() && message().reactions.length) {
      <button
        type="button"
        class="inline-flex h-7 w-9 items-center justify-center rounded-full border border-dashed border-border text-fg-subtle hover:border-border-strong hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        [attr.aria-label]="'chat.reactions.add' | transloco"
        [attr.aria-expanded]="pickerOpen()"
        (click)="pickerOpen.set(!pickerOpen())"
      >
        <app-icon name="smile" [size]="15" />
      </button>
    }
    @if (pickerOpen()) {
      <app-chat-emoji-picker
        class="absolute bottom-full left-0 z-30 mb-1"
        (picked)="react($event)"
        (closed)="pickerOpen.set(false)"
      />
    }
  `,
})
export class ReactionBar {
  protected readonly store = inject(ChatStore);
  private readonly api = inject(ChatApi);

  readonly message = input.required<Message>();
  readonly meId = input<string | null>(null);
  readonly canReact = input(true);

  protected readonly pickerOpen = signal(false);
  protected readonly names = signal<Readonly<Record<string, string>>>({});
  private namesLoaded = false;

  /** Open the picker from outside (the message's "Reager" action). */
  openPicker(): void {
    this.pickerOpen.set(true);
  }

  protected react(emoji: string): void {
    this.pickerOpen.set(false);
    const existing = this.message().reactions.find((r) => r.emoji === emoji);
    // Picking an emoji I already used keeps it (the picker only adds).
    if (!existing?.user_ids.includes(this.meId() ?? '')) {
      this.store.toggleReaction(this.message(), emoji);
    }
  }

  protected loadNames(): void {
    const orgId = this.store.orgId();
    const message = this.message();
    if (this.namesLoaded || !orgId || message.id.startsWith('local-')) {
      return;
    }
    this.namesLoaded = true;
    this.api.reactions(orgId, message.conversation_id, message.id).subscribe({
      next: (res) => {
        const names: Record<string, string> = {};
        for (const item of res.items) {
          names[item.emoji] = item.users.map((u) => u.name).join(', ');
        }
        this.names.set(names);
      },
      error: () => {
        this.namesLoaded = false;
      },
    });
  }
}
