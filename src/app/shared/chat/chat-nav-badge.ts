import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { badgeText } from '../../core/chat/chat-format';
import { lazyChatStore } from './chat-access';

/**
 * Unread badge for the "Meldinger" nav item (D-14: unread DMs/groups +
 * mentions in channels, "99+" cap). Decorative: the nav link's own label
 * carries the count for screen readers via {@link ChatTopButton}; in the
 * side menu the visible number is enough context.
 */
@Component({
  selector: 'app-chat-nav-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (text()) {
      <span
        class="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-accent px-1.5 text-micro font-bold text-white"
        data-testid="chat-nav-badge"
        >{{ text() }}</span
      >
    }
  `,
})
export class ChatNavBadge {
  private readonly store = lazyChatStore();
  protected readonly text = computed(() => {
    const store = this.store();
    return store?.available() ? badgeText(store.unreadBadge()) : '';
  });
}
