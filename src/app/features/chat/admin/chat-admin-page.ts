import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatApi } from '../../../core/chat/chat-api';
import { ChatDisplay } from '../../../core/chat/chat-display';
import { ChatStore } from '../../../core/chat/chat-store';
import { provideChatScope } from '../../../core/chat/chat-scope';
import { AdminConversation, ChatSettings, UserRef } from '../../../core/chat/chat.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { saveBlob } from '../../org-settings/download';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Switch } from '../../../shared/ui/switch/switch';
import { PeoplePicker } from '../people-picker';

const PRESETS = [30, 90, 180, 365] as const;
type RetentionChoice = 'always' | (typeof PRESETS)[number] | 'custom';

/**
 * Chat administration (`chat:admin`, docs/chat-design.md §2.8, §4.4):
 * retention, legal hold per conversation (metadata only — never content,
 * D-3), per-person export and erasure (GDPR), and an org export.
 */
@Component({
  selector: 'app-chat-admin-page',
  imports: [
    TranslocoPipe,
    Button,
    ConfirmDialog,
    DateInput,
    FormField,
    LoadingState,
    PageHeader,
    Switch,
    PeoplePicker,
  ],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="chat.admin.title"
        descriptionKey="chat.admin.intro"
        [breadcrumbs]="[
          { labelKey: 'settings.hub.title', link: '/settings' },
          { labelKey: 'chat.admin.title' },
        ]"
      />

      <section
        class="mt-6 rounded-card border border-border bg-surface p-5"
        aria-labelledby="chat-retention"
      >
        <h2 id="chat-retention" class="font-display text-card font-bold text-fg">
          {{ 'chat.admin.retention.title' | transloco }}
        </h2>
        <p class="mt-1 text-meta text-fg-muted">{{ 'chat.admin.retention.hint' | transloco }}</p>
        @if (settings() === null) {
          <app-loading-state class="mt-3 block" [rows]="2" />
        } @else {
          <fieldset class="mt-3 flex flex-wrap gap-2">
            <legend class="sr-only">{{ 'chat.admin.retention.title' | transloco }}</legend>
            @for (choice of choices; track choice) {
              <label
                class="flex cursor-pointer items-center gap-2 rounded-tile border border-border px-3 py-2 text-ui has-[:checked]:border-accent-border has-[:checked]:bg-accent-soft"
              >
                <input
                  type="radio"
                  name="chat-retention"
                  class="accent-[var(--accent)]"
                  [checked]="retention() === choice"
                  (change)="retention.set(choice)"
                />
                @switch (choice) {
                  @case ('always') {
                    {{ 'chat.admin.retention.always' | transloco }}
                  }
                  @case ('custom') {
                    {{ 'chat.admin.retention.custom' | transloco }}
                  }
                  @default {
                    {{ 'chat.admin.retention.days' | transloco: { count: choice } }}
                  }
                }
              </label>
            }
          </fieldset>
          @if (retention() === 'custom') {
            <app-form-field
              class="mt-4 max-w-[240px]"
              inputId="chat-retention-days"
              [label]="'chat.admin.retention.customLabel' | transloco"
            >
              <input
                id="chat-retention-days"
                type="number"
                min="30"
                max="3650"
                [value]="customDays()"
                (input)="customDays.set(numberOf($event))"
              />
            </app-form-field>
          }
          @if (retentionInvalid()) {
            <p class="mt-2 text-meta text-fail-ink" role="alert">
              {{ 'chat.admin.retention.invalid' | transloco }}
            </p>
          }
          <div class="mt-3 flex items-center gap-3">
            <app-button
              size="sm"
              [disabled]="retentionInvalid()"
              [loading]="savingRetention()"
              (click)="saveRetention()"
              >{{ 'chat.admin.retention.save' | transloco }}</app-button
            >
            @if (settings()?.updated_by; as by) {
              <span class="text-micro text-fg-subtle">{{
                'chat.admin.retention.updatedBy' | transloco: { name: by.name }
              }}</span>
            }
          </div>
        }
      </section>

      <section
        class="mt-6 rounded-card border border-border bg-surface p-5"
        aria-labelledby="chat-conversations"
      >
        <h2 id="chat-conversations" class="font-display text-card font-bold text-fg">
          {{ 'chat.admin.conversations.title' | transloco }}
        </h2>
        <label class="sr-only" for="chat-admin-search">{{
          'chat.admin.conversations.search' | transloco
        }}</label>
        <input
          id="chat-admin-search"
          type="search"
          class="mt-3 h-10 w-full max-w-sm rounded-tile border border-border bg-surface px-3 text-ui text-fg"
          [placeholder]="'chat.admin.conversations.search' | transloco"
          (input)="search($event)"
        />
        @if (conversations() === null) {
          <app-loading-state class="mt-3 block" [rows]="4" />
        } @else if (!conversations()!.length) {
          <p class="mt-3 text-meta text-fg-subtle">
            {{ 'chat.admin.conversations.empty' | transloco }}
          </p>
        } @else {
          <div class="mt-3 overflow-x-auto">
            <table class="w-full min-w-[560px] text-left text-ui">
              <thead class="text-micro font-semibold text-fg-subtle uppercase">
                <tr>
                  <th class="py-2 pr-3">{{ 'chat.admin.conversations.name' | transloco }}</th>
                  <th class="py-2 pr-3">{{ 'chat.admin.conversations.kind' | transloco }}</th>
                  <th class="py-2 pr-3 text-right">
                    {{ 'chat.admin.conversations.members' | transloco }}
                  </th>
                  <th class="py-2 pr-3 text-right">
                    {{ 'chat.admin.conversations.messages' | transloco }}
                  </th>
                  <th class="py-2">{{ 'chat.admin.conversations.legalHold' | transloco }}</th>
                </tr>
              </thead>
              <tbody>
                @for (c of conversations(); track c.id) {
                  <tr class="border-t border-border">
                    <td class="py-2 pr-3 font-medium text-fg">
                      {{ display.name(c) }}
                      @if (c.archived_at) {
                        <span class="ml-1 text-micro text-fg-subtle"
                          >({{ 'chat.admin.conversations.archived' | transloco }})</span
                        >
                      }
                    </td>
                    <td class="py-2 pr-3 text-fg-muted">{{ 'chat.kind.' + c.kind | transloco }}</td>
                    <td class="py-2 pr-3 text-right tabular-nums">{{ c.member_count }}</td>
                    <td class="py-2 pr-3 text-right tabular-nums">{{ c.message_count }}</td>
                    <td class="py-2">
                      <app-switch [checked]="c.legal_hold" (checkedChange)="setHold(c, $event)">
                        <span class="sr-only">{{
                          'chat.admin.conversations.legalHoldFor'
                            | transloco: { name: display.name(c) }
                        }}</span>
                      </app-switch>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <section
        class="mt-6 rounded-card border border-border bg-surface p-5"
        aria-labelledby="chat-people"
      >
        <h2 id="chat-people" class="font-display text-card font-bold text-fg">
          {{ 'chat.admin.people.title' | transloco }}
        </h2>
        <p class="mt-1 text-meta text-fg-muted">{{ 'chat.admin.people.hint' | transloco }}</p>
        <app-chat-people-picker
          class="mt-3 block max-w-md"
          [(selected)]="person"
          [max]="1"
          [label]="'chat.admin.people.search' | transloco"
        />
        @if (person()[0]; as p) {
          <div class="mt-3 flex flex-wrap gap-2">
            <app-button
              size="sm"
              variant="secondary"
              [loading]="exporting()"
              (click)="exportPerson(p)"
              >{{ 'chat.admin.people.export' | transloco }}</app-button
            >
            <app-button size="sm" variant="danger" (click)="eraseOpen.set(true)">{{
              'chat.admin.people.erase' | transloco
            }}</app-button>
          </div>
        }
      </section>

      <section
        class="mt-6 rounded-card border border-border bg-surface p-5"
        aria-labelledby="chat-org-export"
      >
        <h2 id="chat-org-export" class="font-display text-card font-bold text-fg">
          {{ 'chat.admin.orgExport.title' | transloco }}
        </h2>
        <p class="mt-1 text-meta text-fg-muted">{{ 'chat.admin.orgExport.hint' | transloco }}</p>
        <div class="mt-4 grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-[1fr_1fr_auto]">
          <app-form-field
            inputId="chat-export-after"
            [label]="'chat.admin.orgExport.after' | transloco"
          >
            <app-date-input
              inputId="chat-export-after"
              [value]="after()"
              (valueChange)="after.set($event ?? '')"
            />
          </app-form-field>
          <app-form-field
            inputId="chat-export-before"
            [label]="'chat.admin.orgExport.before' | transloco"
          >
            <app-date-input
              inputId="chat-export-before"
              [value]="before()"
              (valueChange)="before.set($event ?? '')"
            />
          </app-form-field>
          <app-button
            class="sm:mb-px"
            variant="secondary"
            [disabled]="!rangeValid()"
            [loading]="exporting()"
            (click)="exportOrg()"
            >{{ 'chat.admin.orgExport.submit' | transloco }}</app-button
          >
        </div>
        @if (after() && before() && !rangeValid()) {
          <p class="mt-2 text-meta text-fail-ink" role="alert">
            {{ 'chat.admin.orgExport.invalid' | transloco }}
          </p>
        }
      </section>
    </div>

    <app-confirm-dialog
      [open]="eraseOpen()"
      [title]="'chat.admin.people.eraseConfirm.title' | transloco: { name: person()[0]?.name }"
      [message]="'chat.admin.people.eraseConfirm.body' | transloco: { name: person()[0]?.name }"
      [confirmLabel]="'chat.admin.people.eraseConfirm.confirm' | transloco"
      [cancelLabel]="'chat.create.cancel' | transloco"
      [confirmDisabled]="typedName().trim() !== (person()[0]?.name ?? '').trim()"
      [busy]="erasing()"
      initialFocus="#chat-erase-name"
      (confirmed)="erase()"
      (cancelled)="closeErase()"
    >
      <label class="mt-3 block text-meta font-semibold text-fg" for="chat-erase-name">{{
        'chat.admin.people.eraseConfirm.typeName' | transloco: { name: person()[0]?.name }
      }}</label>
      <input
        id="chat-erase-name"
        type="text"
        autocomplete="off"
        class="mt-1 h-10 w-full rounded-tile border border-border bg-surface px-3 text-ui"
        [value]="typedName()"
        (input)="typedName.set(textOf($event))"
      />
    </app-confirm-dialog>
  `,
})
export class ChatAdminPage {
  private readonly api = inject(ChatApi);
  private readonly store = inject(ChatStore);
  protected readonly display = inject(ChatDisplay);
  private readonly notifications = inject(NotificationService);
  private readonly document = inject(DOCUMENT);

  protected readonly choices: readonly RetentionChoice[] = ['always', ...PRESETS, 'custom'];
  protected readonly settings = signal<ChatSettings | null>(null);
  protected readonly retention = signal<RetentionChoice>('always');
  protected readonly customDays = signal(730);
  protected readonly savingRetention = signal(false);
  protected readonly conversations = signal<readonly AdminConversation[] | null>(null);
  protected readonly person = signal<readonly UserRef[]>([]);
  protected readonly exporting = signal(false);
  protected readonly eraseOpen = signal(false);
  protected readonly erasing = signal(false);
  protected readonly typedName = signal('');
  protected readonly after = signal('');
  protected readonly before = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly retentionDays = computed<number | null>(() => {
    const choice = this.retention();
    if (choice === 'always') {
      return null;
    }
    return choice === 'custom' ? this.customDays() : choice;
  });
  protected readonly retentionInvalid = computed(() => {
    const days = this.retentionDays();
    return days !== null && (!Number.isInteger(days) || days < 30 || days > 3650);
  });
  protected readonly rangeValid = computed(() => {
    const a = Date.parse(this.after());
    const b = Date.parse(this.before());
    return !Number.isNaN(a) && !Number.isNaN(b) && b >= a && b - a <= 366 * 86_400_000;
  });

  constructor() {
    const orgId = this.store.orgId();
    if (orgId) {
      this.api.settings(orgId).subscribe({
        next: (s) => this.applySettings(s),
        error: () => this.fail(),
      });
      this.loadConversations('');
    }
  }

  protected numberOf(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  protected textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private applySettings(s: ChatSettings): void {
    this.settings.set(s);
    const days = s.retention_days;
    if (days === null) {
      this.retention.set('always');
    } else if ((PRESETS as readonly number[]).includes(days)) {
      this.retention.set(days as RetentionChoice);
    } else {
      this.retention.set('custom');
      this.customDays.set(days);
    }
  }

  protected saveRetention(): void {
    const orgId = this.store.orgId();
    if (!orgId || this.retentionInvalid()) {
      return;
    }
    this.savingRetention.set(true);
    this.api.updateSettings(orgId, this.retentionDays()).subscribe({
      next: (s) => {
        this.savingRetention.set(false);
        this.applySettings(s);
        this.notifications.success('chat.admin.retention.saved');
      },
      error: () => {
        this.savingRetention.set(false);
        this.fail();
      },
    });
  }

  protected search(event: Event): void {
    const q = this.textOf(event);
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => this.loadConversations(q), 250);
  }

  private loadConversations(q: string): void {
    const orgId = this.store.orgId();
    if (!orgId) {
      return;
    }
    this.api
      .adminConversations(orgId, { q: q.trim() || undefined, include_archived: true })
      .subscribe({
        next: (res) => this.conversations.set(res.items),
        error: () => {
          this.conversations.set([]);
          this.fail();
        },
      });
  }

  protected setHold(c: AdminConversation, hold: boolean): void {
    const orgId = this.store.orgId();
    if (!orgId) {
      return;
    }
    const patch = (value: boolean) =>
      this.conversations.update((list) =>
        (list ?? []).map((x) => (x.id === c.id ? { ...x, legal_hold: value } : x)),
      );
    patch(hold);
    this.api.setLegalHold(orgId, c.id, hold).subscribe({
      error: () => {
        patch(!hold);
        this.fail();
      },
    });
  }

  protected exportPerson(p: UserRef): void {
    const orgId = this.store.orgId();
    if (!orgId) {
      return;
    }
    this.exporting.set(true);
    this.api.exportUser(orgId, p.id).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, `chat-export-${orgId}-${p.id}-${today()}.ndjson`, this.document);
        this.notifications.success('chat.admin.people.exported');
      },
      error: () => {
        this.exporting.set(false);
        this.fail();
      },
    });
  }

  protected exportOrg(): void {
    const orgId = this.store.orgId();
    if (!orgId || !this.rangeValid()) {
      return;
    }
    this.exporting.set(true);
    this.api.exportOrg(orgId, this.after(), this.before()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, `chat-export-${orgId}-org-${today()}.ndjson`, this.document);
      },
      error: () => {
        this.exporting.set(false);
        this.fail();
      },
    });
  }

  protected closeErase(): void {
    this.eraseOpen.set(false);
    this.typedName.set('');
  }

  protected erase(): void {
    const orgId = this.store.orgId();
    const p = this.person()[0];
    if (!orgId || !p) {
      return;
    }
    this.erasing.set(true);
    this.api.eraseUser(orgId, p.id).subscribe({
      next: (res) => {
        this.erasing.set(false);
        this.closeErase();
        this.person.set([]);
        this.notifications.success('chat.admin.people.erased', { count: res.messages_erased });
      },
      error: () => {
        this.erasing.set(false);
        this.closeErase();
        this.fail();
      },
    });
  }

  private fail(): void {
    this.notifications.error('chat.admin.error');
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
