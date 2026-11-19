import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
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
        (click)="pickerOpen() ? pickerOpen.set(false) : openPicker()"
      >
        <app-icon name="smile" [size]="15" />
      </button>
    }
    @if (pickerOpen()) {
      <!-- Fixed, not absolute: the message feed scrolls and would clip the picker. -->
      <app-chat-emoji-picker
        class="fixed z-50"
        [style.left.px]="pickerPos().left"
        [style.top.px]="pickerPos().top"
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

  private readonly host = inject(ElementRef<HTMLElement>);
  /** Public so the message can lift its paint containment (content-visibility) while open. */
  readonly pickerOpen = signal(false);
  protected readonly pickerPos = signal({ left: 0, top: 0 });
  protected readonly names = signal<Readonly<Record<string, string>>>({});
  private namesLoaded = false;

  /** Open the picker from outside (the message's "Reager" action). */
  openPicker(): void {
    this.pickerPos.set(
      pickerPosition((this.host.nativeElement as HTMLElement).getBoundingClientRect()),
    );
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

const PICKER_WIDTH = 288;
const PICKER_HEIGHT = 330;

/** Viewport position of the picker: above the bar when it fits, else below; kept on screen. */
export function pickerPosition(
  anchor: Pick<DOMRect, 'left' | 'top' | 'bottom'>,
  viewport = { width: globalThis.innerWidth ?? 1024, height: globalThis.innerHeight ?? 768 },
): { left: number; top: number } {
  const left = Math.max(8, Math.min(anchor.left, viewport.width - PICKER_WIDTH - 8));
  const above = anchor.top - PICKER_HEIGHT - 4;
  const top =
    above >= 8
      ? above
      : Math.max(8, Math.min(anchor.bottom + 4, viewport.height - PICKER_HEIGHT - 8));
  return { left, top };
}
