import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatApi } from '../../core/chat/chat-api';
import { provideChatScope } from '../../core/chat/chat-scope';
import { ConversationSummary } from '../../core/chat/chat.models';
import { Icon } from '../ui/icon/icon';
import { SlideOver } from '../ui/slide-over/slide-over';
import { lazyChatStore } from './chat-access';
import { DiscussPanel } from './discuss-panel';

/**
 * "Diskuter" on record pages (docs/chat-design.md §4.7, D-18): a quiet header
 * button (icon-only below `sm`) with a count when I already take part in
 * discussions of the record. Opens a slide-over with the discussions, or the
 * form to start one. Hidden when chat is off or I lack `chat:use`.
 */
@Component({
  selector: 'app-discuss-button',
  imports: [TranslocoPipe, Icon, SlideOver, DiscussPanel],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (store()?.available()) {
      <button
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-2.5 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none sm:px-3"
        [attr.aria-label]="
          count()
            ? ('chat.discuss.ariaCount' | transloco: { count: count() })
            : ('chat.discuss.aria' | transloco)
        "
        data-testid="record-discuss"
        (click)="open.set(true)"
      >
        <app-icon name="comment" [size]="16" />
        <span class="cf-action-label hidden sm:inline">{{
          'chat.discuss.button' | transloco
        }}</span>
        @if (count()) {
          <span class="rounded-full bg-accent-soft px-1.5 text-micro font-bold text-accent">{{
            count()
          }}</span>
        }
      </button>

      <app-slide-over
        [open]="open()"
        [title]="
          title()
            ? ('chat.discuss.title' | transloco: { title: title() })
            : ('chat.discuss.titleFallback' | transloco)
        "
        [closeLabel]="'chat.reactions.close' | transloco"
        [width]="560"
        (closed)="open.set(false)"
      >
        @if (open()) {
          @defer (on immediate) {
            <app-discuss-panel
              [entityType]="entityType()"
              [entityId]="entityId()"
              [conversations]="conversations()"
              [loadError]="loadError()"
              (changed)="reload()"
            />
          } @placeholder {
            <div class="h-24"></div>
          }
        }
      </app-slide-over>
    }
  `,
})
export class DiscussButton {
  protected readonly store = lazyChatStore();
  private readonly api = inject(ChatApi);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  readonly title = input<string | null | undefined>('');

  protected readonly open = signal(false);
  protected readonly conversations = signal<readonly ConversationSummary[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly count = computed(
    () => (this.conversations() ?? []).filter((c) => c.me).length,
  );

  constructor() {
    effect(() => {
      const orgId = this.store()?.orgId();
      const type = this.entityType();
      const id = this.entityId();
      if (orgId && type && id) {
        untracked(() => this.reload());
      }
    });
  }

  protected reload(): void {
    const store = this.store();
    const orgId = store?.orgId();
    if (!store || !orgId) {
      return;
    }
    this.api
      .recordConversations(orgId, { entity_type: this.entityType(), entity_id: this.entityId() })
      .subscribe({
        next: (res) => {
          this.loadError.set(false);
          this.conversations.set(res.items);
          for (const c of res.items) {
            if (c.me) {
              store.putConversation(c);
            }
          }
        },
        error: () => {
          this.loadError.set(true);
          this.conversations.set([]);
        },
      });
  }
}
