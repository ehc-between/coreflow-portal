import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { EntityRefDto } from '../../../core/entities/entity.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { FeedbackApi } from '../data/feedback-api';
import {
  feedbackActionKey,
  feedbackChannelKey,
  feedbackKindKey,
  feedbackKindTone,
  feedbackSentimentKey,
  feedbackSeverityKey,
  feedbackStatusKey,
  feedbackStatusTone,
  sentimentTone,
  severityTone,
} from '../data/feedback-display';
import { feedbackErrorKey } from '../data/feedback-errors';
import {
  FEEDBACK_ENTITY,
  Feedback,
  FeedbackAction,
  FeedbackActionBody,
  PERM_WRITE,
} from '../data/feedback.models';
import { FeedbackLessonLink } from '../lesson-link';
import { FeedbackDeviations } from './feedback-deviations';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> i18n key (for the revisions tab). */
export const FEEDBACK_FIELD_LABELS: Readonly<Record<string, string>> = {
  kind: 'feedback.fields.kind',
  channel: 'feedback.fields.channel',
  status: 'feedback.fields.status',
  severity: 'feedback.fields.severity',
  sentiment: 'feedback.fields.sentiment',
  title: 'feedback.fields.title',
  description: 'feedback.fields.description',
  category: 'feedback.fields.category',
  tags: 'feedback.fields.tags',
  customer_name: 'feedback.fields.customerName',
  customer_organisation: 'feedback.fields.customerOrganisation',
  customer_email: 'feedback.fields.customerEmail',
  customer_phone: 'feedback.fields.customerPhone',
  product_or_service: 'feedback.fields.productOrService',
  satisfaction_score: 'feedback.fields.satisfactionScore',
  received_on: 'feedback.fields.receivedOn',
  response_due_on: 'feedback.fields.responseDueOn',
  owner_user_id: 'feedback.fields.owner',
  department_id: 'feedback.fields.department',
  resolution: 'feedback.fields.resolution',
  customer_informed: 'feedback.fields.customerInformed',
};

/** Actions that open a dialog (resolution / note) before they run. */
const DIALOG_ACTIONS: readonly FeedbackAction[] = ['resolve', 'close', 'reopen'];

/**
 * One feedback record (`/feedback/items/:id`): the customer's message, how it is
 * handled (acknowledge, start, resolve, close, reopen), linked deviations, a
 * drafted reply, follow-up tasks, and the shared record kit (related items,
 * activity, comments, attachments, revisions).
 */
@Component({
  selector: 'app-feedback-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    WatchButton,
    AiAssistButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    FeedbackDeviations,
    FeedbackLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
          {{ 'feedback.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          <a routerLink="/feedback" class="mt-4 inline-block text-[13px] font-semibold text-accent">
            {{ 'feedback.common.backToList' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (feedback(); as f) {
          <app-record-detail-layout
            [entityType]="entityType"
            [entityId]="f.id"
            [tabs]="tabs"
            [canEdit]="f.can_edit"
            [fieldLabels]="fieldLabels"
            backLink="/feedback"
            backLabelKey="feedback.common.backToList"
          >
            <div header>
              <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
                <span class="font-mono font-semibold">{{ f.code }}</span>
                <span>{{ channelKey(f.channel) | transloco }}</span>
                @if (f.category) {
                  <span>{{ f.category }}</span>
                }
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="feedback-heading"
              >
                {{ f.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="kindTone(f.kind)" data-testid="feedback-kind">{{
                  kindKey(f.kind) | transloco
                }}</app-badge>
                <app-badge [tone]="statusTone(f.status)" data-testid="feedback-status">{{
                  statusKey(f.status) | transloco
                }}</app-badge>
                @if (f.severity) {
                  <app-badge [tone]="severityTone(f.severity)">{{
                    severityKey(f.severity) | transloco
                  }}</app-badge>
                }
                @if (f.sentiment) {
                  <app-badge [tone]="sentimentTone(f.sentiment)">{{
                    sentimentKey(f.sentiment) | transloco
                  }}</app-badge>
                }
                @if (f.overdue) {
                  <app-badge tone="fail">
                    <app-icon name="alert" [size]="12" />
                    {{ 'feedback.common.overdue' | transloco }}
                  </app-badge>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button [entityType]="entityType" [entityId]="f.id" />
              <app-ask-about [prompt]="'feedback.ask.summarise' | transloco" />
              @if (f.can_edit) {
                <a
                  [routerLink]="['/feedback/items', f.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="feedback-edit"
                >
                  {{ 'feedback.common.edit' | transloco }}
                </a>
              }
              @if (f.can_delete) {
                <app-button variant="ghost" size="sm" (click)="deleting.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'feedback.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-6">
              <app-guide-intro scope="feedback" page="detail" />

              @if (f.status === 'closed') {
                <app-alert tone="info">{{ 'feedback.detail.closedNotice' | transloco }}</app-alert>
              }

              @if (f.allowed_actions.length) {
                <app-card>
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p class="text-[13px] text-fg-muted">
                      {{ 'feedback.workflow.hint.' + f.status | transloco }}
                    </p>
                    <div class="flex flex-wrap gap-2" data-testid="feedback-actions">
                      @for (a of f.allowed_actions; track a) {
                        <span [attr.data-testid]="'action-' + a">
                          <app-button
                            size="sm"
                            [variant]="a === 'reopen' ? 'secondary' : 'primary'"
                            [disabled]="acting()"
                            (click)="startAction(a)"
                          >
                            {{ actionKey(a) | transloco }}
                          </app-button>
                        </span>
                      }
                    </div>
                  </div>
                  @if (f.kind === 'complaint' && f.status !== 'resolved' && f.status !== 'closed') {
                    <p class="mt-2 text-[12.5px] text-fg-subtle">
                      {{ 'feedback.workflow.complaintRule' | transloco }}
                    </p>
                  }
                </app-card>
              }

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'feedback.detail.message' | transloco }}
                </h2>
                @if (f.description) {
                  <p
                    class="text-[13.5px] whitespace-pre-line text-fg"
                    data-testid="feedback-description"
                  >
                    {{ f.description }}
                  </p>
                } @else {
                  <p class="text-[13px] text-fg-subtle">
                    {{ 'feedback.detail.noDescription' | transloco }}
                  </p>
                }
                @if (f.tags.length) {
                  <ul
                    class="mt-3 flex flex-wrap gap-1.5"
                    [attr.aria-label]="'feedback.fields.tags' | transloco"
                  >
                    @for (t of f.tags; track t) {
                      <li>
                        <app-badge tone="neutral">{{ t }}</app-badge>
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'feedback.detail.customer' | transloco }}
                </h2>
                <dl
                  class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div>
                    <dt class="text-fg-subtle">{{ 'feedback.fields.customerName' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ f.customer_name ?? ('feedback.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'feedback.fields.customerOrganisation' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ f.customer_organisation ?? ('feedback.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'feedback.fields.customerEmail' | transloco }}
                    </dt>
                    <dd class="break-all text-fg">
                      @if (f.customer_email) {
                        <a
                          class="text-accent hover:underline"
                          [href]="'mailto:' + f.customer_email"
                          >{{ f.customer_email }}</a
                        >
                      } @else {
                        {{ 'feedback.common.none' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'feedback.fields.customerPhone' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ f.customer_phone ?? ('feedback.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'feedback.fields.productOrService' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ f.product_or_service ?? ('feedback.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'feedback.fields.satisfactionScore' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        f.satisfaction_score
                          ? ('feedback.form.scoreOption.' + f.satisfaction_score | transloco)
                          : ('feedback.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  @if (f.survey_id) {
                    <div>
                      <dt class="text-fg-subtle">{{ 'feedback.detail.fromSurvey' | transloco }}</dt>
                      <dd>
                        <a
                          [routerLink]="['/feedback/surveys', f.survey_id]"
                          class="font-semibold text-accent hover:underline"
                        >
                          {{ 'feedback.detail.openSurvey' | transloco }}
                        </a>
                      </dd>
                    </div>
                  }
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-3 flex items-center gap-1 font-display text-[15px] font-bold text-fg">
                  {{ 'feedback.detail.resolution' | transloco }}
                  <app-ask-about
                    [prompt]="'feedback.ask.resolution' | transloco"
                    field="resolution"
                  />
                </h2>
                @if (f.resolution) {
                  <p
                    class="text-[13.5px] whitespace-pre-line text-fg"
                    data-testid="feedback-resolution"
                  >
                    {{ f.resolution }}
                  </p>
                } @else {
                  <p class="text-[13px] text-fg-subtle">
                    {{ 'feedback.detail.noResolution' | transloco }}
                  </p>
                }
                <p
                  class="mt-3 flex items-center gap-1.5 text-[13px]"
                  [class.text-pass]="f.customer_informed"
                  [class.text-fg-muted]="!f.customer_informed"
                >
                  <app-icon [name]="f.customer_informed ? 'checkcircle' : 'clock'" [size]="14" />
                  {{
                    (f.customer_informed
                      ? 'feedback.detail.informed'
                      : 'feedback.detail.notInformed'
                    ) | transloco
                  }}
                </p>
              </app-card>

              @if (canDraftReply()) {
                <app-card>
                  <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 class="font-display text-[15px] font-bold text-fg">
                      {{ 'feedback.reply.title' | transloco }}
                    </h2>
                    <app-ai-assist-button
                      assist="feedback.draft_reply"
                      labelKey="feedback.reply.run"
                      [entityType]="entityType"
                      [entityId]="f.id"
                      [input]="{ notes: replyNotes().trim() || null }"
                      (text)="reply.set($event)"
                    />
                  </div>
                  <p class="mb-2 text-[12.5px] text-fg-muted">
                    {{ 'feedback.reply.intro' | transloco }}
                  </p>
                  <label for="cf-fb-reply-notes" class="sr-only">{{
                    'feedback.reply.notesLabel' | transloco
                  }}</label>
                  <input
                    id="cf-fb-reply-notes"
                    type="text"
                    maxlength="2000"
                    class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-accent"
                    [placeholder]="'feedback.reply.notesPlaceholder' | transloco"
                    [value]="replyNotes()"
                    (input)="replyNotes.set($any($event.target).value)"
                  />
                  @if (reply(); as text) {
                    <div
                      class="mt-3 rounded-tile border border-border bg-surface-2 p-3"
                      aria-live="polite"
                    >
                      <p
                        class="mb-1 text-[11.5px] font-semibold tracking-wide text-fg-subtle uppercase"
                      >
                        {{ 'feedback.reply.generated' | transloco }}
                      </p>
                      <p class="text-[13.5px] whitespace-pre-line text-fg" data-testid="reply-text">
                        {{ text }}
                      </p>
                      <div class="mt-2 flex gap-2">
                        <app-button size="sm" variant="secondary" (click)="copyReply(text)">
                          {{ 'feedback.reply.copy' | transloco }}
                        </app-button>
                        <app-button size="sm" variant="ghost" (click)="reply.set('')">
                          {{ 'feedback.reply.discard' | transloco }}
                        </app-button>
                      </div>
                    </div>
                  }
                </app-card>
              }

              <app-card>
                <app-feedback-deviations
                  [feedbackId]="f.id"
                  [links]="f.linked_deviations"
                  [canEdit]="f.can_edit"
                  [isComplaint]="f.kind === 'complaint'"
                  (changed)="onDeviationsChanged($event)"
                />
              </app-card>
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="entityType"
                [entityId]="f.id"
                [canCreate]="f.can_edit"
                [entityLabel]="f.code + ' ' + f.title"
              />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 text-[13px] font-semibold text-fg-subtle">
                  {{ 'feedback.detail.handling' | transloco }}
                </h2>
                <dl class="flex flex-col gap-2 text-[13px]">
                  <div>
                    <dt class="text-fg-subtle">{{ 'feedback.fields.receivedOn' | transloco }}</dt>
                    <dd class="text-fg">{{ f.received_on | localDay }}</dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'feedback.fields.responseDueOn' | transloco }}
                    </dt>
                    <dd
                      [class.text-fail]="f.overdue"
                      [class.font-semibold]="f.overdue"
                      class="text-fg"
                      data-testid="feedback-due"
                    >
                      {{
                        f.response_due_on
                          ? (f.response_due_on | localDay)
                          : ('feedback.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'feedback.fields.owner' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ f.owner?.name ?? ('feedback.common.none' | transloco) }}
                    </dd>
                  </div>
                  @if (f.created_by?.name; as by) {
                    <div>
                      <dt class="text-fg-subtle">{{ 'feedback.fields.createdBy' | transloco }}</dt>
                      <dd class="text-fg">{{ by }}</dd>
                    </div>
                  }
                  @if (f.acknowledged_at) {
                    <div>
                      <dt class="text-fg-subtle">
                        {{ 'feedback.fields.acknowledgedAt' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ f.acknowledged_at | localDate }}</dd>
                    </div>
                  }
                  @if (f.resolved_at) {
                    <div>
                      <dt class="text-fg-subtle">{{ 'feedback.fields.resolvedAt' | transloco }}</dt>
                      <dd class="text-fg">{{ f.resolved_at | localDate }}</dd>
                    </div>
                  }
                  @if (f.closed_at) {
                    <div>
                      <dt class="text-fg-subtle">{{ 'feedback.fields.closedAt' | transloco }}</dt>
                      <dd class="text-fg">{{ f.closed_at | localDate }}</dd>
                    </div>
                  }
                </dl>
                <p class="mt-3 text-[12.5px] text-fg-muted">
                  {{ 'feedback.detail.openTasks' | transloco: { count: f.open_tasks } }}
                </p>
              </app-card>
              <app-supports-requirements [entityType]="entityType" [entityId]="f.id" />
              <app-why-it-matters scope="feedback" page="detail" />
              <div class="flex flex-col items-start gap-1">
                <app-feedback-lesson-link lesson="handling-complaints" />
              </div>
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="!!pending()"
            [title]="(pending() ? 'feedback.actionDialog.titles.' + pending() : '') | transloco"
            [message]="(pending() ? 'feedback.actionDialog.messages.' + pending() : '') | transloco"
            [confirmLabel]="(pending() ? actionKey(pending()!) : '') | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            confirmVariant="primary"
            [busy]="acting()"
            [confirmDisabled]="resolutionMissing()"
            initialFocus="textarea"
            (confirmed)="confirmAction()"
            (cancelled)="pending.set(null)"
          >
            <div class="mt-3 flex flex-col gap-3">
              @if (pending() === 'resolve') {
                <div>
                  <label
                    for="cf-fb-act-resolution"
                    class="mb-1 block text-[13px] font-semibold text-fg-muted"
                  >
                    {{ 'feedback.fields.resolution' | transloco }}
                    @if (f.kind === 'complaint') {
                      <span class="text-fail">*</span>
                    }
                  </label>
                  <textarea
                    id="cf-fb-act-resolution"
                    rows="4"
                    maxlength="20000"
                    class="w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] text-fg outline-none focus:border-accent"
                    [value]="actionResolution()"
                    (input)="actionResolution.set($any($event.target).value)"
                    data-testid="action-resolution"
                  ></textarea>
                </div>
                <label class="inline-flex items-center gap-2 text-[13px] text-fg">
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [checked]="actionInformed()"
                    (change)="actionInformed.set($any($event.target).checked)"
                  />
                  {{ 'feedback.fields.customerInformed' | transloco }}
                </label>
              } @else {
                <div>
                  <label
                    for="cf-fb-act-note"
                    class="mb-1 block text-[13px] font-semibold text-fg-muted"
                  >
                    {{ 'feedback.actionDialog.note' | transloco }}
                  </label>
                  <textarea
                    id="cf-fb-act-note"
                    rows="3"
                    maxlength="2000"
                    class="w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] text-fg outline-none focus:border-accent"
                    [value]="actionNote()"
                    (input)="actionNote.set($any($event.target).value)"
                    data-testid="action-note"
                  ></textarea>
                </div>
              }
            </div>
          </app-confirm-dialog>

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'feedback.detail.deleteTitle' | transloco"
            [message]="'feedback.detail.deleteMessage' | transloco: { code: f.code }"
            [confirmLabel]="'feedback.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
        }
      }
    }
  `,
})
export class FeedbackDetail {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly entityType = FEEDBACK_ENTITY;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = FEEDBACK_FIELD_LABELS;
  protected readonly statusKey = feedbackStatusKey;
  protected readonly statusTone = feedbackStatusTone;
  protected readonly kindKey = feedbackKindKey;
  protected readonly kindTone = feedbackKindTone;
  protected readonly channelKey = feedbackChannelKey;
  protected readonly severityKey = feedbackSeverityKey;
  protected readonly severityTone = severityTone;
  protected readonly sentimentKey = feedbackSentimentKey;
  protected readonly sentimentTone = sentimentTone;
  protected readonly actionKey = feedbackActionKey;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('feedback.common.loadFailed');
  protected readonly feedback = signal<Feedback | null>(null);
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);

  protected readonly pending = signal<FeedbackAction | null>(null);
  protected readonly actionResolution = signal('');
  protected readonly actionInformed = signal(false);
  protected readonly actionNote = signal('');
  protected readonly resolutionMissing = computed(() => {
    const f = this.feedback();
    return (
      !!f &&
      this.pending() === 'resolve' &&
      f.kind === 'complaint' &&
      !this.actionResolution().trim()
    );
  });

  protected readonly replyNotes = signal('');
  protected readonly reply = signal('');
  protected readonly canDraftReply = computed(
    () =>
      (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE) &&
      this.feedback()?.status !== 'closed',
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const f = this.feedback();
      return {
        module: 'feedback',
        entityType: FEEDBACK_ENTITY,
        entityId: this.id(),
        view: 'detail',
        title: f ? `${f.code} ${f.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
  }

  protected startAction(action: FeedbackAction): void {
    const f = this.feedback();
    if (!f) {
      return;
    }
    if (!DIALOG_ACTIONS.includes(action)) {
      this.run(action, {});
      return;
    }
    this.actionResolution.set(f.resolution ?? '');
    this.actionInformed.set(f.customer_informed);
    this.actionNote.set('');
    this.pending.set(action);
  }

  protected confirmAction(): void {
    const action = this.pending();
    const f = this.feedback();
    if (!action || !f || this.resolutionMissing()) {
      return;
    }
    const body: FeedbackActionBody =
      action === 'resolve'
        ? {
            resolution: this.actionResolution().trim() || null,
            customer_informed: this.actionInformed(),
          }
        : { note: this.actionNote().trim() || null };
    this.run(action, body);
  }

  protected onDeviationsChanged(items: readonly EntityRefDto[]): void {
    const f = this.feedback();
    if (f) {
      this.feedback.set({ ...f, linked_deviations: items });
    }
  }

  protected copyReply(text: string): void {
    void navigator.clipboard?.writeText(text).then(
      () => this.notifications.success('feedback.reply.copied'),
      () => this.notifications.error('feedback.reply.copyFailed'),
    );
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const f = this.feedback();
    if (!orgId || !f) {
      return;
    }
    this.acting.set(true);
    this.api.delete(orgId, f.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deleting.set(false);
        this.notifications.success('feedback.notices.deleted', { code: f.code });
        void this.router.navigate(['/feedback']);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  private run(action: FeedbackAction, body: FeedbackActionBody): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.action(orgId, this.id(), action, body).subscribe({
      next: (feedback) => {
        this.acting.set(false);
        this.pending.set(null);
        this.feedback.set(feedback);
        this.notifications.success(`feedback.notices.actions.${action}`, { code: feedback.code });
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string, initial: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (initial) {
      this.state.set('loading');
    }
    this.request = this.api.get(orgId, id).subscribe({
      next: (feedback) => {
        this.feedback.set(feedback);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(feedbackErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
