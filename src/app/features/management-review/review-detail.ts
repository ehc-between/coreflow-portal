import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AssigneeIn } from '../../core/tasks/task.models';
import { AskPanelService } from '../ask/ask-panel.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { InputDataView } from './components/input-data';
import { MeetingWorkspace } from './components/meeting-workspace';
import { ManagementReviewApi } from './data/management-review-api';
import { missingForSubmit, mrErrorCode, mrErrorKey } from './data/management-review-errors';
import {
  ASSESSMENTS,
  ASSIST_DRAFT_INPUT_SUMMARY,
  ASSIST_SUGGEST_OUTPUTS,
  Assessment,
  DecisionCategory,
  MeetingDetail,
  ReviewAction,
  ReviewDetail,
  ReviewInput,
  SuggestedOutputs,
  UpdateReviewRequest,
} from './data/management-review.models';
import {
  MR_MODULE,
  MR_PERMISSIONS,
  MR_SCOPE,
  REVIEW_STEPS,
  assessmentKey,
  decisionCategoryKey,
  frameworkKey,
  inputHintKey,
  inputTitleKey,
  meetingStatusKey,
  missingKey,
  reviewActionKey,
  reviewStatusKey,
  reviewStatusTone,
  textOrNull,
} from './management-review-display';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Snapshot field -> label key, for the revisions tab. */
export const REVIEW_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'managementReview.fields.title',
  status: 'managementReview.fields.status',
  frameworks: 'managementReview.fields.frameworks',
  period_start: 'managementReview.fields.periodStart',
  period_end: 'managementReview.fields.periodEnd',
  owner_user_id: 'managementReview.fields.owner',
  inputs_summary: 'managementReview.fields.inputsSummary',
  conclusions: 'managementReview.fields.conclusions',
  improvement_opportunities: 'managementReview.fields.improvementOpportunities',
  change_needs: 'managementReview.fields.changeNeeds',
  resource_needs: 'managementReview.fields.resourceNeeds',
  system_assessment: 'managementReview.fields.systemAssessment',
};

/** The text output fields of a review, in display order. */
export const OUTPUT_FIELDS = [
  { key: 'conclusions', label: 'managementReview.fields.conclusions', help: 'conclusions' },
  {
    key: 'improvement_opportunities',
    label: 'managementReview.fields.improvementOpportunities',
    help: 'improvementOpportunities',
  },
  { key: 'change_needs', label: 'managementReview.fields.changeNeeds', help: 'changeNeeds' },
  { key: 'resource_needs', label: 'managementReview.fields.resourceNeeds', help: 'resourceNeeds' },
] as const;

export type OutputKey = (typeof OUTPUT_FIELDS)[number]['key'];

export interface OutputsDraft {
  readonly inputs_summary: string;
  readonly conclusions: string;
  readonly improvement_opportunities: string;
  readonly change_needs: string;
  readonly resource_needs: string;
  readonly system_assessment: Assessment | '';
}

export function outputsDraft(r: ReviewDetail): OutputsDraft {
  return {
    inputs_summary: r.inputs_summary ?? '',
    conclusions: r.conclusions ?? '',
    improvement_opportunities: r.improvement_opportunities ?? '',
    change_needs: r.change_needs ?? '',
    resource_needs: r.resource_needs ?? '',
    system_assessment: r.system_assessment ?? '',
  };
}

/** Only the output fields that changed (empty text is sent as null). */
export function outputsPatch(r: ReviewDetail, d: OutputsDraft): UpdateReviewRequest {
  const out: Record<string, string | null> = {};
  const before = outputsDraft(r);
  for (const key of Object.keys(d) as (keyof OutputsDraft)[]) {
    if ((d[key] ?? '').trim() !== (before[key] ?? '').trim()) {
      out[key] = key === 'system_assessment' ? d[key] || null : textOrNull(d[key]);
    }
  }
  return out as UpdateReviewRequest;
}

/** Which output field a suggested decision category is added to. */
export function outputFieldFor(category: DecisionCategory): OutputKey {
  switch (category) {
    case 'improvement':
      return 'improvement_opportunities';
    case 'change':
      return 'change_needs';
    case 'resource':
      return 'resource_needs';
    default:
      return 'conclusions';
  }
}

/** Append a line to a text field (blank line between paragraphs). */
export function appendLine(text: string, line: string): string {
  const base = text.trimEnd();
  return base ? `${base}\n- ${line}` : `- ${line}`;
}

/** Workflow actions shown as header buttons, in order (edit and delete are separate). */
const HEADER_ACTIONS: readonly ReviewAction[] = ['start', 'submit', 'sign', 'return', 'cancel'];

/**
 * `/management-review/reviews/:id`: one management review end to end — the
 * compiled inputs (with notes and a reviewed tick), the input summary, the
 * meeting (agenda, attendees, minutes, decisions and actions), the outputs and
 * the overall assessment, then submit for sign-off and sign. Signed reviews are
 * frozen as a report with a checksum. Shared record tabs and clause evidence
 * sit alongside.
 */
@Component({
  selector: 'app-mr-review-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    LocalDatePipe,
    LocalDayPipe,
    WatchButton,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    GuideIntro,
    LessonView,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    PromptDialog,
    InputDataView,
    MeetingWorkspace,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted">
          {{ 'managementReview.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[880px] px-4 pt-7 sm:px-8">
          <app-alert tone="error">{{ 'managementReview.common.notFound' | transloco }}</app-alert>
          <a
            routerLink="/management-review/reviews"
            class="mt-3 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'managementReview.common.backToList' | transloco }}
          </a>
        </div>
      }
      @case ('ready') {
        @if (review(); as r) {
          <app-record-detail-layout
            entityType="management_review"
            [entityId]="r.id"
            [tabs]="tabs"
            [canEdit]="r.can_edit"
            [fieldLabels]="fieldLabels"
            backLink="/management-review/reviews"
            backLabelKey="managementReview.common.backToList"
          >
            <div header>
              <p class="font-mono text-[12.5px] text-fg-subtle">{{ r.code }}</p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
              >
                {{ r.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="statusTone(r.status)">{{
                  statusKey(r.status) | transloco
                }}</app-badge>
                @for (f of r.frameworks; track f) {
                  <app-badge tone="neutral">{{ frameworkKey(f) | transloco }}</app-badge>
                }
              </div>
            </div>

            <ng-container actions>
              <app-tour-button [scope]="scope" tour="detail" />
              <app-watch-button entityType="management_review" [entityId]="r.id" />
              <app-button variant="ghost" size="sm" (click)="askSummary()">
                <app-icon name="spark" [size]="14" />
                {{ 'managementReview.ai.summarise' | transloco }}
              </app-button>
              <a
                [routerLink]="['/management-review/reviews', r.id, 'report']"
                class="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <app-icon name="documents" [size]="14" />
                {{ 'managementReview.detail.report' | transloco }}
              </a>
              @if (r.can_edit) {
                <app-button variant="secondary" size="sm" (click)="edit()">
                  {{ 'managementReview.detail.edit' | transloco }}
                </app-button>
              }
              @for (a of headerActions(); track a) {
                <app-button
                  size="sm"
                  [variant]="a === 'cancel' || a === 'return' ? 'ghost' : 'primary'"
                  [disabled]="busy()"
                  [attr.data-testid]="'action-' + a"
                  (click)="runAction(a)"
                >
                  {{ actionKey(a) | transloco }}
                </app-button>
              }
              @if (allowed('delete')) {
                <app-button variant="danger" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ actionKey('delete') | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-4">
              <app-guide-intro [scope]="scope" page="detail" />

              <!-- progress -->
              <app-card>
                <ol
                  class="flex flex-wrap items-center gap-x-2 gap-y-2"
                  [attr.aria-label]="'managementReview.detail.progress' | transloco"
                  appTourStep="mr-progress"
                >
                  @for (step of steps; track step; let i = $index) {
                    <li
                      class="flex items-center gap-2 text-[12.5px]"
                      [attr.aria-current]="r.status === step ? 'step' : null"
                    >
                      <span
                        class="flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold"
                        [class]="
                          stepIndex() > i
                            ? 'border-pass bg-pass text-white'
                            : stepIndex() === i
                              ? 'border-accent bg-accent-soft text-accent'
                              : 'border-border text-fg-subtle'
                        "
                      >
                        @if (stepIndex() > i) {
                          <app-icon name="check" [size]="12" />
                        } @else {
                          {{ i + 1 }}
                        }
                      </span>
                      <span [class.font-semibold]="stepIndex() === i" class="text-fg">
                        {{ statusKey(step) | transloco }}
                      </span>
                      @if (i < steps.length - 1) {
                        <span class="hidden h-px w-6 bg-border sm:block" aria-hidden="true"></span>
                      }
                    </li>
                  }
                </ol>
                @if (r.status === 'cancelled') {
                  <div class="mt-3">
                    <app-alert tone="info">{{
                      'managementReview.detail.cancelledNotice'
                        | transloco: { date: (r.cancelled_at | localDate) }
                    }}</app-alert>
                  </div>
                } @else if (r.status === 'awaiting_signoff') {
                  <div class="mt-3">
                    <app-alert tone="info">{{
                      'managementReview.detail.awaitingNotice'
                        | transloco
                          : {
                              name: r.submitted_by?.name ?? '-',
                              date: (r.submitted_at | localDate),
                            }
                    }}</app-alert>
                  </div>
                } @else if (r.status === 'signed') {
                  <div class="mt-3">
                    <app-alert tone="success">{{
                      'managementReview.detail.signedNotice'
                        | transloco
                          : {
                              name: r.signature_name || r.signed_by?.name || '-',
                              date: (r.signed_at | localDate),
                            }
                    }}</app-alert>
                  </div>
                }
                @if (showMissing()) {
                  <div class="mt-3" data-testid="missing-for-submit">
                    <p class="text-[12.5px] font-semibold text-fg-muted">
                      {{ 'managementReview.detail.beforeSubmit' | transloco }}
                    </p>
                    <ul class="mt-1 flex flex-col gap-1">
                      @for (m of missing(); track m) {
                        <li class="flex items-center gap-1.5 text-[13px] text-fg">
                          <app-icon name="alert" [size]="13" />
                          {{ missingKey(m) | transloco }}
                        </li>
                      }
                    </ul>
                  </div>
                }
              </app-card>

              <!-- overview -->
              <app-card>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-4 text-[13.5px] sm:grid-cols-2">
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'managementReview.fields.owner' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ r.owner?.name ?? ('managementReview.common.noOwner' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'managementReview.fields.period' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ (r.period_start | localDay) || '…' }} –
                      {{ (r.period_end | localDay) || '…' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'managementReview.fields.scheduledAt' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        (r.scheduled_at | localDate: 'medium') ||
                          ('managementReview.common.notScheduled' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'managementReview.fields.meeting' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (r.meeting; as m) {
                        <a
                          [routerLink]="['/management-review/meetings', m.id]"
                          class="font-semibold text-accent hover:underline"
                          >{{ m.code }}</a
                        >
                        · {{ meetingStatusKey(m.status) | transloco }}
                      } @else {
                        —
                      }
                    </dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'managementReview.detail.actionsHeading' | transloco }}
                    </dt>
                    <dd class="text-fg" data-testid="action-stats">
                      {{
                        'managementReview.detail.actionStats'
                          | transloco
                            : {
                                total: r.actions.total,
                                open: r.actions.open,
                                done: r.actions.done,
                                overdue: r.actions.overdue,
                              }
                      }}
                    </dd>
                  </div>
                </dl>
              </app-card>

              <!-- inputs -->
              <app-card>
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 class="font-display text-[15px] font-bold text-fg">
                      {{
                        'managementReview.inputs.heading'
                          | transloco: { reviewed: reviewedCount(), total: r.inputs.length }
                      }}
                    </h2>
                    <p class="text-[12px] text-fg-muted">
                      @if (r.inputs_compiled_at) {
                        {{
                          'managementReview.inputs.compiledAt'
                            | transloco: { date: (r.inputs_compiled_at | localDate: 'medium') }
                        }}
                      } @else {
                        {{ 'managementReview.inputs.notCompiled' | transloco }}
                      }
                    </p>
                  </div>
                  @if (allowed('compile')) {
                    <app-button
                      size="sm"
                      variant="secondary"
                      appTourStep="mr-compile"
                      [disabled]="busy()"
                      (click)="runAction('compile')"
                    >
                      <app-icon name="history" [size]="14" />
                      {{ actionKey('compile') | transloco }}
                    </app-button>
                  }
                </div>
                <app-field-help [scope]="scope" page="detail" field="inputs" />
                <ul class="mt-2 flex flex-col gap-2" data-testid="review-inputs">
                  @for (i of r.inputs; track i.id) {
                    <li>
                      <details class="group rounded-[10px] border border-border">
                        <summary
                          class="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-[13.5px]"
                        >
                          <span
                            class="flex h-5 w-5 flex-none items-center justify-center rounded-full border"
                            [class]="
                              i.reviewed ? 'border-pass bg-pass text-white' : 'border-border'
                            "
                            [attr.aria-label]="
                              (i.reviewed
                                ? 'managementReview.inputs.reviewed'
                                : 'managementReview.inputs.notReviewed'
                              ) | transloco
                            "
                            role="img"
                          >
                            @if (i.reviewed) {
                              <app-icon name="check" [size]="11" />
                            }
                          </span>
                          <span class="min-w-0 flex-1 font-semibold text-fg">{{
                            inputTitle(i)
                          }}</span>
                          @if (i.clause) {
                            <span class="font-mono text-[11.5px] text-fg-subtle">{{
                              i.clause
                            }}</span>
                          }
                          <app-badge [tone]="i.source === 'auto' ? 'info' : 'neutral'">
                            {{ 'managementReview.inputs.source.' + i.source | transloco }}
                          </app-badge>
                        </summary>
                        <div class="flex flex-col gap-3 border-t border-border px-3 py-3">
                          @if (hintKey(i.category); as hint) {
                            <p class="text-[12.5px] text-fg-muted">{{ hint | transloco }}</p>
                          }
                          <app-mr-input-data [data]="i.data" [auto]="i.auto" />
                          @if (r.can_edit) {
                            <app-form-field
                              [label]="'managementReview.inputs.notes' | transloco"
                              [inputId]="'mr-in-' + i.id"
                            >
                              <textarea
                                [id]="'mr-in-' + i.id"
                                rows="3"
                                maxlength="50000"
                                [value]="noteDraft(i)"
                                (input)="setNote(i.id, $any($event.target).value)"
                              ></textarea>
                            </app-form-field>
                            <div class="flex flex-wrap items-center gap-2">
                              <label class="inline-flex items-center gap-1.5 text-[13px] text-fg">
                                <input
                                  type="checkbox"
                                  [checked]="i.reviewed"
                                  [disabled]="busy()"
                                  (change)="setReviewed(i, $any($event.target).checked)"
                                />
                                {{ 'managementReview.inputs.markReviewed' | transloco }}
                              </label>
                              <span class="flex-1"></span>
                              @if (i.category === 'custom') {
                                <app-button
                                  size="sm"
                                  variant="ghost"
                                  [disabled]="busy()"
                                  (click)="deleteInput(i)"
                                >
                                  <app-icon name="trash" [size]="13" />
                                  {{ 'managementReview.inputs.remove' | transloco }}
                                </app-button>
                              }
                              <app-button
                                size="sm"
                                [disabled]="!noteDirty(i) || busy()"
                                (click)="saveNote(i)"
                              >
                                {{ 'managementReview.inputs.saveNotes' | transloco }}
                              </app-button>
                            </div>
                          } @else if (i.notes) {
                            <p class="text-[13px] whitespace-pre-line text-fg">{{ i.notes }}</p>
                          }
                        </div>
                      </details>
                    </li>
                  } @empty {
                    <li class="text-[13.5px] text-fg-muted">
                      {{ 'managementReview.inputs.empty' | transloco }}
                    </li>
                  }
                </ul>
                @if (r.can_edit) {
                  <form
                    class="mt-3 flex flex-wrap items-center gap-2"
                    (submit)="$event.preventDefault(); addInput()"
                  >
                    <label class="sr-only" for="mr-custom-input">{{
                      'managementReview.inputs.customTitle' | transloco
                    }}</label>
                    <input
                      id="mr-custom-input"
                      type="text"
                      maxlength="255"
                      class="h-9 min-w-[200px] flex-1 rounded-[8px] border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-accent"
                      [placeholder]="'managementReview.inputs.customTitle' | transloco"
                      [value]="customTitle()"
                      (input)="customTitle.set($any($event.target).value)"
                    />
                    <app-button
                      size="sm"
                      variant="secondary"
                      type="submit"
                      [disabled]="!customTitle().trim() || busy()"
                    >
                      <app-icon name="plus" [size]="13" />
                      {{ 'managementReview.inputs.addCustom' | transloco }}
                    </app-button>
                  </form>
                }
              </app-card>

              <!-- input summary -->
              <app-card>
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'managementReview.fields.inputsSummary' | transloco }}
                  </h2>
                  @if (r.can_edit) {
                    <app-ai-assist-button
                      [assist]="draftSummaryAssist"
                      labelKey="managementReview.ai.draftSummary"
                      entityType="management_review"
                      [entityId]="r.id"
                      [input]="{ review_id: r.id }"
                      (text)="setOutput('inputs_summary', $event)"
                    />
                  }
                </div>
                <app-field-help [scope]="scope" page="detail" field="inputsSummary" />
                @if (r.can_edit) {
                  <app-form-field
                    [label]="'managementReview.fields.inputsSummary' | transloco"
                    inputId="mr-inputs-summary"
                  >
                    <textarea
                      id="mr-inputs-summary"
                      rows="6"
                      maxlength="50000"
                      [value]="outputs().inputs_summary"
                      (input)="setOutput('inputs_summary', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                } @else {
                  <p class="text-[13.5px] whitespace-pre-line text-fg">
                    {{ r.inputs_summary || ('managementReview.common.notSet' | transloco) }}
                  </p>
                }
              </app-card>

              <!-- meeting -->
              @if (r.meeting; as m) {
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[17px] font-bold text-fg">
                    {{ 'managementReview.detail.meetingHeading' | transloco: { code: m.code } }}
                  </h2>
                  <a
                    [routerLink]="['/management-review/meetings', m.id]"
                    class="text-[13px] font-semibold text-accent hover:underline"
                  >
                    {{ 'managementReview.detail.openMeeting' | transloco }}
                  </a>
                </div>
                <app-mr-meeting-workspace
                  [meeting]="m"
                  [canManage]="canManage()"
                  (changed)="onMeetingChanged($event)"
                />
              }

              <!-- outputs -->
              <app-card appTourStep="mr-outputs">
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'managementReview.detail.outputsHeading' | transloco }}
                  </h2>
                  @if (r.can_edit) {
                    <app-ai-assist-button
                      [assist]="suggestAssist"
                      labelKey="managementReview.ai.suggestOutputs"
                      entityType="management_review"
                      [entityId]="r.id"
                      [input]="{ review_id: r.id }"
                      (result)="onSuggestions($event)"
                    />
                  }
                </div>
                @if (suggestions().length) {
                  <ul class="mb-3 flex flex-col gap-2" data-testid="output-suggestions">
                    @for (s of suggestions(); track $index; let idx = $index) {
                      <li class="rounded-[10px] border border-border p-3">
                        <div class="flex flex-wrap items-start gap-2">
                          <app-badge tone="info">{{
                            categoryKey(s.category) | transloco
                          }}</app-badge>
                          <p class="min-w-0 flex-1 text-[13.5px] text-fg">{{ s.text }}</p>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-2">
                          <app-button size="sm" variant="secondary" (click)="useSuggestion(idx)">
                            {{ 'managementReview.ai.addToOutputs' | transloco }}
                          </app-button>
                          @if (r.meeting?.can_edit) {
                            <app-button
                              size="sm"
                              variant="secondary"
                              [disabled]="busy()"
                              (click)="recordSuggestion(idx)"
                            >
                              {{ 'managementReview.ai.recordDecision' | transloco }}
                            </app-button>
                          }
                          <app-button size="sm" variant="ghost" (click)="dismissSuggestion(idx)">
                            {{ 'managementReview.ai.dismiss' | transloco }}
                          </app-button>
                        </div>
                      </li>
                    }
                  </ul>
                  <p class="mb-3 text-[12px] text-fg-subtle">
                    {{ 'managementReview.ai.suggestionNote' | transloco }}
                  </p>
                }
                <div class="flex flex-col gap-4">
                  @for (f of outputFields; track f.key) {
                    <div>
                      @if (r.can_edit) {
                        <app-form-field [label]="f.label | transloco" [inputId]="'mr-out-' + f.key">
                          <textarea
                            [id]="'mr-out-' + f.key"
                            rows="4"
                            maxlength="50000"
                            [value]="outputs()[f.key]"
                            (input)="setOutput(f.key, $any($event.target).value)"
                          ></textarea>
                        </app-form-field>
                      } @else {
                        <p class="text-[12px] font-semibold text-fg-muted">
                          {{ f.label | transloco }}
                        </p>
                        <p class="text-[13.5px] whitespace-pre-line text-fg">
                          {{ r[f.key] || ('managementReview.common.notSet' | transloco) }}
                        </p>
                      }
                      <app-field-help [scope]="scope" page="detail" [field]="f.help" />
                    </div>
                  }
                  <div>
                    <div class="flex items-start justify-between gap-2">
                      <span
                        class="text-[13px] font-semibold text-fg-muted"
                        id="mr-assessment-label"
                      >
                        {{ 'managementReview.fields.systemAssessment' | transloco }}
                      </span>
                      <app-ask-about
                        field="system_assessment"
                        labelKey="managementReview.ai.askAssessment"
                        [prompt]="askAssessmentPrompt()"
                      />
                    </div>
                    @if (r.can_edit) {
                      <div
                        class="mt-1.5 flex flex-wrap gap-2"
                        role="radiogroup"
                        aria-labelledby="mr-assessment-label"
                      >
                        @for (a of assessments; track a) {
                          <label
                            class="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] text-fg"
                          >
                            <input
                              type="radio"
                              name="mr-assessment"
                              [value]="a"
                              [checked]="outputs().system_assessment === a"
                              (change)="setOutput('system_assessment', a)"
                            />
                            {{ assessmentKey(a) | transloco }}
                          </label>
                        }
                      </div>
                    } @else {
                      <p class="mt-1 text-[13.5px] text-fg">
                        {{
                          r.system_assessment
                            ? (assessmentKey(r.system_assessment) | transloco)
                            : ('managementReview.common.notSet' | transloco)
                        }}
                      </p>
                    }
                    <app-field-help [scope]="scope" page="detail" field="systemAssessment" />
                  </div>
                  @if (r.can_edit) {
                    <div class="flex flex-wrap items-center justify-end gap-2">
                      @if (outputsDirty()) {
                        <span class="text-[12px] text-fg-subtle">{{
                          'managementReview.detail.unsaved' | transloco
                        }}</span>
                      }
                      <app-button
                        [disabled]="!outputsDirty() || busy()"
                        [loading]="busy()"
                        (click)="saveOutputs()"
                        data-testid="save-outputs"
                      >
                        {{ 'managementReview.detail.saveOutputs' | transloco }}
                      </app-button>
                    </div>
                  }
                </div>
              </app-card>

              <!-- signature -->
              @if (r.status === 'signed') {
                <app-card>
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'managementReview.sign.heading' | transloco }}
                  </h2>
                  <dl class="mt-2 grid grid-cols-1 gap-3 text-[13.5px] sm:grid-cols-2">
                    <div>
                      <dt class="text-[12px] font-semibold text-fg-muted">
                        {{ 'managementReview.sign.signedBy' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ r.signature_name || r.signed_by?.name }}</dd>
                    </div>
                    <div>
                      <dt class="text-[12px] font-semibold text-fg-muted">
                        {{ 'managementReview.sign.signedAt' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ r.signed_at | localDate: 'medium' }}</dd>
                    </div>
                    @if (r.signature_statement) {
                      <div class="sm:col-span-2">
                        <dt class="text-[12px] font-semibold text-fg-muted">
                          {{ 'managementReview.sign.statement' | transloco }}
                        </dt>
                        <dd class="whitespace-pre-line text-fg">{{ r.signature_statement }}</dd>
                      </div>
                    }
                    @if (r.report_sha256) {
                      <div class="sm:col-span-2">
                        <dt class="text-[12px] font-semibold text-fg-muted">
                          {{ 'managementReview.sign.checksum' | transloco }}
                        </dt>
                        <dd class="font-mono text-[11.5px] break-all text-fg">
                          {{ r.report_sha256 }}
                        </dd>
                      </div>
                    }
                  </dl>
                </app-card>
              }
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="management_review"
                [entityId]="r.id"
                [canCreate]="r.can_edit"
                [defaultAssignee]="defaultAssignee()"
                [entityLabel]="r.code + ' ' + r.title"
              />
            </div>

            <ng-container aside>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="management_review" [entityId]="r.id" />
              </app-card>
              <app-why-it-matters [scope]="scope" page="detail" />
              <details class="rounded-card border border-border bg-surface p-4">
                <summary class="cursor-pointer text-[13.5px] font-semibold text-fg">
                  {{ 'managementReview.lessons.effectiveReview' | transloco }}
                </summary>
                <div class="mt-3"><app-lesson [scope]="scope" lesson="effective-review" /></div>
              </details>
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="signOpen()"
            [title]="'managementReview.sign.title' | transloco"
            [message]="'managementReview.sign.message' | transloco: { code: r.code }"
            [confirmLabel]="'managementReview.reviewActions.sign' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            confirmVariant="primary"
            [busy]="busy()"
            [confirmDisabled]="!signName().trim()"
            initialFocus="#mr-sign-name"
            (confirmed)="sign()"
            (cancelled)="signOpen.set(false)"
          >
            <div class="mt-3 flex flex-col gap-3">
              <app-form-field
                [label]="'managementReview.sign.name' | transloco"
                inputId="mr-sign-name"
              >
                <input
                  id="mr-sign-name"
                  type="text"
                  maxlength="200"
                  [value]="signName()"
                  (input)="signName.set($any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'managementReview.sign.statement' | transloco"
                inputId="mr-sign-statement"
              >
                <textarea
                  id="mr-sign-statement"
                  rows="3"
                  maxlength="2000"
                  [value]="signStatement()"
                  (input)="signStatement.set($any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
          </app-confirm-dialog>

          <app-prompt-dialog
            [open]="reasonFor() !== null"
            [title]="
              (reasonFor() === 'cancel'
                ? 'managementReview.cancel.title'
                : 'managementReview.return.title'
              ) | transloco
            "
            [message]="
              (reasonFor() === 'cancel'
                ? 'managementReview.cancel.message'
                : 'managementReview.return.message'
              ) | transloco
            "
            [label]="'managementReview.common.reason' | transloco"
            [confirmLabel]="actionKey(reasonFor() ?? 'return') | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [confirmVariant]="reasonFor() === 'cancel' ? 'danger' : 'primary'"
            [busy]="busy()"
            (confirmed)="confirmReason($event)"
            (cancelled)="reasonFor.set(null)"
          />

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'managementReview.detail.deleteTitle' | transloco"
            [message]="'managementReview.detail.deleteMessage' | transloco: { code: r.code }"
            [confirmLabel]="actionKey('delete') | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class ReviewDetailPage {
  private readonly api = inject(ManagementReviewApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  protected readonly scope = MR_SCOPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = REVIEW_FIELD_LABELS;
  protected readonly steps = REVIEW_STEPS;
  protected readonly outputFields = OUTPUT_FIELDS;
  protected readonly assessments = ASSESSMENTS;
  protected readonly draftSummaryAssist = ASSIST_DRAFT_INPUT_SUMMARY;
  protected readonly suggestAssist = ASSIST_SUGGEST_OUTPUTS;
  protected readonly statusKey = reviewStatusKey;
  protected readonly statusTone = reviewStatusTone;
  protected readonly frameworkKey = frameworkKey;
  protected readonly meetingStatusKey = meetingStatusKey;
  protected readonly actionKey = reviewActionKey;
  protected readonly missingKey = missingKey;
  protected readonly assessmentKey = assessmentKey;
  protected readonly categoryKey = decisionCategoryKey;
  protected readonly hintKey = inputHintKey;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly review = signal<ReviewDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly signOpen = signal(false);
  protected readonly signName = signal('');
  protected readonly signStatement = signal('');
  protected readonly reasonFor = signal<'return' | 'cancel' | null>(null);
  protected readonly customTitle = signal('');
  protected readonly notes = signal<Readonly<Record<string, string>>>({});
  protected readonly suggestions = signal<SuggestedOutputs['decisions']>([]);
  /** Missing items reported by a failed submit (else the server's list). */
  private readonly submitMissing = signal<readonly string[] | null>(null);

  protected readonly outputs = linkedSignal<ReviewDetail | null, OutputsDraft>({
    source: this.review,
    computation: (r, previous) => {
      // Keep unsaved text when only the meeting or the inputs changed.
      if (previous && previous.source && r && previous.source.id === r.id) {
        const before = outputsDraft(previous.source);
        const dirty = (Object.keys(before) as (keyof OutputsDraft)[]).some(
          (k) => before[k] !== previous.value[k],
        );
        if (dirty) {
          return previous.value;
        }
      }
      return r ? outputsDraft(r) : outputsDraft({} as ReviewDetail);
    },
  });

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(MR_PERMISSIONS.manage),
  );
  protected readonly headerActions = computed(() => HEADER_ACTIONS.filter((a) => this.allowed(a)));
  protected readonly stepIndex = computed(() => {
    const status = this.review()?.status;
    return status === 'signed' ? REVIEW_STEPS.length : REVIEW_STEPS.indexOf(status ?? 'planned');
  });
  protected readonly missing = computed(
    () => this.submitMissing() ?? this.review()?.missing_for_submit ?? [],
  );
  protected readonly showMissing = computed(() => {
    const status = this.review()?.status;
    return (status === 'planned' || status === 'in_progress') && this.missing().length > 0;
  });
  protected readonly reviewedCount = computed(
    () => this.review()?.inputs.filter((i) => i.reviewed).length ?? 0,
  );
  protected readonly outputsDirty = computed(() => {
    const r = this.review();
    return !!r && Object.keys(outputsPatch(r, this.outputs())).length > 0;
  });
  protected readonly defaultAssignee = computed<AssigneeIn | null>(() => {
    const owner = this.review()?.owner;
    return owner ? { type: 'user', value: owner.id } : null;
  });
  protected readonly askAssessmentPrompt = computed(() =>
    this.language.translate('managementReview.ai.prompts.askAssessment', {
      code: this.review()?.code ?? '-',
      title: this.review()?.title ?? '-',
    }),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: MR_MODULE,
      entityType: 'management_review',
      entityId: this.id(),
      view: 'detail',
      title: this.review()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
  }

  protected allowed(action: ReviewAction): boolean {
    return this.review()?.allowed_actions.includes(action) ?? false;
  }

  protected inputTitle(i: ReviewInput): string {
    const key = inputTitleKey(i);
    return key ? this.language.translate(key) : (i.title ?? '');
  }

  protected edit(): void {
    void this.router.navigate(['/management-review/reviews', this.id(), 'edit']);
  }

  protected askSummary(): void {
    const r = this.review();
    if (r) {
      this.ask.showWith(
        this.language.translate('managementReview.ai.prompts.summariseReview', {
          code: r.code,
          title: r.title,
        }),
      );
    }
  }

  // --- workflow ------------------------------------------------------------------------

  protected runAction(action: ReviewAction): void {
    switch (action) {
      case 'start':
        this.mutate((o, id) => this.api.start(o, id), 'managementReview.notices.started');
        break;
      case 'compile':
        this.mutate((o, id) => this.api.compile(o, id), 'managementReview.notices.compiled');
        break;
      case 'submit':
        this.submit();
        break;
      case 'sign':
        this.signName.set(this.auth.user()?.full_name ?? '');
        this.signStatement.set(this.language.translate('managementReview.sign.defaultStatement'));
        this.signOpen.set(true);
        break;
      case 'return':
      case 'cancel':
        this.reasonFor.set(action);
        break;
      case 'delete':
        this.confirmDelete.set(true);
        break;
    }
  }

  private submit(): void {
    if (this.outputsDirty()) {
      this.notifications.error('managementReview.errors.unsavedOutputs');
      return;
    }
    this.mutate(
      (o, id) => this.api.submit(o, id),
      'managementReview.notices.submitted',
      undefined,
      (error) => {
        if (mrErrorCode(error) === 'review_incomplete') {
          this.submitMissing.set(missingForSubmit(error));
        }
      },
    );
  }

  protected sign(): void {
    this.mutate(
      (o, id) =>
        this.api.sign(o, id, {
          signature_name: textOrNull(this.signName()),
          statement: textOrNull(this.signStatement()),
        }),
      'managementReview.notices.signed',
      () => this.signOpen.set(false),
    );
  }

  protected confirmReason(reason: string): void {
    const which = this.reasonFor();
    if (!which) {
      return;
    }
    this.mutate(
      (o, id) =>
        which === 'cancel'
          ? this.api.cancel(o, id, textOrNull(reason))
          : this.api.returnReview(o, id, textOrNull(reason)),
      which === 'cancel'
        ? 'managementReview.notices.cancelled'
        : 'managementReview.notices.returned',
      () => this.reasonFor.set(null),
    );
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteReview(orgId, this.id()).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('managementReview.notices.reviewDeleted');
        void this.router.navigate(['/management-review/reviews']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(mrErrorKey(error));
      },
    });
  }

  // --- inputs --------------------------------------------------------------------------

  protected noteDraft(i: ReviewInput): string {
    return this.notes()[i.id] ?? i.notes ?? '';
  }

  protected noteDirty(i: ReviewInput): boolean {
    const draft = this.notes()[i.id];
    return draft !== undefined && draft.trim() !== (i.notes ?? '').trim();
  }

  protected setNote(inputId: string, value: string): void {
    this.notes.update((n) => ({ ...n, [inputId]: value }));
  }

  protected saveNote(i: ReviewInput): void {
    const notes = textOrNull(this.notes()[i.id]);
    this.mutate(
      (o, id) => this.api.updateInput(o, id, i.id, { notes }),
      'managementReview.notices.notesSaved',
      () =>
        this.notes.update((n) => {
          const rest = { ...n };
          delete rest[i.id];
          return rest;
        }),
    );
  }

  protected setReviewed(i: ReviewInput, reviewed: boolean): void {
    this.mutate((o, id) => this.api.updateInput(o, id, i.id, { reviewed }), null);
  }

  protected addInput(): void {
    const title = this.customTitle().trim();
    if (!title) {
      return;
    }
    this.mutate(
      (o, id) => this.api.addInput(o, id, { title }),
      'managementReview.notices.inputAdded',
      () => this.customTitle.set(''),
    );
  }

  protected deleteInput(i: ReviewInput): void {
    this.mutate(
      (o, id) => this.api.deleteInput(o, id, i.id),
      'managementReview.notices.inputRemoved',
    );
  }

  // --- outputs -------------------------------------------------------------------------

  protected setOutput(key: keyof OutputsDraft, value: string): void {
    this.outputs.update((d) => ({ ...d, [key]: value }));
  }

  protected saveOutputs(): void {
    const r = this.review();
    if (!r) {
      return;
    }
    const patch = outputsPatch(r, this.outputs());
    if (!Object.keys(patch).length) {
      return;
    }
    this.submitMissing.set(null);
    this.mutate(
      (o, id) => this.api.updateReview(o, id, patch),
      'managementReview.notices.outputsSaved',
      () => {
        const fresh = this.review();
        if (fresh) {
          this.outputs.set(outputsDraft(fresh));
        }
      },
    );
  }

  protected onSuggestions(result: unknown): void {
    const decisions = (result as Partial<SuggestedOutputs> | null)?.decisions;
    this.suggestions.set(
      Array.isArray(decisions)
        ? decisions.filter(
            (d): d is SuggestedOutputs['decisions'][number] =>
              !!d && typeof d.text === 'string' && typeof d.category === 'string',
          )
        : [],
    );
  }

  protected useSuggestion(index: number): void {
    const s = this.suggestions()[index];
    if (!s) {
      return;
    }
    const field = outputFieldFor(s.category);
    this.outputs.update((d) => ({ ...d, [field]: appendLine(d[field], s.text) }));
    this.dismissSuggestion(index);
  }

  protected recordSuggestion(index: number): void {
    const s = this.suggestions()[index];
    const meeting = this.review()?.meeting;
    const orgId = this.selectedOrg.currentOrgId();
    if (!s || !meeting || !orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.addDecision(orgId, meeting.id, { text: s.text, category: s.category }).subscribe({
      next: (m) => {
        this.busy.set(false);
        this.notifications.success('managementReview.notices.decisionSaved');
        this.dismissSuggestion(index);
        this.onMeetingChanged(m);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(mrErrorKey(error));
      },
    });
  }

  protected dismissSuggestion(index: number): void {
    this.suggestions.update((list) => list.filter((_, i) => i !== index));
  }

  // --- meeting -------------------------------------------------------------------------

  protected onMeetingChanged(meeting: MeetingDetail): void {
    this.review.update((r) => (r ? { ...r, meeting } : r));
    this.submitMissing.set(null);
    // The meeting drives the submit checklist and the action counts: refresh quietly.
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  // --- plumbing ------------------------------------------------------------------------

  private mutate(
    call: (orgId: string, id: string) => Observable<ReviewDetail>,
    successKey: string | null,
    done?: () => void,
    failed?: (error: unknown) => void,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    call(orgId, this.id()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.submitMissing.set(null);
        this.review.set(r);
        done?.();
        if (successKey) {
          this.notifications.success(successKey);
        }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        failed?.(error);
        this.notifications.error(mrErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string, showLoading: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (showLoading) {
      this.state.set('loading');
      this.notes.set({});
      this.suggestions.set([]);
      this.submitMissing.set(null);
    }
    this.request = this.api.getReview(orgId, id).subscribe({
      next: (r) => {
        this.review.set(r);
        this.state.set('ready');
      },
      error: () => {
        if (showLoading) {
          this.state.set('error');
        }
      },
    });
  }
}
