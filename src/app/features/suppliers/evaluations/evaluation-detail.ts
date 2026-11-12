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
import { Observable, Subscription, of, switchMap } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import {
  blankToNull,
  decisionTone,
  evaluationStatusTone,
  previewScore,
  wireToDay,
} from '../data/supplier-display';
import { supplierErrorKey, unansweredIds } from '../data/supplier-errors';
import {
  APPROVAL_KINDS,
  DecideEvaluationRequest,
  DraftQuestionnaireResult,
  EvaluationDetail,
  QuestionIn,
} from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { SupplierUserSelect } from '../shared/people-select';
import {
  EditableQuestion,
  QuestionEditor,
  toEditable,
  toQuestionIn,
} from '../shared/question-editor';
import { EvaluationDecideDialog } from './decide-dialog';
import { AnswerChange, DraftAnswer, QuestionnaireAnswers } from './questionnaire-answers';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

export const EVALUATION_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'suppliers.evaluations.titleField',
  kind: 'suppliers.evaluations.kind',
  status: 'suppliers.fields.status',
  questions: 'suppliers.evaluation.questions',
  answers: 'suppliers.evaluation.answers',
  pass_score: 'suppliers.evaluation.passScore',
  score: 'suppliers.evaluation.score',
  recommendation: 'suppliers.evaluation.recommendation',
  decision: 'suppliers.decide.decision',
  decision_notes: 'suppliers.decide.notes',
  conditions: 'suppliers.decide.conditions',
  summary: 'suppliers.evaluation.summary',
  evaluator_user_id: 'suppliers.evaluations.evaluator',
  due_at: 'suppliers.evaluations.dueAt',
};

type Pending = 'reopen' | 'cancel' | 'delete' | null;

/** The answer draft of an evaluation (comments as plain strings). */
export function answersDraft(e: EvaluationDetail): Record<string, DraftAnswer> {
  const out: Record<string, DraftAnswer> = {};
  for (const [id, a] of Object.entries(e.answers)) {
    out[id] = { value: a.value, comment: a.comment ?? '' };
  }
  return out;
}

/** The PATCH `answers` body (answered or commented questions only). */
export function answersBody(
  draft: Readonly<Record<string, DraftAnswer>>,
): Record<string, { value: DraftAnswer['value']; comment: string | null }> {
  const out: Record<string, { value: DraftAnswer['value']; comment: string | null }> = {};
  for (const [id, a] of Object.entries(draft)) {
    if (a.value !== null || a.comment.trim()) {
      out[id] = { value: a.value, comment: a.comment.trim() || null };
    }
  }
  return out;
}

/**
 * An evaluation of a supplier (`/suppliers/:id/evaluations/:eid`). While a draft the
 * evaluator answers the questionnaire (with a live score) and may adjust the
 * questions, then submits. A submitted evaluation is decided by someone with approval
 * rights (or reopened); the score's recommendation is advisory. Shows the summary
 * (with an assistant summary of the responses), the decision and the shared record
 * tabs.
 */
@Component({
  selector: 'app-evaluation-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    MarkdownPipe,
    AiAssistButton,
    Alert,
    AskAbout,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EntityTasks,
    EvaluationDecideDialog,
    FieldHelp,
    FormField,
    GuideIntro,
    Icon,
    LessonView,
    ProgressBar,
    PromptDialog,
    QuestionEditor,
    QuestionnaireAnswers,
    RecordDetailLayout,
    SupplierUserSelect,
    WatchButton,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="mx-auto max-w-[1180px] px-4 pt-7 text-[14px] text-fg-muted sm:px-8">
          {{ 'suppliers.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            [routerLink]="['/suppliers', id()]"
            class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'suppliers.common.backToSupplier' | transloco }}
          </a>
          <app-alert>{{ 'suppliers.evaluation.notFound' | transloco }}</app-alert>
        </div>
      }
      @default {
        @if (evaluation(); as e) {
          <app-record-detail-layout
            entityType="supplier_evaluation"
            [entityId]="e.id"
            [tabs]="tabs"
            [canEdit]="e.can_edit"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            [backLink]="['/suppliers', e.supplier.id]"
            backLabelKey="suppliers.common.backToSupplier"
          >
            <div header>
              <div class="mb-1.5 flex flex-wrap items-center gap-2 text-[12.5px]">
                <a
                  [routerLink]="['/suppliers', e.supplier.id]"
                  class="font-semibold text-fg-muted hover:underline"
                >
                  <span class="font-mono">{{ e.supplier.code }}</span> {{ e.supplier.name }}
                </a>
                <app-badge tone="accent">
                  {{ 'suppliers.evaluationKind.' + e.kind | transloco }}
                </app-badge>
                <app-badge [tone]="statusTone(e.status)">
                  {{ 'suppliers.evaluationStatus.' + e.status | transloco }}
                </app-badge>
                @if (e.overdue) {
                  <app-badge tone="fail">{{ 'suppliers.common.overdue' | transloco }}</app-badge>
                }
              </div>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
              >
                {{ e.title }}
              </h1>
            </div>

            <ng-container actions>
              <app-watch-button entityType="supplier_evaluation" [entityId]="e.id" />
              @if (e.status === 'draft' && e.can_edit) {
                <app-button
                  variant="secondary"
                  size="sm"
                  [disabled]="!dirty()"
                  [loading]="saving()"
                  (click)="saveAnswers()"
                >
                  {{ 'suppliers.evaluation.saveAnswers' | transloco }}
                </app-button>
                <app-button size="sm" [loading]="busy()" (click)="submit()">
                  {{ 'suppliers.evaluation.submit' | transloco }}
                </app-button>
              }
              @if (e.status === 'submitted' && e.can_decide) {
                <app-button size="sm" (click)="openDecide()">
                  {{ 'suppliers.evaluation.decide' | transloco }}
                </app-button>
              }
              @if (e.status === 'submitted' && e.can_edit) {
                <app-button variant="secondary" size="sm" (click)="pending.set('reopen')">
                  {{ 'suppliers.evaluation.reopen' | transloco }}
                </app-button>
              }
              @if (isOpen() && e.can_edit) {
                <app-button variant="ghost" size="sm" (click)="pending.set('cancel')">
                  {{ 'suppliers.evaluation.cancel' | transloco }}
                </app-button>
              }
              @if (canManage()) {
                <app-button variant="ghost" size="sm" (click)="pending.set('delete')">
                  <app-icon name="trash" [size]="14" />
                  {{ 'suppliers.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-5">
              <app-guide-intro scope="suppliers" page="evaluation" />
              @if (actionError(); as key) {
                <app-alert>{{ key | transloco }}</app-alert>
              }
              @if (unanswered().length) {
                <app-alert>
                  {{
                    'suppliers.evaluation.unanswered' | transloco: { count: unanswered().length }
                  }}
                </app-alert>
              }

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="flex items-center gap-1 font-display text-[15px] font-bold text-fg">
                    {{ 'suppliers.evaluation.scoreTitle' | transloco }}
                    <app-field-help scope="suppliers" page="evaluation" field="score" />
                  </h2>
                  <app-ask-about
                    [prompt]="'suppliers.ai.prompts.explainScore' | transloco"
                    field="score"
                  />
                </div>
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p class="text-[12px] text-fg-muted">
                      {{ 'suppliers.evaluation.score' | transloco }}
                    </p>
                    <p class="font-display text-[22px] font-bold text-fg" data-testid="score">
                      {{ score() === null ? '–' : (score() | localNumber: '1.0-1') }}
                    </p>
                  </div>
                  <div>
                    <p class="text-[12px] text-fg-muted">
                      {{ 'suppliers.evaluation.passScore' | transloco }}
                    </p>
                    <p class="font-display text-[22px] font-bold text-fg">{{ e.pass_score }}</p>
                  </div>
                  <div>
                    <p class="text-[12px] text-fg-muted">
                      {{ 'suppliers.evaluation.answered' | transloco }}
                    </p>
                    <p class="font-display text-[22px] font-bold text-fg">
                      {{ preview().answered }} / {{ preview().total }}
                    </p>
                  </div>
                  <div>
                    <p class="text-[12px] text-fg-muted">
                      {{ 'suppliers.evaluation.recommendation' | transloco }}
                    </p>
                    @if (recommendation(); as rec) {
                      <app-badge [tone]="decisionTone(rec)">
                        {{ 'suppliers.recommendation.' + rec | transloco }}
                      </app-badge>
                    } @else {
                      <p class="text-[13px] text-fg-subtle">–</p>
                    }
                  </div>
                </div>
                <div class="mt-3">
                  <app-progress-bar
                    [value]="preview().total ? (preview().answered / preview().total) * 100 : 0"
                    [label]="'suppliers.evaluation.answered' | transloco"
                  />
                </div>
                @if (criticalFailures().length) {
                  <p class="mt-3 text-[13px] font-semibold text-fail" role="status">
                    {{
                      'suppliers.evaluation.criticalFailures'
                        | transloco: { count: criticalFailures().length }
                    }}
                  </p>
                }
                <p class="mt-2 text-[12px] text-fg-subtle">
                  {{ 'suppliers.evaluation.advisory' | transloco }}
                </p>
              </app-card>

              @if (e.status === 'completed' && e.decision) {
                <app-card>
                  <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                    {{ 'suppliers.evaluation.decisionTitle' | transloco }}
                  </h2>
                  <p class="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
                    <app-badge [tone]="decisionTone(e.decision)">
                      {{ 'suppliers.decision.' + e.decision | transloco }}
                    </app-badge>
                    @if (e.decided_at) {
                      {{
                        'suppliers.evaluation.decidedBy'
                          | transloco
                            : { name: e.decided_by?.name ?? '–', date: (e.decided_at | localDate) }
                      }}
                    }
                  </p>
                  @if (e.conditions) {
                    <h3 class="mt-2 text-[12px] font-semibold text-fg-muted">
                      {{ 'suppliers.decide.conditions' | transloco }}
                    </h3>
                    <p class="text-[13.5px] whitespace-pre-line text-fg">{{ e.conditions }}</p>
                  }
                  @if (e.decision_notes) {
                    <h3 class="mt-2 text-[12px] font-semibold text-fg-muted">
                      {{ 'suppliers.decide.notes' | transloco }}
                    </h3>
                    <p class="text-[13.5px] whitespace-pre-line text-fg">{{ e.decision_notes }}</p>
                  }
                  <p class="mt-3 text-[12px] text-fg-subtle">
                    {{
                      (setsStatus()
                        ? 'suppliers.decide.setsStatus'
                        : 'suppliers.decide.recordsOnly'
                      ) | transloco
                    }}
                  </p>
                </app-card>
              }

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'suppliers.evaluation.questions' | transloco }}
                  </h2>
                  @if (e.status === 'draft' && e.can_edit && !editingQuestions()) {
                    <app-button variant="ghost" size="sm" (click)="startEditQuestions()">
                      {{ 'suppliers.evaluation.editQuestions' | transloco }}
                    </app-button>
                  }
                </div>
                @if (editingQuestions()) {
                  <div class="mb-3 flex flex-wrap items-center gap-2">
                    <app-ai-assist-button
                      assist="suppliers.draft_questionnaire"
                      labelKey="suppliers.ai.draftQuestions"
                      [input]="{ kind: e.kind, count: 5, supplier_id: e.supplier.id }"
                      (result)="addDrafted($event)"
                    />
                    <label class="flex items-center gap-2 text-[13px] text-fg-muted">
                      {{ 'suppliers.evaluation.passScore' | transloco }}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        class="h-9 w-20 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
                        [value]="passDraft()"
                        (change)="passDraft.set(+$any($event.target).value)"
                      />
                    </label>
                  </div>
                  <app-question-editor
                    [questions]="questionDraft()"
                    [disabled]="saving()"
                    (questionsChange)="questionDraft.set($event)"
                  />
                  <p class="mt-2 text-[12px] text-fg-subtle">
                    {{ 'suppliers.evaluation.questionsHint' | transloco }}
                  </p>
                  <div class="mt-3 flex justify-end gap-2">
                    <app-button variant="ghost" size="sm" (click)="editingQuestions.set(false)">
                      {{ 'common.cancel' | transloco }}
                    </app-button>
                    <app-button size="sm" [loading]="saving()" (click)="saveQuestions()">
                      {{ 'suppliers.evaluation.saveQuestions' | transloco }}
                    </app-button>
                  </div>
                } @else {
                  <app-questionnaire-answers
                    [questions]="e.questions"
                    [answers]="answers()"
                    [editable]="e.status === 'draft' && e.can_edit"
                    [highlight]="unanswered()"
                    (answerChange)="setAnswer($event)"
                  />
                }
              </app-card>

              <app-card>
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="flex items-center gap-1 font-display text-[15px] font-bold text-fg">
                    {{ 'suppliers.evaluation.summary' | transloco }}
                    <app-field-help scope="suppliers" page="evaluation" field="summary" />
                  </h2>
                  <app-ai-assist-button
                    assist="suppliers.summarise_responses"
                    labelKey="suppliers.ai.summariseResponses"
                    entityType="supplier_evaluation"
                    [entityId]="e.id"
                    [input]="{ evaluation_id: e.id }"
                    (text)="aiSummary.set($event)"
                  />
                </div>
                @if (aiSummary(); as text) {
                  <div
                    class="mb-3 rounded-tile border border-accent bg-accent-soft p-3"
                    aria-live="polite"
                  >
                    <p class="mb-1 text-[12px] font-semibold text-accent">
                      {{ 'suppliers.ai.suggestion' | transloco }}
                    </p>
                    <div
                      class="cf-prose text-[13.5px] text-fg"
                      [innerHTML]="text | appMarkdown"
                    ></div>
                    <div class="mt-2 flex gap-2">
                      @if (canEditSummary()) {
                        <app-button size="sm" variant="secondary" (click)="useAiSummary(text)">
                          {{ 'suppliers.ai.useSummary' | transloco }}
                        </app-button>
                      }
                      <app-button size="sm" variant="ghost" (click)="aiSummary.set(null)">
                        {{ 'suppliers.ai.discard' | transloco }}
                      </app-button>
                    </div>
                  </div>
                }
                @if (canEditSummary()) {
                  <label class="sr-only" for="ev-summary">{{
                    'suppliers.evaluation.summary' | transloco
                  }}</label>
                  <textarea
                    id="ev-summary"
                    rows="4"
                    maxlength="20000"
                    class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-[13.5px] text-fg"
                    [placeholder]="'suppliers.evaluation.summaryPlaceholder' | transloco"
                    [value]="summaryDraft()"
                    (input)="summaryDraft.set($any($event.target).value)"
                  ></textarea>
                  <div class="mt-2 flex justify-end">
                    <app-button
                      size="sm"
                      variant="secondary"
                      [disabled]="summaryDraft() === (e.summary ?? '')"
                      [loading]="saving()"
                      (click)="saveSummary()"
                    >
                      {{ 'suppliers.evaluation.saveSummary' | transloco }}
                    </app-button>
                  </div>
                } @else if (e.summary) {
                  <div
                    class="cf-prose text-[13.5px] text-fg"
                    [innerHTML]="e.summary | appMarkdown"
                  ></div>
                } @else {
                  <p class="text-[13.5px] text-fg-subtle">
                    {{ 'suppliers.evaluation.noSummary' | transloco }}
                  </p>
                }
              </app-card>

              <app-why-it-matters scope="suppliers" page="evaluation" />
            </div>

            <ng-container aside>
              <app-card>
                <div class="mb-2 flex items-center justify-between gap-2">
                  <h2 class="font-display text-[14px] font-bold text-fg">
                    {{ 'suppliers.evaluation.details' | transloco }}
                  </h2>
                  @if (isOpen() && e.can_edit && !editingDetails()) {
                    <button
                      type="button"
                      class="text-[12.5px] font-semibold text-accent hover:underline"
                      (click)="startEditDetails()"
                    >
                      {{ 'suppliers.common.edit' | transloco }}
                    </button>
                  }
                </div>
                @if (editingDetails()) {
                  <form
                    class="flex flex-col gap-3"
                    (submit)="$event.preventDefault(); saveDetails()"
                  >
                    <app-form-field
                      [label]="'suppliers.evaluations.titleField' | transloco"
                      inputId="ed-title"
                    >
                      <input
                        id="ed-title"
                        type="text"
                        maxlength="255"
                        [value]="titleDraft()"
                        (input)="titleDraft.set($any($event.target).value)"
                      />
                    </app-form-field>
                    <app-form-field
                      [label]="'suppliers.evaluations.evaluator' | transloco"
                      inputId="ed-user"
                    >
                      <app-supplier-user-select
                        inputId="ed-user"
                        [value]="evaluatorDraft()"
                        [currentName]="e.evaluator?.name ?? null"
                        (valueChange)="evaluatorDraft.set($event)"
                      />
                    </app-form-field>
                    <app-form-field
                      [label]="'suppliers.evaluations.dueAt' | transloco"
                      inputId="ed-due"
                    >
                      <input
                        id="ed-due"
                        type="date"
                        [value]="dueDraft()"
                        (input)="dueDraft.set($any($event.target).value)"
                      />
                    </app-form-field>
                    <div class="flex justify-end gap-2">
                      <app-button variant="ghost" size="sm" (click)="editingDetails.set(false)">
                        {{ 'common.cancel' | transloco }}
                      </app-button>
                      <app-button
                        size="sm"
                        type="submit"
                        [loading]="saving()"
                        [disabled]="!titleDraft().trim()"
                      >
                        {{ 'common.save' | transloco }}
                      </app-button>
                    </div>
                  </form>
                } @else {
                  <dl class="flex flex-col gap-2 text-[13px]">
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'suppliers.evaluations.evaluator' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{ e.evaluator?.name ?? ('suppliers.common.nobody' | transloco) }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'suppliers.evaluations.dueAt' | transloco }}
                      </dt>
                      <dd [class.text-fail]="e.overdue">
                        {{ e.due_at ? (e.due_at | localDay) : '–' }}
                      </dd>
                    </div>
                    @if (e.submitted_at) {
                      <div>
                        <dt class="text-[12px] text-fg-muted">
                          {{ 'suppliers.evaluation.submitted' | transloco }}
                        </dt>
                        <dd class="text-fg">
                          {{ e.submitted_at | localDate }}
                          @if (e.submitted_by?.name; as name) {
                            · {{ name }}
                          }
                        </dd>
                      </div>
                    }
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'suppliers.evaluation.createdBy' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{ e.created_by?.name ?? '–' }} · {{ e.created_at | localDay }}
                      </dd>
                    </div>
                  </dl>
                }
              </app-card>
              <app-card>
                <h2 class="mb-2 font-display text-[14px] font-bold text-fg">
                  {{ 'suppliers.detail.learn' | transloco }}
                </h2>
                <app-lesson scope="suppliers" lesson="evaluating-suppliers" />
              </app-card>
            </ng-container>

            <div tasks>
              <app-entity-tasks
                entityType="supplier_evaluation"
                [entityId]="e.id"
                [canCreate]="e.can_edit"
                [entityLabel]="e.title"
              />
            </div>
          </app-record-detail-layout>

          <app-evaluation-decide-dialog
            [open]="decideOpen()"
            [kind]="e.kind"
            [recommendation]="e.recommendation"
            [busy]="busy()"
            [error]="decideError()"
            (confirmed)="decide($event)"
            (cancelled)="decideOpen.set(false)"
          />

          <app-prompt-dialog
            [open]="pending() === 'reopen' || pending() === 'cancel'"
            [title]="
              (pending() === 'cancel'
                ? 'suppliers.evaluation.cancelTitle'
                : 'suppliers.evaluation.reopenTitle'
              ) | transloco
            "
            [message]="
              (pending() === 'cancel'
                ? 'suppliers.evaluation.cancelMessage'
                : 'suppliers.evaluation.reopenMessage'
              ) | transloco
            "
            [label]="'suppliers.evaluation.reason' | transloco"
            [confirmLabel]="
              (pending() === 'cancel'
                ? 'suppliers.evaluation.cancel'
                : 'suppliers.evaluation.reopen'
              ) | transloco
            "
            [cancelLabel]="'common.cancel' | transloco"
            [confirmVariant]="pending() === 'cancel' ? 'danger' : 'primary'"
            [busy]="busy()"
            (confirmed)="transition($event)"
            (cancelled)="pending.set(null)"
          />

          <app-confirm-dialog
            [open]="pending() === 'delete'"
            [title]="'suppliers.evaluation.deleteTitle' | transloco"
            [message]="'suppliers.evaluation.deleteMessage' | transloco: { title: e.title }"
            [confirmLabel]="'suppliers.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="pending.set(null)"
          />
        }
      }
    }
  `,
})
export class EvaluationDetailPage {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Supplier id (route `:id`). */
  readonly id = input.required<string>();
  /** Evaluation id (route `:eid`). */
  readonly eid = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = EVALUATION_FIELD_LABELS;
  protected readonly statusTone = evaluationStatusTone;
  protected readonly decisionTone = decisionTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly evaluation = signal<EvaluationDetail | null>(null);
  protected readonly answers = signal<Record<string, DraftAnswer>>({});
  protected readonly dirty = signal(false);
  protected readonly unanswered = signal<readonly string[]>([]);
  protected readonly busy = signal(false);
  protected readonly saving = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly pending = signal<Pending>(null);
  protected readonly decideOpen = signal(false);
  protected readonly decideError = signal<string | null>(null);

  protected readonly editingQuestions = signal(false);
  protected readonly questionDraft = signal<readonly EditableQuestion[]>([]);
  protected readonly passDraft = signal(70);

  protected readonly editingDetails = signal(false);
  protected readonly titleDraft = signal('');
  protected readonly evaluatorDraft = signal('');
  protected readonly dueDraft = signal('');

  protected readonly summaryDraft = signal('');
  protected readonly aiSummary = signal<string | null>(null);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canManage = computed(() => this.permissions().includes('suppliers:manage'));
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));

  protected readonly isOpen = computed(() => {
    const s = this.evaluation()?.status;
    return s === 'draft' || s === 'submitted';
  });
  protected readonly setsStatus = computed(() => {
    const e = this.evaluation();
    return !!e && APPROVAL_KINDS.includes(e.kind);
  });
  protected readonly canEditSummary = computed(() => {
    const e = this.evaluation();
    return !!e && e.can_edit && e.status !== 'cancelled';
  });

  /** The live score while answering a draft (the server value otherwise). */
  protected readonly preview = computed(() => {
    const e = this.evaluation();
    return e ? previewScore(e.questions, this.answers(), e.pass_score) : previewScore([], {}, 70);
  });
  protected readonly score = computed(() => {
    const e = this.evaluation();
    return e && e.status === 'draft' ? this.preview().score : (e?.score ?? null);
  });
  protected readonly recommendation = computed(() => {
    const e = this.evaluation();
    return e && e.status === 'draft' ? this.preview().recommendation : (e?.recommendation ?? null);
  });
  protected readonly criticalFailures = computed(() => {
    const e = this.evaluation();
    return e && e.status === 'draft'
      ? this.preview().criticalFailures
      : (e?.critical_failures ?? []);
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const e = this.evaluation();
      return {
        module: 'suppliers',
        entityType: 'supplier_evaluation',
        entityId: this.eid(),
        view: 'detail',
        title: e ? `${e.supplier.code} ${e.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const eid = this.eid();
      untracked(() => this.load(orgId, eid));
    });
  }

  protected setAnswer(change: AnswerChange): void {
    this.answers.update((a) => ({ ...a, [change.id]: change.answer }));
    this.dirty.set(true);
  }

  protected saveAnswers(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const e = this.evaluation();
    if (!orgId || !e || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.actionError.set(null);
    this.api.updateEvaluation(orgId, e.id, { answers: answersBody(this.answers()) }).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.apply(updated);
        this.notifications.success('suppliers.evaluation.answersSaved');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.actionError.set(supplierErrorKey(err));
      },
    });
  }

  protected submit(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const e = this.evaluation();
    if (!orgId || !e || this.busy()) {
      return;
    }
    const missing = this.preview().unanswered;
    if (missing.length) {
      this.unanswered.set(missing);
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    const save$: Observable<unknown> = this.dirty()
      ? this.api.updateEvaluation(orgId, e.id, { answers: answersBody(this.answers()) })
      : of(null);
    save$.pipe(switchMap(() => this.api.submitEvaluation(orgId, e.id))).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.apply(updated);
        this.notifications.success('suppliers.evaluation.submittedToast');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const ids = unansweredIds(err);
        if (ids.length) {
          this.unanswered.set(ids);
        } else {
          this.actionError.set(supplierErrorKey(err));
        }
      },
    });
  }

  protected openDecide(): void {
    this.decideError.set(null);
    this.decideOpen.set(true);
  }

  protected decide(body: DecideEvaluationRequest): void {
    const orgId = this.selectedOrg.currentOrgId();
    const e = this.evaluation();
    if (!orgId || !e || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.decideError.set(null);
    this.api.decideEvaluation(orgId, e.id, body).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.decideOpen.set(false);
        this.apply(updated);
        this.notifications.success('suppliers.evaluation.decidedToast');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.decideError.set(supplierErrorKey(err));
      },
    });
  }

  protected transition(reason: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const e = this.evaluation();
    const action = this.pending();
    if (!orgId || !e || this.busy() || (action !== 'reopen' && action !== 'cancel')) {
      return;
    }
    const call =
      action === 'reopen'
        ? this.api.reopenEvaluation(orgId, e.id, blankToNull(reason))
        : this.api.cancelEvaluation(orgId, e.id, blankToNull(reason));
    this.busy.set(true);
    this.actionError.set(null);
    call.subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.pending.set(null);
        this.apply(updated);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.pending.set(null);
        this.actionError.set(supplierErrorKey(err));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const e = this.evaluation();
    if (!orgId || !e || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteEvaluation(orgId, e.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.pending.set(null);
        this.notifications.success('suppliers.evaluation.deleted');
        void this.router.navigate(['/suppliers', e.supplier.id]);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.pending.set(null);
        this.actionError.set(supplierErrorKey(err));
      },
    });
  }

  protected startEditQuestions(): void {
    const e = this.evaluation();
    if (!e) {
      return;
    }
    this.questionDraft.set(e.questions.map(toEditable));
    this.passDraft.set(e.pass_score);
    this.editingQuestions.set(true);
  }

  protected addDrafted(result: unknown): void {
    const questions = (result as DraftQuestionnaireResult | null)?.questions;
    if (!Array.isArray(questions)) {
      return;
    }
    const drafted = (questions as QuestionIn[])
      .filter((q) => typeof q?.text === 'string' && q.text.trim())
      .map((q) => toEditable({ ...q, id: null }));
    this.questionDraft.update((rows) => [...rows, ...drafted]);
  }

  protected saveQuestions(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const e = this.evaluation();
    const questions = toQuestionIn(this.questionDraft());
    if (!orgId || !e || this.saving()) {
      return;
    }
    if (questions.length === 0) {
      this.actionError.set('suppliers.errors.questions_required');
      return;
    }
    const pass = Math.min(100, Math.max(0, Math.round(this.passDraft() || 0)));
    this.saving.set(true);
    this.actionError.set(null);
    this.api.updateEvaluation(orgId, e.id, { questions, pass_score: pass }).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.editingQuestions.set(false);
        this.apply(updated);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.actionError.set(supplierErrorKey(err));
      },
    });
  }

  protected startEditDetails(): void {
    const e = this.evaluation();
    if (!e) {
      return;
    }
    this.titleDraft.set(e.title);
    this.evaluatorDraft.set(e.evaluator?.id ?? '');
    this.dueDraft.set(wireToDay(e.due_at));
    this.editingDetails.set(true);
  }

  protected saveDetails(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const e = this.evaluation();
    if (!orgId || !e || this.saving() || !this.titleDraft().trim()) {
      return;
    }
    const due = this.dueDraft();
    this.saving.set(true);
    this.actionError.set(null);
    this.api
      .updateEvaluation(orgId, e.id, {
        title: this.titleDraft().trim(),
        evaluator_user_id: this.evaluatorDraft() || null,
        due_at: due ? `${due}T23:59:59` : null,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.editingDetails.set(false);
          this.apply(updated);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.actionError.set(supplierErrorKey(err));
        },
      });
  }

  protected useAiSummary(text: string): void {
    this.summaryDraft.set(text);
    this.aiSummary.set(null);
  }

  protected saveSummary(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const e = this.evaluation();
    if (!orgId || !e || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.actionError.set(null);
    this.api
      .updateEvaluation(orgId, e.id, { summary: blankToNull(this.summaryDraft()) })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.apply(updated);
          this.notifications.success('suppliers.evaluation.summarySaved');
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.actionError.set(supplierErrorKey(err));
        },
      });
  }

  /** Take a fresh server copy; keeps nothing stale from the drafts. */
  private apply(e: EvaluationDetail): void {
    this.evaluation.set(e);
    this.answers.set(answersDraft(e));
    this.summaryDraft.set(e.summary ?? '');
    this.dirty.set(false);
    this.unanswered.set([]);
  }

  private load(orgId: string | null, eid: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getEvaluation(orgId, eid).subscribe({
      next: (e) => {
        this.apply(e);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
