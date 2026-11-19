import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatStore } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';

/** "Kari skriver …" / "Kari og Ola skriver …" / "Flere skriver …" — not announced (§4.8). */
@Component({
  selector: 'app-chat-typing-indicator',
  imports: [TranslocoPipe],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-5 px-4 text-micro text-fg-subtle', 'aria-hidden': 'true' },
  template: `
    @let t = typists();
    @if (t.length === 1) {
      {{ 'chat.typing.one' | transloco: { name: t[0].user.name } }}
    } @else if (t.length === 2) {
      {{ 'chat.typing.two' | transloco: { a: t[0].user.name, b: t[1].user.name } }}
    } @else if (t.length > 2) {
      {{ 'chat.typing.many' | transloco }}
    }
  `,
})
export class TypingIndicator {
  private readonly store = inject(ChatStore);

  readonly conversationId = input<string | null>(null);
  readonly parentId = input<string | null>(null);

  protected readonly typists = computed(() =>
    this.store.typing(this.conversationId(), this.parentId()),
  );
}
