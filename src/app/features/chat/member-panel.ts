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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatApi } from '../../core/chat/chat-api';
import { ChatDisplay } from '../../core/chat/chat-display';
import { ChatStore, chatErrorCode } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import {
  ConversationSummary,
  MemberEntry,
  MemberRole,
  NotifyLevel,
  UserRef,
} from '../../core/chat/chat.models';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { PeoplePicker } from './people-picker';

const MEMBER_ERRORS = new Set(['last_owner', 'department_channel', 'member_no_record_access']);

/**
 * Conversation details and members (docs/chat-design.md §4.4): roles,
 * add / remove / change role (when allowed), my notification level, leave
 * and archive. Department channel membership follows the department.
 */
@Component({
  selector: 'app-chat-member-panel',
  imports: [
    TranslocoPipe,
    Avatar,
    Button,
    ConfirmDialog,
    LoadingState,
    MenuItem,
    OverflowMenu,
    SlideOver,
    PeoplePicker,
  ],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = conversation();
    <app-slide-over
      [open]="open()"
      [title]="display.name(c)"
      [subtitle]="c.topic ?? ''"
      [closeLabel]="'chat.reactions.close' | transloco"
      [width]="440"
      (closed)="closed.emit()"
    >
      @if (c.me) {
        <fieldset class="mb-5">
          <legend class="text-meta font-semibold text-fg">
            {{ 'chat.header.notify.label' | transloco }}
          </legend>
          @for (level of levels; track level) {
            <label
              class="mt-1.5 flex cursor-pointer items-center gap-2.5 rounded-tile border border-border px-3 py-2 has-[:checked]:border-accent-border has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name="chat-notify"
                class="accent-[var(--accent)]"
                [checked]="c.me.notify_level === level"
                (change)="setNotify(level)"
              />
              <span class="text-ui text-fg">{{ 'chat.header.notify.' + level | transloco }}</span>
            </label>
          }
        </fieldset>
      }

      <h3 class="mb-2 text-meta font-bold tracking-[0.06em] text-fg-subtle uppercase">
        {{ 'chat.members.title' | transloco }} · {{ c.member_count }}
      </h3>

      @if (c.department_id) {
        <p class="mb-3 rounded-tile bg-surface-2 px-3 py-2 text-meta text-fg-muted">
          {{ 'chat.members.departmentNote' | transloco }}
        </p>
      } @else if (canAdd()) {
        <div class="mb-4 rounded-tile border border-border p-3">
          <app-chat-people-picker
            [(selected)]="toAdd"
            [label]="'chat.members.add' | transloco"
            [exclude]="memberIds()"
          />
          @if (toAdd().length) {
            <app-button
              class="mt-2 block"
              size="sm"
              [loading]="busy()"
              (click)="add()"
              data-testid="chat-members-add"
              >{{ 'chat.members.addSubmit' | transloco }}</app-button
            >
          }
        </div>
      }

      @if (errorKey(); as key) {
        <p class="mb-2 text-meta text-fail-ink" role="alert">{{ key | transloco }}</p>
      }

      @if (loading()) {
        <app-loading-state [rows]="4" />
      } @else {
        <ul class="flex flex-col gap-1" data-testid="chat-members">
          @for (m of members(); track m.user.id) {
            <li class="flex items-center gap-2.5 rounded-tile px-1 py-1.5">
              <app-avatar [name]="m.user.name" size="sm" [gradient]="false" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-ui font-semibold text-fg">
                  {{ m.user.name }}
                  @if (m.user.id === store.meId()) {
                    <span class="font-normal text-fg-subtle">{{
                      'chat.members.you' | transloco
                    }}</span>
                  }
                </span>
                <span class="text-micro text-fg-subtle">
                  {{ 'chat.members.roles.' + m.role | transloco }} ·
                  {{ 'chat.presence.' + store.presence(m.user.id) | transloco }}
                </span>
              </span>
              @if (c.can_manage && c.kind !== 'dm' && m.user.id !== store.meId()) {
                <app-overflow-menu
                  variant="ghost"
                  [iconOnly]="true"
                  labelKey="chat.members.actions"
                >
                  @for (role of roles; track role) {
                    @if (role !== m.role) {
                      <button appMenuItem type="button" (click)="setRole(m, role)">
                        {{ 'chat.members.make' + capitalise(role) | transloco }}
                      </button>
                    }
                  }
                  @if (!c.department_id) {
                    <button
                      appMenuItem
                      type="button"
                      [danger]="true"
                      (click)="removing.set(m.user)"
                    >
                      {{ 'chat.members.remove' | transloco }}
                    </button>
                  }
                </app-overflow-menu>
              }
            </li>
          }
        </ul>
      }

      <div class="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
        @if (c.me && c.kind !== 'dm' && !c.department_id) {
          <app-button
            variant="secondary"
            size="sm"
            (click)="confirm.set('leave')"
            data-testid="chat-leave"
            >{{ 'chat.header.leave' | transloco }}</app-button
          >
        }
        @if (c.can_manage && c.kind !== 'dm') {
          @if (c.archived_at) {
            <app-button variant="secondary" size="sm" (click)="archive(false)">{{
              'chat.header.unarchive' | transloco
            }}</app-button>
          } @else {
            <app-button variant="secondary" size="sm" (click)="confirm.set('archive')">{{
              'chat.header.archive' | transloco
            }}</app-button>
          }
        }
      </div>
    </app-slide-over>

    <app-confirm-dialog
      [open]="!!removing()"
      [title]="'chat.members.removeConfirm.title' | transloco: { name: removing()?.name }"
      [message]="'chat.members.removeConfirm.body' | transloco: { name: removing()?.name }"
      [confirmLabel]="'chat.members.removeConfirm.confirm' | transloco"
      [cancelLabel]="'chat.create.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="removing.set(null)"
    />
    <app-confirm-dialog
      [open]="confirm() === 'leave'"
      [title]="'chat.members.leaveConfirm.title' | transloco"
      [message]="'chat.members.leaveConfirm.body' | transloco"
      [confirmLabel]="'chat.members.leaveConfirm.confirm' | transloco"
      [cancelLabel]="'chat.create.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="leave()"
      (cancelled)="confirm.set(null)"
    />
    <app-confirm-dialog
      [open]="confirm() === 'archive'"
      [title]="'chat.members.archiveConfirm.title' | transloco"
      [message]="'chat.members.archiveConfirm.body' | transloco"
      [confirmLabel]="'chat.members.archiveConfirm.confirm' | transloco"
      [cancelLabel]="'chat.create.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy()"
      (confirmed)="archive(true)"
      (cancelled)="confirm.set(null)"
    />
  `,
})
export class MemberPanel {
  protected readonly store = inject(ChatStore);
  protected readonly display = inject(ChatDisplay);
  private readonly api = inject(ChatApi);
  private readonly router = inject(Router);

  readonly conversation = input.required<ConversationSummary>();
  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly levels: readonly NotifyLevel[] = ['all', 'mentions', 'none'];
  protected readonly roles: readonly MemberRole[] = ['owner', 'admin', 'member'];
  protected readonly members = signal<readonly MemberEntry[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly toAdd = signal<readonly UserRef[]>([]);
  protected readonly removing = signal<UserRef | null>(null);
  protected readonly confirm = signal<'leave' | 'archive' | null>(null);

  protected readonly memberIds = computed(() => this.members().map((m) => m.user.id));
  protected readonly canAdd = computed(() => {
    const c = this.conversation();
    return c.kind !== 'dm' && !c.archived_at && (c.can_manage || (c.kind === 'group' && !!c.me));
  });

  private readonly conversationId = computed(() => this.conversation().id);

  constructor() {
    effect(() => {
      const open = this.open();
      const id = this.conversationId();
      if (open) {
        untracked(() => this.load(id));
      }
    });
  }

  protected capitalise(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  private load(id: string): void {
    const orgId = this.store.orgId();
    if (!orgId) {
      return;
    }
    this.loading.set(true);
    this.errorKey.set(null);
    this.api.members(orgId, id).subscribe({
      next: (res) => {
        this.members.set(res.items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorKey.set('chat.members.errors.generic');
      },
    });
  }

  protected setNotify(level: NotifyLevel): void {
    this.store.setNotifyLevel(this.conversation().id, level).subscribe({
      error: () => this.errorKey.set('chat.members.errors.generic'),
    });
  }

  protected add(): void {
    const orgId = this.store.orgId();
    const ids = this.toAdd().map((p) => p.id);
    if (!orgId || !ids.length) {
      return;
    }
    this.busy.set(true);
    this.api.addMembers(orgId, this.conversation().id, ids).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.toAdd.set([]);
        this.store.putConversation(c);
        this.load(c.id);
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  protected setRole(member: MemberEntry, role: MemberRole): void {
    const orgId = this.store.orgId();
    if (!orgId) {
      return;
    }
    this.api.setMemberRole(orgId, this.conversation().id, member.user.id, role).subscribe({
      next: () => this.load(this.conversation().id),
      error: (e: unknown) => this.fail(e),
    });
  }

  protected remove(): void {
    const orgId = this.store.orgId();
    const user = this.removing();
    if (!orgId || !user) {
      return;
    }
    this.busy.set(true);
    this.api.removeMember(orgId, this.conversation().id, user.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);
        this.load(this.conversation().id);
      },
      error: (e: unknown) => {
        this.removing.set(null);
        this.fail(e);
      },
    });
  }

  protected leave(): void {
    this.busy.set(true);
    this.store.leave(this.conversation().id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirm.set(null);
        this.closed.emit();
        void this.router.navigate(['/chat']);
      },
      error: (e: unknown) => {
        this.confirm.set(null);
        this.fail(e);
      },
    });
  }

  protected archive(archived: boolean): void {
    const orgId = this.store.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    this.api.archive(orgId, this.conversation().id, archived).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.confirm.set(null);
        this.store.putConversation(c);
      },
      error: (e: unknown) => {
        this.confirm.set(null);
        this.fail(e);
      },
    });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    const code = chatErrorCode(error);
    this.errorKey.set(
      code && MEMBER_ERRORS.has(code)
        ? `chat.members.errors.${code}`
        : 'chat.members.errors.generic',
    );
  }
}
