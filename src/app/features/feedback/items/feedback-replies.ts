import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { FeedbackApi } from '../data/feedback-api';
import { isoDay, replyChannelKey } from '../data/feedback-display';
import { feedbackErrorKey } from '../data/feedback-errors';
import {
  FEEDBACK_ENTITY,
  FeedbackChannel,
  REPLY_CHANNELS,
  Reply,
  ReplyChannel,
} from '../data/feedback.models';

/** The reply channel that matches how the feedback came in (phone in, phone back). */
export function defaultReplyChannel(channel: FeedbackChannel): ReplyChannel {
  switch (channel) {
    case 'phone':
    case 'in_person':
    case 'web':
    case 'email':
      return channel;
    default:
      return 'email';
  }
}

let nextId = 0;

/**
 * The reply log ("Svar til kunden"): what was told to the customer, when and how.
 * "Logg svar til kunden" records a reply (date, channel, text); the assistant can
 * draft the text first. Logging a reply marks the customer as informed and adds a
 * timeline event, so an auditor can see the communication (ISO 9001 8.2.1).
 */
@Component({
  selector: 'app-feedback-replies',
  imports: [TranslocoPipe, LocalDayPipe, AiAssistButton, Button, ConfirmDialog, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="headingId" data-testid="feedback-replies">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 [id]="headingId" class="font-display text-card font-bold text-fg">
          {{ 'feedback.replies.title' | transloco }}
        </h2>
        @if (canEdit()) {
          <app-button size="sm" variant="secondary" (click)="open()" data-testid="log-reply">
            <app-icon name="plus" [size]="14" />
            {{ 'feedback.replies.log' | transloco }}
          </app-button>
        }
      </div>
      @if (replies().length === 0) {
        <p class="text-ui text-fg-muted" data-testid="no-replies">
          {{ (informed() ? 'feedback.replies.noneInformed' : 'feedback.replies.none') | transloco }}
        </p>
      } @else {
        <ol class="flex flex-col gap-3" data-testid="reply-list">
          @for (r of replies(); track r.id) {
            <li class="rounded-tile border border-border p-3">
              <div
                class="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-fg-muted"
              >
                <span class="font-semibold text-fg">{{ r.sent_on | localDay }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ channelKey(r.channel) | transloco }}</span>
                @if (r.created_by?.name; as by) {
                  <span aria-hidden="true">·</span>
                  <span>{{ 'feedback.replies.by' | transloco: { name: by } }}</span>
                }
                @if (canEdit()) {
                  <button
                    type="button"
                    class="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    [attr.aria-label]="'feedback.replies.delete' | transloco"
                    (click)="deleting.set(r)"
                  >
                    <app-icon name="trash" [size]="14" />
                  </button>
                }
              </div>
              <p class="text-body whitespace-pre-line text-fg">{{ r.body }}</p>
            </li>
          }
        </ol>
      }
    </section>

    <app-confirm-dialog
      [open]="logging()"
      [title]="'feedback.replies.dialogTitle' | transloco"
      [message]="'feedback.replies.dialogMessage' | transloco"
      [confirmLabel]="'feedback.replies.save' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy()"
      [confirmDisabled]="!body().trim() || futureDate()"
      initialFocus="textarea"
      (confirmed)="save()"
      (cancelled)="logging.set(false)"
    >
      <div class="mt-3 flex flex-col gap-3">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <app-form-field [label]="'feedback.replies.sentOn' | transloco" [inputId]="dateId">
              <input
                [id]="dateId"
                type="date"
                [max]="today"
                [value]="sentOn()"
                (change)="sentOn.set($any($event.target).value)"
                [attr.aria-invalid]="futureDate() || null"
              />
            </app-form-field>
            @if (futureDate()) {
              <p class="mt-1 text-meta text-fail">{{ 'feedback.replies.future' | transloco }}</p>
            }
          </div>
          <app-form-field [label]="'feedback.replies.channel' | transloco" [inputId]="channelId">
            <select [id]="channelId" (change)="channel.set($any($event.target).value)">
              @for (c of channels; track c) {
                <option [value]="c" [selected]="channel() === c">
                  {{ channelKey(c) | transloco }}
                </option>
              }
            </select>
          </app-form-field>
        </div>
        <div>
          <div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label [attr.for]="bodyId" class="text-ui font-semibold text-fg-muted">
              {{ 'feedback.replies.body' | transloco }}
            </label>
            <app-ai-assist-button
              assist="feedback.draft_reply"
              labelKey="feedback.reply.run"
              [entityType]="entityType"
              [entityId]="feedbackId()"
              [input]="{ notes: body().trim() || null }"
              (text)="body.set($event)"
            />
          </div>
          <textarea
            [id]="bodyId"
            rows="6"
            maxlength="20000"
            class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-body text-fg outline-none focus:border-accent"
            [value]="body()"
            (input)="body.set($any($event.target).value)"
            [placeholder]="'feedback.replies.bodyPlaceholder' | transloco"
            data-testid="reply-body"
          ></textarea>
          <p class="mt-1 text-meta text-fg-subtle">{{ 'feedback.replies.bodyHint' | transloco }}</p>
        </div>
      </div>
    </app-confirm-dialog>

    <app-confirm-dialog
      [open]="!!deleting()"
      [title]="'feedback.replies.deleteTitle' | transloco"
      [message]="'feedback.replies.deleteMessage' | transloco"
      [confirmLabel]="'feedback.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(null)"
    />
  `,
})
export class FeedbackReplies {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly feedbackId = input.required<string>();
  readonly replies = input<readonly Reply[]>([]);
  readonly canEdit = input(false);
  readonly informed = input(false);
  /** How the feedback came in: the default reply channel. */
  readonly sourceChannel = input<FeedbackChannel>('email');
  /** The log changed: the page reloads the record (customer informed, timeline). */
  readonly changed = output<void>();

  private readonly uid = ++nextId;
  protected readonly headingId = `cf-fb-replies-${this.uid}`;
  protected readonly dateId = `cf-fb-reply-date-${this.uid}`;
  protected readonly channelId = `cf-fb-reply-channel-${this.uid}`;
  protected readonly bodyId = `cf-fb-reply-body-${this.uid}`;
  protected readonly entityType = FEEDBACK_ENTITY;
  protected readonly channels = REPLY_CHANNELS;
  protected readonly channelKey = replyChannelKey;
  protected readonly today = isoDay(new Date());

  protected readonly logging = signal(false);
  protected readonly busy = signal(false);
  protected readonly deleting = signal<Reply | null>(null);
  protected readonly sentOn = signal(this.today);
  protected readonly channel = signal<ReplyChannel>('email');
  protected readonly body = signal('');

  protected futureDate(): boolean {
    return !!this.sentOn() && this.sentOn() > this.today;
  }

  /** Open the dialog, optionally with a drafted text. */
  open(draft = ''): void {
    this.sentOn.set(this.today);
    this.channel.set(defaultReplyChannel(this.sourceChannel()));
    this.body.set(draft);
    this.logging.set(true);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const text = this.body().trim();
    if (!orgId || !text || this.busy() || this.futureDate()) {
      return;
    }
    this.busy.set(true);
    this.api
      .addReply(orgId, this.feedbackId(), {
        sent_on: this.sentOn() || null,
        channel: this.channel(),
        body: text,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.logging.set(false);
          this.notifications.success('feedback.notices.replyLogged');
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(feedbackErrorKey(error));
        },
      });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const reply = this.deleting();
    if (!orgId || !reply || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteReply(orgId, this.feedbackId(), reply.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(null);
        this.notifications.success('feedback.notices.replyDeleted');
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }
}
