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
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { EntityRefDto } from '../../../core/entities/entity.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RequirementLink } from '../../../core/standards/standards.models';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AskPanelService } from '../../ask/ask-panel.service';
import { recordIcon } from '../../ask/ask-icons';
import { FeedbackApi } from '../data/feedback-api';
import {
  feedbackActionKey,
  feedbackChannelKey,
  feedbackKindKey,
  feedbackSentimentKey,
  feedbackSeverityKey,
  feedbackStatusKey,
} from '../data/feedback-display';
import { feedbackErrorKey } from '../data/feedback-errors';
import { YesNo, fromYesNo, toSubjects, yesNo } from '../data/feedback-form-model';
import {
  FEEDBACK_ENTITY,
  Feedback,
  FeedbackAction,
  FeedbackActionBody,
  PERM_WRITE,
} from '../data/feedback.models';
import { FEEDBACK_STATUS_TONE, FeedbackTodo, feedbackTodos } from '../feedback-anatomy';
import { FEEDBACK_SETTINGS_LINK } from '../feedback-nav';
import { FeedbackSubjectPicker } from '../subject-picker';
import { FeedbackAssessment, YES_NO_OPTIONS } from './feedback-assessment';
import { DEVIATION_FLOW, FeedbackDeviations } from './feedback-deviations';
import { FeedbackReplies } from './feedback-replies';

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
  complaint_justified: 'feedback.assessment.justified',
  root_cause: 'feedback.assessment.rootCause',
  corrective_action_required: 'feedback.assessment.correctiveAction',
  customer_accepted: 'feedback.assessment.customerAccepted',
};

/** The recommended next step: the backend's `next_action`, else the first allowed one. */
export function primaryAction(
  f: Pick<Feedback, 'allowed_actions' | 'next_action'>,
): FeedbackAction | null {
  if (f.next_action && f.allowed_actions.includes(f.next_action)) {
    return f.next_action;
  }
  return f.allowed_actions.find((a) => a !== 'reopen') ?? null;
}

/** The customer details that are filled in, as label key + value. */
export function customerFields(
  f: Feedback,
): { key: string; labelKey: string; value: string; href?: string }[] {
  const rows: { key: string; labelKey: string; value: string; href?: string }[] = [];
  const add = (key: string, labelKey: string, value: string | null, href?: string) => {
    if (value && value.trim()) {
      rows.push({ key, labelKey, value, href });
    }
  };
  add('name', 'feedback.fields.customerName', f.customer_name);
  add('organisation', 'feedback.fields.customerOrganisation', f.customer_organisation);
  add(
    'email',
    'feedback.fields.customerEmail',
    f.customer_email,
    f.customer_email ? `mailto:${f.customer_email}` : undefined,
  );
  add('phone', 'feedback.fields.customerPhone', f.customer_phone);
  return rows;
}

/**
 * One feedback record (`/feedback/items/:id`) in the detail-page anatomy
 * (docs/ux-guide.md §2.7): one calm meta line (code · kind · status), the next step
 * as the one primary button (the other steps under "Mer"; every step asks first),
 * assistant actions in "Spør KI"; "Hovedinformasjon" with what the customer said,
 * who the customer is, what it is about (linked records with type, code, title and
 * status) and how it was resolved; the complaint assessment, the reply log, linked
 * deviations and the remaining fields (empty ones hidden) in Detaljer; one
 * "Oppfølging" card with what is still missing, requirements, connections, the
 * survey it came from and the handling metadata.
 */
@Component({
  selector: 'app-feedback-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    SupportsRequirements,
    EntityTasks,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    StatusBadge,
    FeedbackAssessment,
    FeedbackDeviations,
    FeedbackReplies,
    FeedbackSubjectPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-8 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-error-state [bodyKey]="errorKey()" (retry)="reload()" />
          <a routerLink="/feedback" class="mt-4 inline-block text-ui font-semibold text-accent">
            {{ 'feedback.common.backToList' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (feedback(); as f) {
          <app-record-detail-layout
            [anatomy]="true"
            [entityType]="entityType"
            [entityId]="f.id"
            [title]="f.title"
            [breadcrumbs]="[
              { labelKey: 'modules.names.feedback', link: '/feedback' },
              { label: f.code },
            ]"
            [settingsLink]="settingsLink"
            [tabs]="tabs"
            [counts]="{ tasks: f.open_tasks }"
            [canEdit]="f.can_edit"
            [fieldLabels]="fieldLabels"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono" data-testid="feedback-code">{{ f.code }}</span>
              <span aria-hidden="true">·</span>
              <span data-testid="feedback-kind">{{ kindKey(f.kind) | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="f.status"
                [labelKey]="statusKey(f.status)"
                data-testid="feedback-status"
              />
              @if (f.overdue) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="feedback.detail.replyOverdue"
                />
              }
            </ng-container>

            @if (primary(); as a) {
              <app-button
                primary
                [variant]="a === 'reopen' ? 'secondary' : 'primary'"
                [disabled]="acting()"
                (click)="startAction(a)"
                [attr.data-testid]="'action-' + a"
              >
                {{ actionKey(a) | transloco }}
              </app-button>
            }
            @if (f.can_edit) {
              <app-button
                secondary
                variant="secondary"
                (click)="edit()"
                data-testid="feedback-edit"
              >
                {{ 'feedback.common.edit' | transloco }}
              </app-button>
            }
            @for (a of others(); track a) {
              <button
                appMenuItem
                overflow
                type="button"
                (click)="startAction(a)"
                [attr.data-testid]="'action-' + a"
              >
                {{ actionKey(a) | transloco }}
              </button>
            }
            @if (f.can_delete) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="deleting.set(true)"
                data-testid="feedback-delete"
              >
                <app-icon name="trash" [size]="14" />
                {{ 'feedback.common.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAi('summarise')">
              <app-icon name="spark" [size]="15" />
              {{ 'feedback.detail.ai.summarise' | transloco }}
            </button>
            @if (f.status !== 'closed') {
              <button appMenuItem ask type="button" (click)="askAi('resolution')">
                <app-icon name="spark" [size]="15" />
                {{ 'feedback.detail.ai.resolution' | transloco }}
              </button>
            }
            @if (f.kind === 'complaint') {
              <button appMenuItem ask type="button" (click)="askAi('assessment')">
                <app-icon name="spark" [size]="15" />
                {{ 'feedback.detail.ai.assessment' | transloco }}
              </button>
            }

            <app-help-strip help scope="feedback" page="detail" lesson="handling-complaints" />

            <app-record-lead record-lead [fillLink]="f.can_edit ? editLink() : null">
              <app-record-status-line status [tone]="statusTone()" data-testid="workflow-hint">
                {{ 'feedback.detail.status.' + f.status | transloco }}
              </app-record-status-line>
              <app-field-item
                size="lead"
                labelKey="feedback.detail.lead.message"
                [wide]="true"
                [value]="f.description"
                [multiline]="true"
                data-testid="feedback-description"
              />
              <app-field-item size="lead" labelKey="feedback.detail.lead.customer">
                @if (customer().length) {
                  <span class="flex flex-col gap-0.5" data-testid="feedback-customer">
                    @for (c of customer(); track c.key) {
                      @if (c.href) {
                        <a
                          class="text-ui font-semibold text-accent hover:underline"
                          [href]="c.href"
                          >{{ c.value }}</a
                        >
                      } @else if (c.key === 'name') {
                        <span>{{ c.value }}</span>
                      } @else {
                        <span class="text-ui text-fg-muted">{{ c.value }}</span>
                      }
                    }
                  </span>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="feedback.detail.lead.about">
                @if (editingSubjects()) {
                  <span class="block text-ui" data-testid="feedback-subjects-editor">
                    <app-feedback-subject-picker
                      [picked]="subjectDraft()"
                      (selected)="addSubject($event)"
                      (removed)="removeSubject($event)"
                    />
                    <span class="mt-3 flex flex-wrap justify-end gap-2">
                      <app-button variant="ghost" size="sm" (click)="editingSubjects.set(false)">
                        {{ 'common.cancel' | transloco }}
                      </app-button>
                      <app-button
                        size="sm"
                        [loading]="acting()"
                        [disabled]="acting()"
                        (click)="saveSubjects()"
                        data-testid="save-subjects"
                      >
                        {{ 'feedback.subjects.save' | transloco }}
                      </app-button>
                    </span>
                  </span>
                } @else if (f.subjects.length) {
                  <ul class="flex flex-col gap-1.5 text-ui" data-testid="subject-list">
                    @for (s of f.subjects; track s.entity_type + s.entity_id) {
                      <li class="flex min-w-0 items-start gap-2">
                        <app-icon
                          [name]="iconFor(s)"
                          [size]="15"
                          class="mt-0.5 flex-none text-fg-muted"
                        />
                        <app-entity-chip [ref]="s" [statusText]="true" [stacked]="true" />
                      </li>
                    }
                  </ul>
                  @if (f.can_edit) {
                    <button
                      type="button"
                      class="mt-1.5 text-meta font-semibold text-accent hover:underline"
                      (click)="editSubjects()"
                      data-testid="edit-subjects"
                    >
                      {{ 'feedback.detail.lead.changeAbout' | transloco }}
                    </button>
                  }
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="feedback.detail.lead.resolution" [wide]="true">
                @if (f.resolution) {
                  <span class="block whitespace-pre-line" data-testid="feedback-resolution">{{
                    f.resolution
                  }}</span>
                  <span
                    class="mt-2 flex items-center gap-1.5 text-ui font-normal"
                    [class.text-pass-ink]="f.customer_informed"
                    [class.text-fg-muted]="!f.customer_informed"
                    data-testid="feedback-informed"
                  >
                    <app-icon [name]="f.customer_informed ? 'checkcircle' : 'clock'" [size]="14" />
                    {{
                      (f.customer_informed
                        ? 'feedback.detail.informed'
                        : 'feedback.detail.notInformed'
                      ) | transloco
                    }}
                  </span>
                }
              </app-field-item>
            </app-record-lead>

            <div class="flex flex-col gap-6">
              @if (f.kind === 'complaint') {
                <app-card>
                  <app-feedback-assessment
                    [feedback]="f"
                    [canEdit]="f.can_edit"
                    (saved)="feedback.set($event)"
                  />
                </app-card>
              }

              <app-card>
                <app-feedback-replies
                  [feedbackId]="f.id"
                  [replies]="f.replies"
                  [canEdit]="canReply()"
                  [informed]="f.customer_informed"
                  [sourceChannel]="f.channel"
                  (changed)="refresh()"
                />
              </app-card>

              <app-card>
                <app-feedback-deviations
                  [feedbackId]="f.id"
                  [links]="f.linked_deviations"
                  [canEdit]="f.can_edit"
                  [isComplaint]="f.kind === 'complaint'"
                  (changed)="onDeviationsChanged($event)"
                />
              </app-card>

              <app-record-details [columns]="3" [fillLink]="f.can_edit ? editLink() : null">
                <app-field-item labelKey="feedback.fields.severity">
                  @if (f.severity) {
                    <app-status-badge
                      meaning="severity"
                      [value]="f.severity"
                      [labelKey]="severityKey(f.severity)"
                    />
                  }
                </app-field-item>
                <app-field-item
                  labelKey="feedback.detail.fields.channel"
                  [value]="channelKey(f.channel) | transloco"
                />
                <app-field-item labelKey="feedback.fields.receivedOn">
                  {{ f.received_on | localDay }}
                </app-field-item>
                <app-field-item
                  labelKey="feedback.fields.category"
                  [value]="f.category"
                  data-testid="feedback-category"
                />
                <app-field-item
                  labelKey="feedback.fields.productOrService"
                  [value]="f.product_or_service"
                />
                <app-field-item labelKey="feedback.fields.satisfactionScore">
                  @if (f.satisfaction_score) {
                    {{ 'feedback.form.scoreOption.' + f.satisfaction_score | transloco }}
                  }
                </app-field-item>
                <app-field-item labelKey="feedback.fields.sentiment">
                  @if (f.sentiment) {
                    {{ sentimentKey(f.sentiment) | transloco }}
                  }
                </app-field-item>
                <app-field-item
                  labelKey="feedback.fields.department"
                  [value]="f.department?.name"
                  data-testid="feedback-department"
                />
                <app-field-item labelKey="feedback.fields.tags" [wide]="true">
                  @if (f.tags.length) {
                    <span class="flex flex-wrap gap-1.5">
                      @for (t of f.tags; track t) {
                        <app-badge tone="neutral">{{ t }}</app-badge>
                      }
                    </span>
                  }
                </app-field-item>
              </app-record-details>
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="entityType"
                [entityId]="f.id"
                [canCreate]="f.can_edit"
                [entityLabel]="f.code + ' ' + f.title"
              />
            </div>

            <app-supports-requirements
              aside-requirements
              [entityType]="entityType"
              [entityId]="f.id"
              [canEdit]="f.can_edit"
              (linksChange)="reqLinks.set($event)"
            />

            @if (f.survey || f.survey_id) {
              <div follow-up-connections class="text-ui" data-testid="feedback-from-survey">
                <p class="mb-1 text-meta font-semibold text-fg-muted">
                  {{ 'feedback.detail.fromSurvey' | transloco }}
                </p>
                @if (f.survey; as sv) {
                  <span class="flex min-w-0 items-center gap-2">
                    <app-icon name="smile" [size]="15" class="flex-none text-fg-muted" />
                    <app-entity-chip [ref]="sv" [showType]="false" [statusText]="true" />
                  </span>
                } @else {
                  <a
                    [routerLink]="['/feedback/surveys', f.survey_id]"
                    class="font-semibold text-accent hover:underline"
                    >{{ 'feedback.detail.openSurvey' | transloco }}</a
                  >
                }
              </div>
            }

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="feedback.fields.owner"
                [value]="f.owner?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="feedback.detail.fields.replyBy"
                [keepEmpty]="f.status !== 'closed' && f.status !== 'resolved'"
                emptyKey="feedback.detail.meta.noDeadline"
                emptyActionKey="feedback.detail.meta.setDeadline"
                [emptyLink]="f.can_edit ? editLink() : null"
              >
                @if (f.response_due_on) {
                  <span
                    [class.text-warn-ink]="f.overdue"
                    [class.font-semibold]="f.overdue"
                    data-testid="feedback-due"
                    >{{ f.response_due_on | localDay }}
                    @if (f.overdue) {
                      · {{ 'feedback.common.overdue' | transloco }}
                    }
                  </span>
                }
              </app-field-item>
              <app-field-item layout="inline" labelKey="feedback.fields.resolvedAt">
                @if (f.resolved_at) {
                  {{ f.resolved_at | localDay }}
                }
              </app-field-item>
              <app-field-item layout="inline" labelKey="feedback.fields.closedAt">
                @if (f.closed_at) {
                  {{ f.closed_at | localDay }}
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="feedback.fields.createdBy"
                [value]="f.created_by?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="feedback.detail.fields.updated"
                [value]="f.updated_at | localDate"
              />
            </app-record-meta>

            <ng-container aside-learn>
              <app-why-it-matters scope="feedback" page="detail" />
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="!!pending()"
            [title]="(pending() ? 'feedback.actionDialog.titles.' + pending() : '') | transloco"
            [message]="dialogMessage() | transloco"
            [confirmLabel]="(pending() ? actionKey(pending()!) : '') | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            confirmVariant="primary"
            [busy]="acting()"
            [confirmDisabled]="resolveBlocked()"
            initialFocus="textarea"
            (confirmed)="confirmAction()"
            (cancelled)="pending.set(null)"
          >
            <div class="mt-3 flex flex-col gap-4">
              @if (pending() === 'resolve') {
                @if (f.kind === 'complaint') {
                  <fieldset>
                    <legend class="mb-1.5 text-ui font-semibold text-fg-muted">
                      {{ 'feedback.assessment.justified' | transloco }}
                      <span class="text-fail" aria-hidden="true">*</span>
                    </legend>
                    <div class="flex flex-wrap gap-2" role="radiogroup">
                      @for (o of yesNoOptions; track o) {
                        <label [class]="choiceClass(actionJustified() === o)">
                          <input
                            type="radio"
                            class="sr-only"
                            name="cf-fb-act-justified"
                            [checked]="actionJustified() === o"
                            (change)="actionJustified.set(o)"
                            [attr.data-testid]="'resolve-justified-' + o"
                          />
                          {{ 'feedback.assessment.answers.' + o | transloco }}
                        </label>
                      }
                    </div>
                    @if (!actionJustified()) {
                      <p class="mt-1 text-meta text-fg-muted">
                        {{ 'feedback.actionDialog.justifiedHint' | transloco }}
                      </p>
                    }
                  </fieldset>
                }
                <div>
                  <label
                    for="cf-fb-act-resolution"
                    class="mb-1 block text-ui font-semibold text-fg-muted"
                  >
                    {{ 'feedback.fields.resolution' | transloco }}
                    @if (f.kind === 'complaint') {
                      <span class="text-fail" aria-hidden="true">*</span>
                    }
                  </label>
                  <textarea
                    id="cf-fb-act-resolution"
                    rows="4"
                    maxlength="20000"
                    class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
                    [value]="actionResolution()"
                    (input)="actionResolution.set($any($event.target).value)"
                    data-testid="action-resolution"
                  ></textarea>
                </div>
                @if (f.kind === 'complaint') {
                  <div>
                    <label
                      for="cf-fb-act-cause"
                      class="mb-1 block text-ui font-semibold text-fg-muted"
                    >
                      {{ 'feedback.assessment.rootCause' | transloco }}
                    </label>
                    <textarea
                      id="cf-fb-act-cause"
                      rows="2"
                      maxlength="20000"
                      class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
                      [value]="actionCause()"
                      (input)="actionCause.set($any($event.target).value)"
                      data-testid="action-root-cause"
                    ></textarea>
                  </div>
                  <fieldset>
                    <legend class="mb-1.5 text-ui font-semibold text-fg-muted">
                      {{ 'feedback.assessment.correctiveAction' | transloco }}
                    </legend>
                    <div class="flex flex-wrap gap-2" role="radiogroup">
                      @for (o of yesNoOptions; track o) {
                        <label [class]="choiceClass(actionCorrective() === o)">
                          <input
                            type="radio"
                            class="sr-only"
                            name="cf-fb-act-corrective"
                            [checked]="actionCorrective() === o"
                            (change)="actionCorrective.set(o)"
                          />
                          {{ 'feedback.assessment.answers.' + o | transloco }}
                        </label>
                      }
                    </div>
                  </fieldset>
                  @if (offerDeviation()) {
                    <label class="inline-flex items-start gap-2 text-ui text-fg">
                      <input
                        type="checkbox"
                        class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                        [checked]="createDeviation()"
                        (change)="createDeviation.set($any($event.target).checked)"
                        data-testid="resolve-create-deviation"
                      />
                      {{ 'feedback.actionDialog.createDeviation' | transloco }}
                    </label>
                  }
                }
                <label class="inline-flex items-center gap-2 text-ui text-fg">
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
                    class="mb-1 block text-ui font-semibold text-fg-muted"
                  >
                    {{ 'feedback.actionDialog.note' | transloco }}
                  </label>
                  <textarea
                    id="cf-fb-act-note"
                    rows="3"
                    maxlength="2000"
                    class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
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
  private readonly flows = inject(CreateFlowService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly ask = inject(AskPanelService);
  private readonly language = inject(LanguageService);

  readonly id = input.required<string>();

  private readonly assessmentCard = viewChild(FeedbackAssessment);
  private readonly repliesCard = viewChild(FeedbackReplies);

  protected readonly entityType = FEEDBACK_ENTITY;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = FEEDBACK_FIELD_LABELS;
  protected readonly settingsLink = FEEDBACK_SETTINGS_LINK;
  protected readonly yesNoOptions = YES_NO_OPTIONS;
  protected readonly statusKey = feedbackStatusKey;
  protected readonly kindKey = feedbackKindKey;
  protected readonly channelKey = feedbackChannelKey;
  protected readonly severityKey = feedbackSeverityKey;
  protected readonly sentimentKey = feedbackSentimentKey;
  protected readonly actionKey = feedbackActionKey;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('feedback.common.loadFailed');
  protected readonly feedback = signal<Feedback | null>(null);
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly reqLinks = signal<readonly RequirementLink[]>([]);

  protected readonly pending = signal<FeedbackAction | null>(null);
  protected readonly actionResolution = signal('');
  protected readonly actionInformed = signal(false);
  protected readonly actionNote = signal('');
  protected readonly actionJustified = signal<YesNo>('');
  protected readonly actionCause = signal('');
  protected readonly actionCorrective = signal<YesNo>('');
  protected readonly createDeviation = signal(true);

  protected readonly editingSubjects = signal(false);
  protected readonly subjectDraft = signal<readonly EntityRefDto[]>([]);

  protected readonly primary = computed(() => {
    const f = this.feedback();
    return f ? primaryAction(f) : null;
  });
  protected readonly others = computed(() => {
    const f = this.feedback();
    const main = this.primary();
    return f ? f.allowed_actions.filter((a) => a !== main) : [];
  });
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/feedback/items',
    this.id(),
    'edit',
  ]);
  /** Overdue open work reads as a to-do (amber), whatever the step. */
  protected readonly statusTone = computed(() => {
    const f = this.feedback();
    if (f?.overdue && f.status !== 'resolved' && f.status !== 'closed') {
      return 'warn' as const;
    }
    return FEEDBACK_STATUS_TONE[f?.status ?? 'new'] ?? 'neutral';
  });
  /** The "Oppfølging" lines (docs/ux-guide.md §2.7), each with its fix. */
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const f = this.feedback();
    if (!f || !f.can_edit) {
      return [];
    }
    return feedbackTodos(f).map((todo) => this.toMissing(todo));
  });
  protected readonly customer = computed(() => {
    const f = this.feedback();
    return f ? customerFields(f) : [];
  });
  protected readonly canReply = computed(
    () =>
      (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE) &&
      !!this.feedback()?.can_edit,
  );
  /** Confirmed requirement refs of the record (assistant context). */
  protected readonly confirmedRefs = computed(() =>
    this.reqLinks()
      .filter((l) => l.status === 'confirmed')
      .map((l) => l.requirement_ref)
      .filter((r): r is string => !!r),
  );

  protected readonly dialogMessage = computed(() => {
    const action = this.pending();
    if (!action) {
      return '';
    }
    const complaint = this.feedback()?.kind === 'complaint';
    return action === 'resolve' && complaint
      ? 'feedback.actionDialog.messages.resolveComplaint'
      : `feedback.actionDialog.messages.${action}`;
  });

  /** A justified complaint that needs corrective action and has no deviation yet. */
  protected readonly offerDeviation = computed(() => {
    const f = this.feedback();
    return (
      !!f &&
      f.kind === 'complaint' &&
      f.linked_deviations.length === 0 &&
      this.actionJustified() === 'yes' &&
      this.actionCorrective() === 'yes'
    );
  });

  protected readonly resolveBlocked = computed(() => {
    const f = this.feedback();
    if (!f || this.pending() !== 'resolve' || f.kind !== 'complaint') {
      return false;
    }
    return !this.actionResolution().trim() || !this.actionJustified();
  });

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
        requirements: this.confirmedRefs(),
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
  }

  protected choiceClass(active: boolean): string {
    const tone = active
      ? 'border-accent bg-accent-soft text-accent'
      : 'border-border text-fg-muted hover:text-fg';
    return `inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-tile border px-3 text-ui font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${tone}`;
  }

  /** Every step asks first (no accidental status changes); resolve also asks for the outcome. */
  protected startAction(action: FeedbackAction): void {
    const f = this.feedback();
    if (!f) {
      return;
    }
    this.actionResolution.set(f.resolution ?? '');
    this.actionInformed.set(f.customer_informed);
    this.actionNote.set('');
    this.actionJustified.set(yesNo(f.complaint_justified));
    this.actionCause.set(f.root_cause ?? '');
    this.actionCorrective.set(yesNo(f.corrective_action_required));
    this.createDeviation.set(true);
    this.pending.set(action);
  }

  protected confirmAction(): void {
    const action = this.pending();
    const f = this.feedback();
    if (!action || !f || this.resolveBlocked()) {
      return;
    }
    let body: FeedbackActionBody;
    if (action === 'resolve') {
      body = {
        resolution: this.actionResolution().trim() || null,
        customer_informed: this.actionInformed(),
        ...(f.kind === 'complaint'
          ? {
              complaint_justified: fromYesNo(this.actionJustified()),
              root_cause: this.actionCause().trim() || null,
              corrective_action_required: fromYesNo(this.actionCorrective()),
            }
          : {}),
      };
    } else {
      body = { note: this.actionNote().trim() || null };
    }
    const thenDeviation = action === 'resolve' && this.offerDeviation() && this.createDeviation();
    this.run(action, body, thenDeviation);
  }

  /** A "what is still missing" row: open the place where it is fixed. */
  protected fixGap(gap: string): void {
    const f = this.feedback();
    if (!f) {
      return;
    }
    if (gap === 'deviation') {
      void this.flows.start(DEVIATION_FLOW, FEEDBACK_ENTITY, f.id);
    } else if (gap === 'reply') {
      this.onDetails(() => this.repliesCard()?.open());
    } else {
      this.onDetails(() => this.assessmentCard()?.edit());
    }
  }

  protected edit(): void {
    void this.router.navigate(this.editLink());
  }

  protected iconFor(ref: EntityRefDto): string {
    return recordIcon(ref.entity_type, ref.module);
  }

  protected askAi(kind: 'summarise' | 'resolution' | 'assessment'): void {
    this.ask.askAbout(this.language.translate(`feedback.ask.${kind}`), undefined, {
      requirements: this.confirmedRefs(),
    });
  }

  private toMissing(todo: FeedbackTodo): RecordMissingItem {
    const base = { key: todo.key, labelKey: todo.labelKey };
    switch (todo.kind) {
      case 'gap':
        return { ...base, action: () => this.fixGap(todo.gap) };
      case 'reply':
        return { ...base, action: () => this.fixGap('reply') };
      case 'subjects':
        return { ...base, action: () => this.editSubjects() };
      default:
        return { ...base, link: this.editLink() };
    }
  }

  /** Open the Details tab (where the cards are), then run `then`. */
  private onDetails(then: () => void): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (!tab || tab === 'details') {
      then();
      return;
    }
    void this.router
      .navigate([], {
        relativeTo: this.route,
        queryParams: { tab: null },
        queryParamsHandling: 'merge',
      })
      .then(() => setTimeout(then));
  }

  protected onDeviationsChanged(items: readonly EntityRefDto[]): void {
    const f = this.feedback();
    if (f) {
      this.feedback.set({ ...f, linked_deviations: items });
      this.refresh();
    }
  }

  protected editSubjects(): void {
    this.subjectDraft.set(this.feedback()?.subjects ?? []);
    this.editingSubjects.set(true);
  }

  protected addSubject(ref: EntityRefDto): void {
    this.subjectDraft.update((list) =>
      list.some((r) => r.entity_type === ref.entity_type && r.entity_id === ref.entity_id)
        ? list
        : [...list, ref],
    );
  }

  protected removeSubject(ref: EntityRefDto): void {
    this.subjectDraft.update((list) =>
      list.filter((r) => !(r.entity_type === ref.entity_type && r.entity_id === ref.entity_id)),
    );
  }

  protected saveSubjects(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const f = this.feedback();
    if (!orgId || !f || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.update(orgId, f.id, { subjects: toSubjects(this.subjectDraft()) }).subscribe({
      next: (updated) => {
        this.acting.set(false);
        this.editingSubjects.set(false);
        this.feedback.set(updated);
        this.notifications.success('feedback.notices.subjectsSaved');
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
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

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), true);
  }

  /** Re-read the record quietly (after a reply or a link changed it). */
  protected refresh(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  private run(action: FeedbackAction, body: FeedbackActionBody, thenDeviation: boolean): void {
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
        if (thenDeviation) {
          void this.flows.start(DEVIATION_FLOW, FEEDBACK_ENTITY, feedback.id);
        }
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
        if (!initial) {
          return;
        }
        this.errorKey.set(feedbackErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
