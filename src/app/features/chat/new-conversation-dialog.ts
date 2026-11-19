import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatApi } from '../../core/chat/chat-api';
import { ChatStore, chatErrorCode } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import {
  CHAT_LIMITS,
  ConversationKind,
  ConversationSummary,
  ConversationVisibility,
  CreateConversationRequest,
  EntityLinkRef,
  UserRef,
} from '../../core/chat/chat.models';
import { Button } from '../../shared/ui/button/button';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { PeoplePicker } from './people-picker';
import { RecordCard } from './record-card';

const KNOWN_ERRORS = new Set([
  'name_taken',
  'invalid_members',
  'member_no_record_access',
  'rate_limited',
]);

/**
 * "Ny samtale" (docs/chat-design.md §4.4): Direktemelding · Gruppe · Kanal,
 * a people picker, name, channel visibility, and an optional record subject
 * (prefilled by "Diskuter"). A DM to someone you already talk to opens the
 * existing conversation (the server answers 200).
 */
@Component({
  selector: 'app-chat-new-conversation-dialog',
  imports: [TranslocoPipe, Button, SlideOver, PeoplePicker, RecordCard],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'chat.create.title' | transloco"
      [closeLabel]="'chat.create.cancel' | transloco"
      [width]="520"
      (closed)="closed.emit()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()">
        @if (!subject()) {
          <div
            class="flex gap-1 rounded-tile bg-surface-2 p-1"
            role="tablist"
            [attr.aria-label]="'chat.create.title' | transloco"
          >
            @for (k of kinds; track k) {
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="kind() === k"
                [attr.data-testid]="'chat-create-tab-' + k"
                class="h-9 flex-1 rounded-lg text-meta font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [class]="
                  kind() === k ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                "
                (click)="setKind(k)"
              >
                {{ 'chat.create.tabs.' + k | transloco }}
              </button>
            }
          </div>
          <p class="-mt-2 text-meta text-fg-muted">
            {{ 'chat.create.' + kind() + 'Hint' | transloco }}
          </p>
        } @else {
          <div>
            <div class="mb-1.5 text-meta font-semibold text-fg">
              {{ 'chat.create.subject' | transloco }}
            </div>
            <app-chat-record-card [ref]="subject()!" />
          </div>
        }

        @if (kind() === 'channel') {
          <div>
            <label class="block text-meta font-semibold text-fg" for="chat-create-name">{{
              'chat.create.channelName' | transloco
            }}</label>
            <div
              class="mt-1.5 flex items-center rounded-tile border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
            >
              <span class="pl-3 text-ui text-fg-subtle" aria-hidden="true">#</span>
              <input
                id="chat-create-name"
                type="text"
                required
                [maxLength]="maxName"
                class="h-10 w-full bg-transparent px-1.5 text-ui text-fg outline-none"
                [value]="name()"
                (input)="name.set(valueOf($event))"
                data-testid="chat-create-name"
              />
            </div>
          </div>
          <div>
            <label class="block text-meta font-semibold text-fg" for="chat-create-topic">{{
              'chat.create.topic' | transloco
            }}</label>
            <input
              id="chat-create-topic"
              type="text"
              [maxLength]="maxTopic"
              class="mt-1.5 h-10 w-full rounded-tile border border-border bg-surface px-3 text-ui text-fg focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
              [value]="topic()"
              (input)="topic.set(valueOf($event))"
            />
          </div>
          <fieldset>
            <legend class="text-meta font-semibold text-fg">
              {{ 'chat.create.visibility.label' | transloco }}
            </legend>
            @for (v of visibilities; track v) {
              <label
                class="mt-1.5 flex cursor-pointer items-start gap-2.5 rounded-tile border border-border px-3 py-2.5 has-[:checked]:border-accent-border has-[:checked]:bg-accent-soft"
              >
                <input
                  type="radio"
                  name="chat-visibility"
                  class="mt-0.5 accent-[var(--accent)]"
                  [checked]="visibility() === v"
                  (change)="visibility.set(v)"
                />
                <span class="text-ui text-fg">{{ 'chat.create.visibility.' + v | transloco }}</span>
              </label>
            }
          </fieldset>
        }

        <app-chat-people-picker
          [(selected)]="people"
          [max]="kind() === 'dm' ? 1 : maxGroup"
          [label]="'chat.create.people' | transloco"
        />

        @if (kind() === 'group') {
          <div>
            <label class="block text-meta font-semibold text-fg" for="chat-create-group-name">{{
              'chat.create.nameOptional' | transloco
            }}</label>
            <input
              id="chat-create-group-name"
              type="text"
              [maxLength]="maxName"
              class="mt-1.5 h-10 w-full rounded-tile border border-border bg-surface px-3 text-ui text-fg focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
              [value]="name()"
              (input)="name.set(valueOf($event))"
            />
          </div>
        }

        @if (errorKey(); as key) {
          <p class="text-meta text-fail-ink" role="alert" data-testid="chat-create-error">
            {{ key | transloco }}
          </p>
        }

        <div class="flex justify-end gap-2 pt-2">
          <app-button variant="secondary" (click)="closed.emit()">{{
            'chat.create.cancel' | transloco
          }}</app-button>
          <app-button
            type="submit"
            [disabled]="!valid()"
            [loading]="busy()"
            data-testid="chat-create-submit"
            >{{
              (subject() ? 'chat.discuss.submit' : 'chat.create.submit') | transloco
            }}</app-button
          >
        </div>
      </form>
    </app-slide-over>
  `,
})
export class NewConversationDialog {
  private readonly api = inject(ChatApi);
  private readonly store = inject(ChatStore);

  readonly open = input(false);
  /** Record the conversation is about ("Diskuter"); creates a group. */
  readonly subject = input<EntityLinkRef | null>(null);
  readonly initialKind = input<ConversationKind>('dm');
  readonly preselected = input<readonly UserRef[]>([]);

  readonly created = output<ConversationSummary>();
  readonly closed = output<void>();

  protected readonly kinds: readonly ConversationKind[] = ['dm', 'group', 'channel'];
  protected readonly visibilities: readonly ConversationVisibility[] = ['public', 'private'];
  protected readonly maxName = CHAT_LIMITS.channelName;
  protected readonly maxTopic = CHAT_LIMITS.topic;
  protected readonly maxGroup = CHAT_LIMITS.groupMembers - 1;

  protected readonly kind = signal<ConversationKind>('dm');
  protected readonly people = signal<readonly UserRef[]>([]);
  protected readonly name = signal('');
  protected readonly topic = signal('');
  protected readonly visibility = signal<ConversationVisibility>('public');
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly valid = computed(() => {
    const count = this.people().length;
    switch (this.kind()) {
      case 'dm':
        return count === 1;
      case 'group':
        return count >= 1;
      case 'channel':
        return !!this.name().trim();
    }
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.kind.set(this.subject() ? 'group' : this.initialKind());
          this.people.set([...this.preselected()]);
          this.name.set('');
          this.topic.set('');
          this.visibility.set('public');
          this.errorKey.set(null);
          this.busy.set(false);
        });
      }
    });
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setKind(kind: ConversationKind): void {
    this.kind.set(kind);
    if (kind === 'dm' && this.people().length > 1) {
      this.people.set(this.people().slice(0, 1));
    }
    this.errorKey.set(null);
  }

  protected submit(): void {
    const orgId = this.store.orgId();
    if (!orgId || !this.valid() || this.busy()) {
      return;
    }
    const userIds = this.people().map((p) => p.id);
    const subject = this.subject();
    let body: CreateConversationRequest;
    switch (this.kind()) {
      case 'dm':
        body = { kind: 'dm', user_ids: userIds };
        break;
      case 'group':
        body = { kind: 'group', user_ids: userIds, name: this.name().trim() || null, subject };
        break;
      default:
        body = {
          kind: 'channel',
          name: this.name().trim().replace(/^#/, ''),
          topic: this.topic().trim() || null,
          visibility: this.visibility(),
          user_ids: userIds,
          subject,
        };
    }
    this.busy.set(true);
    this.errorKey.set(null);
    this.api.createConversation(orgId, body).subscribe({
      next: (conversation) => {
        this.busy.set(false);
        this.store.putConversation(conversation);
        this.created.emit(conversation);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const code = chatErrorCode(error);
        this.errorKey.set(
          code && KNOWN_ERRORS.has(code)
            ? `chat.create.errors.${code}`
            : 'chat.create.errors.generic',
        );
      },
    });
  }
}
