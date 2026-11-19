import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatApi } from '../../core/chat/chat-api';
import { ChatDisplay } from '../../core/chat/chat-display';
import { ChatStore, chatErrorCode } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import { ConversationSummary, UserRef } from '../../core/chat/chat.models';
import { ConversationView } from '../../features/chat/conversation-view';
import { PeoplePicker } from '../../features/chat/people-picker';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { LoadingState } from '../ui/loading-state/loading-state';

const CREATE_ERRORS = new Set(['invalid_members', 'member_no_record_access', 'rate_limited']);

/**
 * Body of the "Diskuter" slide-over (§4.7): the discussions of a record I
 * take part in (plus public channels about it); none → the form to start
 * one (people who must be able to open the record, optional name); opening
 * one shows the compact conversation with "Åpne i Meldinger →".
 */
@Component({
  selector: 'app-discuss-panel',
  imports: [TranslocoPipe, Button, Icon, LoadingState, ConversationView, PeoplePicker],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-[60vh] flex-col' },
  template: `
    @if (selected(); as id) {
      <button
        type="button"
        class="mb-2 inline-flex items-center gap-1.5 self-start rounded-lg px-1.5 py-1 text-meta font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
        (click)="selected.set(null)"
      >
        <app-icon name="back" [size]="14" />
        {{ 'chat.discuss.back' | transloco }}
      </button>
      <app-chat-conversation-view
        class="-mx-5 min-h-[420px] flex-1 border-t border-border"
        [conversationId]="id"
        [compact]="true"
      />
    } @else if (conversations() === null) {
      <app-loading-state [rows]="3" />
    } @else {
      <p class="text-meta text-fg-muted">{{ 'chat.discuss.intro' | transloco }}</p>
      @if (loadError()) {
        <p class="mt-3 text-meta text-fail-ink" role="alert">
          {{ 'chat.discuss.loadError' | transloco }}
        </p>
      }
      @if (conversations()!.length) {
        <h3 class="mt-4 mb-2 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase">
          {{ 'chat.discuss.existing' | transloco }}
        </h3>
        <ul class="flex flex-col gap-1.5">
          @for (c of conversations(); track c.id) {
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-tile border border-border px-3 py-2.5 text-left hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                data-testid="discuss-conversation"
                (click)="selected.set(c.id)"
              >
                <app-icon name="comment" [size]="17" />
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-ui font-semibold text-fg">{{ display.name(c) }}</span>
                  <span class="truncate text-micro text-fg-subtle">
                    {{ 'chat.header.members' | transloco: { count: c.member_count } }}
                    @if (c.last_message?.snippet) {
                      · {{ c.last_message!.snippet }}
                    }
                  </span>
                </span>
                @if (c.unread_count && c.me) {
                  <span class="rounded-full bg-accent px-1.5 text-micro font-bold text-white">{{
                    c.unread_count
                  }}</span>
                }
              </button>
            </li>
          }
        </ul>
      }

      @if (showForm()) {
        <form
          class="mt-5 flex flex-col gap-3 rounded-card border border-border p-4"
          (submit)="$event.preventDefault(); create()"
        >
          <h3 class="font-display text-card font-bold text-fg">
            {{ 'chat.discuss.startNew' | transloco }}
          </h3>
          <app-chat-people-picker
            [(selected)]="people"
            [label]="'chat.create.people' | transloco"
          />
          <div>
            <label class="block text-meta font-semibold text-fg" for="discuss-name">{{
              'chat.create.nameOptional' | transloco
            }}</label>
            <input
              id="discuss-name"
              type="text"
              maxlength="80"
              class="mt-1.5 h-10 w-full rounded-tile border border-border bg-surface px-3 text-ui text-fg focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
              [value]="name()"
              (input)="name.set(valueOf($event))"
            />
          </div>
          @if (errorKey(); as key) {
            <p class="text-meta text-fail-ink" role="alert">{{ key | transloco }}</p>
          }
          <app-button
            type="submit"
            class="self-end"
            [disabled]="!people().length"
            [loading]="busy()"
            data-testid="discuss-create"
            >{{ 'chat.discuss.submit' | transloco }}</app-button
          >
        </form>
      } @else {
        <app-button class="mt-4 block" variant="secondary" (click)="formOpen.set(true)">
          <app-icon name="plus" [size]="15" />
          {{ 'chat.discuss.startNew' | transloco }}
        </app-button>
      }
    }
  `,
})
export class DiscussPanel {
  private readonly api = inject(ChatApi);
  private readonly store = inject(ChatStore);
  protected readonly display = inject(ChatDisplay);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  readonly conversations = input<readonly ConversationSummary[] | null>(null);
  readonly loadError = input(false);
  readonly changed = output<void>();

  protected readonly selected = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly people = signal<readonly UserRef[]>([]);
  protected readonly name = signal('');
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly showForm = computed(
    () => this.formOpen() || (this.conversations() ?? []).length === 0,
  );

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected create(): void {
    const orgId = this.store.orgId();
    if (!orgId || !this.people().length || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    this.api
      .createConversation(orgId, {
        kind: 'group',
        user_ids: this.people().map((p) => p.id),
        name: this.name().trim() || null,
        subject: { entity_type: this.entityType(), entity_id: this.entityId() },
      })
      .subscribe({
        next: (c) => {
          this.busy.set(false);
          this.store.putConversation(c);
          this.formOpen.set(false);
          this.people.set([]);
          this.name.set('');
          this.selected.set(c.id);
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          const code = chatErrorCode(error);
          this.errorKey.set(
            code && CREATE_ERRORS.has(code)
              ? `chat.create.errors.${code}`
              : 'chat.create.errors.generic',
          );
        },
      });
  }
}
