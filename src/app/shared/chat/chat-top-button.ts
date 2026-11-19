import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { badgeText } from '../../core/chat/chat-format';
import { provideChatScope } from '../../core/chat/chat-scope';
import { Icon } from '../ui/icon/icon';
import { lazyChatStore } from './chat-access';

/**
 * Top-bar chat button next to the bell (§4.5): "Meldinger, 3 uleste". Hidden
 * when the module is off or the user lacks `chat:use`. Creating it also
 * starts the chat store for the session (list + shared socket).
 */
@Component({
  selector: 'app-chat-top-button',
  imports: [RouterLink, TranslocoPipe, Icon],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (store()?.available()) {
      <a
        routerLink="/chat"
        class="relative flex h-10 w-10 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        [attr.aria-label]="
          count()
            ? ('chat.nav.unread' | transloco: { count: count() })
            : ('chat.nav.label' | transloco)
        "
        data-testid="chat-top-button"
      >
        <app-icon name="comment" [size]="19" />
        @if (count()) {
          <span
            class="absolute top-1 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-accent px-1 text-[10px] leading-none font-bold text-white"
            aria-hidden="true"
            >{{ count() }}</span
          >
        }
      </a>
    }
  `,
})
export class ChatTopButton {
  protected readonly store = lazyChatStore();
  protected readonly count = computed(() => badgeText(this.store()?.unreadBadge() ?? 0));
}
