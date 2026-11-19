import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PresenceStatus } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';

/**
 * Presence dot: filled green (online), hollow amber ring (away), grey ring
 * (offline) — shape differs too, and the status is in the tooltip and the
 * accessible name (never colour alone, §4.8).
 */
@Component({
  selector: 'app-chat-presence-dot',
  imports: [TranslocoPipe],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span
      role="img"
      class="block h-3 w-3 rounded-full border-2 border-surface"
      [class]="
        status() === 'online'
          ? 'bg-pass'
          : status() === 'away'
            ? 'bg-surface ring-2 ring-warn ring-inset'
            : 'bg-surface ring-2 ring-border-strong ring-inset'
      "
      [attr.aria-label]="'chat.presence.' + status() | transloco"
      [title]="'chat.presence.' + status() | transloco"
    ></span>
  `,
})
export class PresenceDot {
  readonly status = input<PresenceStatus>('offline');
}
