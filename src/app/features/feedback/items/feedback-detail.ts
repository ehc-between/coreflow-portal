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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { EntityRefDto } from '../../../core/entities/entity.models';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RequirementLink } from '../../../core/standards/standards.models';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { FeedbackAskButton } from '../ask-button';
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
 * One feedback record (`/feedback/items/:id`): the customer's message, one primary
 * "next step" button (the other steps under "Mer"; every step asks first), the
 * complaint assessment, the reply log, what the feedback is about (suppliers,
 * contracts, processes, …), linked deviations, follow-up tasks, and the shared
 * record kit (requirements, connections, create-from-here, activity, comments,
 * attachments, revisions).
 */
@Component({
  selector: 'app-feedback-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    WatchButton,
    AskAbout,
    FieldHelp,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    StatusBadge,
    FeedbackAskButton,
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
          >
            <ng-container meta>
              <span class="font-mono font-semibold" data-testid="feedback-code">{{ f.code }}</span>
              <app-badge tone="neutral" data-testid="feedback-kind">{{
                kindKey(f.kind) | transloco
              }}</app-badge>
              <app-status-badge
                meaning="lifecycle"
                [value]="f.status"
                [labelKey]="statusKey(f.status)"
                data-testid="feedback-status"
              />
              @if (f.severity) {
                <app-status-badge
                  meaning="severity"
                  [value]="f.severity"
                  [labelKey]="severityKey(f.severity)"
                />
              }
              @if (f.overdue) {
                <app-status-badge meaning="lifecycle" value="overdue" />
              }
              <span>{{
                'feedback.detail.receivedVia'
                  | transloco: { channel: (channelKey(f.channel) | transloco) }
              }}</span>
              @if (f.category) {
                <span data-testid="feedback-category">{{
                  'feedback.list.categoryValue' | transloco: { category: f.category }
                }}</span>
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
              <a
                secondary
                [routerLink]="['/feedback/items', f.id, 'edit']"
                class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                data-testid="feedback-edit"
              >
                {{ 'feedback.common.edit' | transloco }}
              </a>
            }
            <app-feedback-ask-button
              secondary
              promptKey="feedback.ask.summarise"
              [requirements]="confirmedRefs()"
            />
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

            <app-help-strip help scope="feedback" page="detail" lesson="handling-complaints" />

            <div class="flex flex-col gap-6">
              @if (f.status === 'closed') {
                <app-alert tone="info">{{ 'feedback.detail.closedNotice' | transloco }}</app-alert>
              }

              @if (f.status !== 'closed') {
                <app-card>
                  <h2 class="mb-1 font-display text-card font-bold text-fg">
                    {{ 'feedback.next.title' | transloco }}
                  </h2>
                  <p class="text-ui text-fg-muted" data-testid="workflow-hint">
                    {{ 'feedback.workflow.hint.' + f.status | transloco }}
                  </p>
                  @if (f.kind === 'complaint' && f.assessment_gaps.length) {
                    <ul class="mt-3 flex flex-col gap-2" data-testid="assessment-gaps">
                      @for (g of f.assessment_gaps; track g) {
                        <li class="flex flex-wrap items-center gap-2 text-ui">
                          <app-icon name="clock" [size]="14" class="text-warn-ink" />
                          <span class="min-w-0 flex-1 text-fg">{{
                            'feedback.gaps.' + g | transloco
                          }}</span>
                          @if (f.can_edit) {
                            <app-button
                              size="sm"
                              variant="ghost"
                              (click)="fixGap(g)"
                              [attr.data-testid]="'gap-' + g"
                            >
                              {{ 'feedback.gaps.' + g + 'Action' | transloco }}
                            </app-button>
                          }
                        </li>
                      }
                    </ul>
                  }
                </app-card>
              }

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'feedback.detail.message' | transloco }}
                </h2>
                @if (f.description) {
                  <p
                    class="text-body whitespace-pre-line text-fg"
                    data-testid="feedback-description"
                  >
                    {{ f.description }}
                  </p>
                } @else {
                  <p class="text-ui text-fg-muted">
                    {{ 'feedback.detail.noDescription' | transloco }}
                  </p>
                }
                @if (f.product_or_service || f.satisfaction_score || f.sentiment) {
                  <dl class="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-ui sm:grid-cols-3">
                    @if (f.product_or_service) {
                      <div>
                        <dt class="text-meta text-fg-subtle">
                          {{ 'feedback.fields.productOrService' | transloco }}
                        </dt>
                        <dd class="text-fg">{{ f.product_or_service }}</dd>
                      </div>
                    }
                    @if (f.satisfaction_score) {
                      <div>
                        <dt class="text-meta text-fg-subtle">
                          {{ 'feedback.fields.satisfactionScore' | transloco }}
                        </dt>
                        <dd class="text-fg">
                          {{ 'feedback.form.scoreOption.' + f.satisfaction_score | transloco }}
                        </dd>
                      </div>
                    }
                    @if (f.sentiment) {
                      <div>
                        <dt class="text-meta text-fg-subtle">
                          {{ 'feedback.fields.sentiment' | transloco }}
                        </dt>
                        <dd class="text-fg">{{ sentimentKey(f.sentiment) | transloco }}</dd>
                      </div>
                    }
                  </dl>
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
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'feedback.detail.customer' | transloco }}
                </h2>
                @if (customer().length) {
                  <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-ui sm:grid-cols-2">
                    @for (c of customer(); track c.key) {
                      <div>
                        <dt class="text-meta text-fg-subtle">{{ c.labelKey | transloco }}</dt>
                        <dd class="break-words text-fg">
                          @if (c.href) {
                            <a class="text-accent hover:underline" [href]="c.href">{{ c.value }}</a>
                          } @else {
                            {{ c.value }}
                          }
                        </dd>
                      </div>
                    }
                  </dl>
                } @else {
                  <p class="text-ui text-fg-muted" data-testid="no-customer">
                    {{ 'feedback.detail.noCustomer' | transloco }}
                    @if (f.can_edit) {
                      <a
                        [routerLink]="['/feedback/items', f.id, 'edit']"
                        class="font-semibold text-accent hover:underline"
                        >{{ 'feedback.detail.addCustomer' | transloco }}</a
                      >
                    }
                  </p>
                }
              </app-card>

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
                <h2 class="mb-3 flex items-center gap-1 font-display text-card font-bold text-fg">
                  {{ 'feedback.detail.resolution' | transloco }}
                  <app-ask-about
                    [prompt]="'feedback.ask.resolution' | transloco"
                    field="resolution"
                    [fieldLabel]="'feedback.fields.resolution' | transloco"
                  />
                </h2>
                @if (f.resolution) {
                  <p
                    class="text-body whitespace-pre-line text-fg"
                    data-testid="feedback-resolution"
                  >
                    {{ f.resolution }}
                  </p>
                } @else {
                  <p class="text-ui text-fg-muted">
                    {{ 'feedback.detail.noResolution' | transloco }}
                  </p>
                }
                <p
                  class="mt-3 flex items-center gap-1.5 text-ui"
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
                </p>
              </app-card>

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
                <section aria-labelledby="cf-fb-subjects-h" data-testid="feedback-subjects">
                  <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2
                      id="cf-fb-subjects-h"
                      class="flex items-center gap-1 font-display text-card font-bold text-fg"
                    >
                      {{ 'feedback.subjects.title' | transloco }}
                      <app-field-help scope="feedback" page="detail" field="subjects" />
                    </h2>
                    @if (f.can_edit && !editingSubjects()) {
                      <app-button
                        size="sm"
                        variant="secondary"
                        (click)="editSubjects()"
                        data-testid="edit-subjects"
                      >
                        <app-icon name="link" [size]="14" />
                        {{ 'feedback.subjects.edit' | transloco }}
                      </app-button>
                    }
                  </div>
                  <p class="mb-3 text-meta text-fg-muted">
                    {{ 'feedback.subjects.hint' | transloco }}
                  </p>
                  @if (editingSubjects()) {
                    <app-feedback-subject-picker
                      [picked]="subjectDraft()"
                      (selected)="addSubject($event)"
                      (removed)="removeSubject($event)"
                    />
                    <div class="mt-3 flex flex-wrap justify-end gap-2">
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
                    </div>
                  } @else if (f.subjects.length) {
                    <ul class="flex flex-wrap gap-2" data-testid="subject-list">
                      @for (s of f.subjects; track s.entity_type + s.entity_id) {
                        <li><app-entity-chip [ref]="s" /></li>
                      }
                    </ul>
                  } @else {
                    <p class="text-ui text-fg-muted" data-testid="no-subjects">
                      {{ 'feedback.subjects.none' | transloco }}
                    </p>
                  }
                </section>
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
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="entityType"
                [entityId]="f.id"
                [canCreate]="f.can_edit"
                [entityLabel]="f.code + ' ' + f.title"
              />
            </div>

            <ng-container aside-requirements>
              <app-supports-requirements
                [entityType]="entityType"
                [entityId]="f.id"
                [canEdit]="f.can_edit"
                (linksChange)="reqLinks.set($event)"
              />
            </ng-container>

            <ng-container aside>
              <app-card>
                <div class="mb-2 flex items-center justify-between gap-2">
                  <h2 class="text-ui font-semibold text-fg-subtle">
                    {{ 'feedback.detail.handling' | transloco }}
                  </h2>
                  <app-watch-button [entityType]="entityType" [entityId]="f.id" />
                </div>
                <dl class="flex flex-col gap-2 text-ui">
                  <div>
                    <dt class="text-meta text-fg-subtle">
                      {{ 'feedback.fields.receivedOn' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ f.received_on | localDay }}</dd>
                  </div>
                  <div>
                    <dt class="text-meta text-fg-subtle">
                      {{ 'feedback.fields.responseDueOn' | transloco }}
                    </dt>
                    <dd
                      [class.text-warn-ink]="f.overdue"
                      [class.font-semibold]="f.overdue"
                      class="text-fg"
                      data-testid="feedback-due"
                    >
                      {{
                        f.response_due_on
                          ? (f.response_due_on | localDay)
                          : ('feedback.common.none' | transloco)
                      }}
                      @if (f.overdue) {
                        · {{ 'feedback.common.overdue' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-meta text-fg-subtle">
                      {{ 'feedback.fields.owner' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ f.owner?.name ?? ('feedback.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-meta text-fg-subtle">
                      {{ 'feedback.fields.department' | transloco }}
                    </dt>
                    <dd class="text-fg" data-testid="feedback-department">
                      {{ f.department?.name ?? ('feedback.common.none' | transloco) }}
                    </dd>
                  </div>
                  @if (f.survey; as sv) {
                    <div>
                      <dt class="text-meta text-fg-subtle">
                        {{ 'feedback.detail.fromSurvey' | transloco }}
                      </dt>
                      <dd><app-entity-chip [ref]="sv" [showType]="false" /></dd>
                    </div>
                  } @else if (f.survey_id) {
                    <div>
                      <dt class="text-meta text-fg-subtle">
                        {{ 'feedback.detail.fromSurvey' | transloco }}
                      </dt>
                      <dd>
                        <a
                          [routerLink]="['/feedback/surveys', f.survey_id]"
                          class="font-semibold text-accent hover:underline"
                          >{{ 'feedback.detail.openSurvey' | transloco }}</a
                        >
                      </dd>
                    </div>
                  }
                  @if (f.created_by?.name; as by) {
                    <div>
                      <dt class="text-meta text-fg-subtle">
                        {{ 'feedback.fields.createdBy' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ by }}</dd>
                    </div>
                  }
                  @if (f.acknowledged_at) {
                    <div>
                      <dt class="text-meta text-fg-subtle">
                        {{ 'feedback.fields.acknowledgedAt' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ f.acknowledged_at | localDate }}</dd>
                    </div>
                  }
                  @if (f.resolved_at) {
                    <div>
                      <dt class="text-meta text-fg-subtle">
                        {{ 'feedback.fields.resolvedAt' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ f.resolved_at | localDate }}</dd>
                    </div>
                  }
                  @if (f.closed_at) {
                    <div>
                      <dt class="text-meta text-fg-subtle">
                        {{ 'feedback.fields.closedAt' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ f.closed_at | localDate }}</dd>
                    </div>
                  }
                </dl>
                <p class="mt-3 text-meta text-fg-muted">
                  {{ 'feedback.detail.openTasks' | transloco: { count: f.open_tasks } }}
                </p>
              </app-card>
            </ng-container>

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
      this.repliesCard()?.open();
    } else {
      this.assessmentCard()?.edit();
    }
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
