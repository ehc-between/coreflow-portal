import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { EMOJI_SET } from '../../core/chat/chat-format';
import { provideChatScope } from '../../core/chat/chat-scope';

const RECENT_PREFIX = 'coreflow.chat.recentEmoji.';
const RECENT_MAX = 8;

/** Recently used emoji of a user (localStorage, best effort). */
export function recentEmoji(userId: string | null | undefined): string[] {
  if (!userId) {
    return [];
  }
  try {
    const raw = globalThis.localStorage?.getItem(RECENT_PREFIX + userId);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((e): e is string => typeof e === 'string').slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(userId: string | null | undefined, emoji: string): void {
  if (!userId) {
    return;
  }
  try {
    const next = [emoji, ...recentEmoji(userId).filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    globalThis.localStorage?.setItem(RECENT_PREFIX + userId, JSON.stringify(next));
  } catch {
    // Storage disabled: no recents.
  }
}

/**
 * Curated emoji grid (D-16) with "Nylig brukt". The host positions and opens
 * it; it focuses its first button, closes on Escape and returns the pick.
 * Arrow keys move through the grid.
 */
@Component({
  selector: 'app-chat-emoji-picker',
  imports: [TranslocoPipe],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      role="dialog"
      class="w-[288px] max-w-[calc(100vw-24px)] rounded-card border border-border bg-surface p-2 shadow-pop"
      [attr.aria-label]="'chat.reactions.picker' | transloco"
      (keydown)="onKeydown($event)"
    >
      @if (recent.length) {
        <div class="px-1 pb-1 text-micro font-semibold text-fg-subtle uppercase">
          {{ 'chat.reactions.recent' | transloco }}
        </div>
        <div class="mb-1.5 grid grid-cols-8 gap-0.5">
          @for (emoji of recent; track emoji) {
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-lg text-[20px] hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [attr.aria-label]="emoji"
              data-emoji
              (click)="pick(emoji)"
            >
              {{ emoji }}
            </button>
          }
        </div>
      }
      <div class="px-1 pb-1 text-micro font-semibold text-fg-subtle uppercase">
        {{ 'chat.reactions.all' | transloco }}
      </div>
      <div class="grid max-h-[220px] grid-cols-8 gap-0.5 overflow-y-auto">
        @for (emoji of all; track emoji) {
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-[20px] hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.aria-label]="emoji"
            data-emoji
            (click)="pick(emoji)"
          >
            {{ emoji }}
          </button>
        }
      </div>
    </div>
  `,
})
export class EmojiPicker {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly userId = inject(AuthService).user()?.id ?? null;

  readonly autofocus = input(true);
  readonly picked = output<string>();
  readonly closed = output<void>();

  protected readonly recent = recentEmoji(this.userId);
  protected readonly all = EMOJI_SET;

  constructor() {
    afterNextRender(() => {
      if (this.autofocus()) {
        this.buttons()[0]?.focus();
      }
    });
  }

  protected pick(emoji: string): void {
    rememberEmoji(this.userId, emoji);
    this.picked.emit(emoji);
  }

  private buttons(): HTMLButtonElement[] {
    return Array.from(
      (this.host.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'button[data-emoji]',
      ),
    );
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 8, ArrowUp: -8 }[event.key];
    if (!step) {
      return;
    }
    const buttons = this.buttons();
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) {
      return;
    }
    event.preventDefault();
    const next = Math.min(buttons.length - 1, Math.max(0, index + step));
    buttons[next]?.focus();
  }
}
