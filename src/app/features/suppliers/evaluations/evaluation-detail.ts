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
import { AiAvailability } from '../../../core/ai/ai-availability';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { ClauseChips } from '../../../shared/guidance/clause-chips';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  blankToNull,
  decisionBadge,
  evaluationStatusBadge,
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
  UpdateEvaluationRequest,
} from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { SupplierUserSelect } from '../shared/people-select';
import { questionnaireLang } from '../detail/start-evaluation-dialog';
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

type Pending = 'reopen' | 'cancel' | 'delete' | 'submitNoSummary' | null;

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
    Button,
    Card,
    ClauseChips,
    ConfirmDialog,
    EntityTasks,
    ErrorState,
    EvaluationDecideDialog,
    FieldHelp,
    FormField,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ProgressBar,
    PromptDialog,
    QuestionEditor,
    QuestionnaireAnswers,
    RecordDetailLayout,
    StatusBadge,
    SupplierUserSelect,
    WatchButton,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8"><app-loading-state [rows]="6" /></div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            [routerLink]="['/suppliers', id()]"
            class="mb-3 inline-flex items-center gap-1 text-ui font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'suppliers.common.backToSupplier' | transloco }}
          </a>
          <app-error-state
            titleKey="suppliers.evaluation.notFoundTitle"
            bodyKey="suppliers.evaluation.notFound"
            (retry)="reload()"
          />
        </div>
      }
      @default {
        @if (evaluation(); as e) {
          <app-record-detail-layout
            entityType="supplier_evaluation"
            [entityId]="e.id"
            [title]="e.title"
            [breadcrumbs]="[
              { labelKey: 'modules.names.suppliers', link: '/suppliers' },
              { label: e.supplier.name, link: ['/suppliers', e.supplier.id] },
              { label: e.title },
            ]"
            [tabs]="tabs"
            [canEdit]="e.can_edit"
            [requirementsPanel]="true"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            [backLink]="['/suppliers', e.supplier.id]"
            backLabelKey="suppliers.common.backToSupplier"
          >
            <ng-container ngProjectAs="[meta]">
              <a
                [routerLink]="['/suppliers', e.supplier.id]"
                class="font-semibold hover:underline"
                data-testid="evaluation-supplier"
              >
                <span class="font-mono">{{ e.supplier.code }}</span> {{ e.supplier.name }}
              </a>
              <span aria-hidden="true">·</span>
              <span>{{ 'suppliers.evaluationKind.' + e.kind | transloco }}</span>
              @let st = statusBadge(e.status);
              <app-status-badge
                [meaning]="st.meaning"
                [value]="st.value"
                [labelKey]="'suppliers.evaluationStatus.' + e.status"
              />
              @if (e.overdue && isOpen()) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="suppliers.common.overdue"
                />
              }
            </ng-container>

            @if (e.status === 'draft' && e.can_edit) {
              <app-button primary [loading]="busy()" (click)="submit()">
                {{ 'suppliers.evaluation.submit' | transloco }}
              </app-button>
            }
            @if (e.status === 'submitted' && e.can_decide) {
              <app-button primary (click)="openDecide()">
                {{ 'suppliers.evaluation.decide' | transloco }}
              </app-button>
            }
            @if (e.status === 'draft' && e.can_edit) {
              <app-button
                secondary
                variant="secondary"
                [disabled]="!dirty() && !summaryDirty()"
                [loading]="saving()"
                (click)="saveAnswers()"
              >
                {{ 'suppliers.evaluation.saveAnswers' | transloco }}
              </app-button>
            }
            @if (e.status === 'submitted' && e.can_edit) {
              <app-button secondary variant="secondary" (click)="pending.set('reopen')">
                {{ 'suppliers.evaluation.reopen' | transloco }}
              </app-button>
            }
            <app-watch-button secondary entityType="supplier_evaluation" [entityId]="e.id" />
            @if (isOpen() && e.can_edit) {
              <button appMenuItem overflow type="button" (click)="pending.set('cancel')">
                {{ 'suppliers.evaluation.cancel' | transloco }}
              </button>
            }
            @if (canManage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="pending.set('delete')"
              >
                {{ 'suppliers.common.delete' | transloco }}
              </button>
            }

            <app-help-strip
              help
              scope="suppliers"
              page="evaluation"
              [lesson]="e.kind === 'security' ? 'third-party-security' : 'evaluating-suppliers'"
            />

            <div class="flex flex-col gap-5">
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
                  <h2 class="flex items-center gap-1.5 font-display text-card font-bold text-fg">
                    {{ 'suppliers.evaluation.scoreTitle' | transloco }}
                    <app-field-help scope="suppliers" page="evaluation" field="score" />
                  </h2>
                  @if (!ai.unavailable()) {
                    <app-button variant="ghost" size="sm" (click)="askScore()">
                      <app-icon name="spark" [size]="14" />
                      {{ 'suppliers.ai.explainScore' | transloco }}
                    </app-button>
                  }
                </div>
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p class="text-meta text-fg-muted">
                      {{ 'suppliers.evaluation.score' | transloco }}
                    </p>
                    <p class="font-display text-section font-bold text-fg" data-testid="score">
                      @if (score() === null) {
                        –
                      } @else {
                        {{ score() | localNumber: '1.0-1' }}
                        <span class="text-ui font-normal text-fg-muted">/ 100</span>
                      }
                    </p>
                  </div>
                  <div>
                    <p class="text-meta text-fg-muted">
                      {{ 'suppliers.evaluation.passScore' | transloco }}
                    </p>
                    <p class="font-display text-section font-bold text-fg">{{ e.pass_score }}</p>
                  </div>
                  <div>
                    <p class="text-meta text-fg-muted">
                      {{ 'suppliers.evaluation.answered' | transloco }}
                    </p>
                    <p class="font-display text-section font-bold text-fg">
                      {{ preview().answered }} / {{ preview().total }}
                    </p>
                  </div>
                  <div>
                    <p class="text-meta text-fg-muted">
                      {{ 'suppliers.evaluation.recommendation' | transloco }}
                    </p>
                    @if (recommendation(); as rec) {
                      @let rb = decision(rec);
                      <app-status-badge
                        [meaning]="rb.meaning"
                        [value]="rb.value"
                        [labelKey]="'suppliers.recommendation.' + rec"
                      />
                    } @else {
                      <p class="text-ui text-fg-subtle">–</p>
                    }
                  </div>
                </div>
                <p class="mt-2 text-meta text-fg-muted" data-testid="score-meaning">
                  {{ 'suppliers.evaluation.scoreMeaning' | transloco: { pass: e.pass_score } }}
                </p>
                <div class="mt-3">
                  <app-progress-bar
                    [value]="preview().total ? (preview().answered / preview().total) * 100 : 0"
                    [label]="'suppliers.evaluation.answered' | transloco"
                  />
                </div>
                @if (criticalFailures().length) {
                  <p class="mt-3 text-ui font-semibold text-fail-ink" role="status">
                    {{
                      'suppliers.evaluation.criticalFailures'
                        | transloco: { count: criticalFailures().length }
                    }}
                  </p>
                }
                @if (canRaiseDeviation()) {
                  <div
                    class="mt-3 flex flex-wrap items-center gap-2 rounded-tile bg-surface-2 px-3 py-2"
                    data-testid="raise-deviation-box"
                  >
                    <p class="min-w-0 flex-1 text-ui text-fg-muted">
                      {{ 'suppliers.evaluation.raiseDeviationHint' | transloco }}
                    </p>
                    <app-button size="sm" variant="secondary" (click)="raiseDeviation()">
                      {{ 'suppliers.evaluation.raiseDeviation' | transloco }}
                    </app-button>
                  </div>
                }
                <p class="mt-2 text-meta text-fg-subtle">
                  {{ 'suppliers.evaluation.advisory' | transloco }}
                </p>
              </app-card>

              @if (e.status === 'completed' && e.decision) {
                <app-card>
                  <h2 class="mb-2 font-display text-card font-bold text-fg">
                    {{ 'suppliers.evaluation.decisionTitle' | transloco }}
                  </h2>
                  <p class="mb-2 flex flex-wrap items-center gap-2 text-ui text-fg-muted">
                    @let db = decision(e.decision);
                    <app-status-badge
                      [meaning]="db.meaning"
                      [value]="db.value"
                      [labelKey]="'suppliers.decision.' + e.decision"
                    />
                    @if (e.decided_at) {
                      {{
                        'suppliers.evaluation.decidedBy'
                          | transloco
                            : { name: e.decided_by?.name ?? '–', date: (e.decided_at | localDate) }
                      }}
                    }
                  </p>
                  @if (e.conditions) {
                    <h3 class="mt-2 text-meta font-semibold text-fg-muted">
                      {{ 'suppliers.decide.conditions' | transloco }}
                    </h3>
                    <p class="text-body whitespace-pre-line text-fg">{{ e.conditions }}</p>
                  }
                  @if (e.decision_notes) {
                    <h3 class="mt-2 text-meta font-semibold text-fg-muted">
                      {{ 'suppliers.decide.notes' | transloco }}
                    </h3>
                    <p class="text-body whitespace-pre-line text-fg">{{ e.decision_notes }}</p>
                  }
                  <p class="mt-3 text-meta text-fg-subtle">
                    {{
                      (setsStatus()
                        ? 'suppliers.decide.setsStatus'
                        : 'suppliers.decide.recordsOnly'
                      ) | transloco
                    }}
                  </p>
                  @if (checkedRefs().length) {
                    <p
                      class="mt-2 flex flex-wrap items-baseline gap-x-1 text-meta"
                      data-testid="evidence-note"
                    >
                      <span class="text-fg-subtle">{{
                        'suppliers.evaluation.evidenceFor' | transloco
                      }}</span>
                      <app-clause-chips [clauses]="checkedRefs()" />
                    </p>
                  }
                </app-card>
              }

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
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
                    <label class="flex items-center gap-2 text-ui text-fg-muted">
                      {{ 'suppliers.evaluation.passScore' | transloco }}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        class="h-9 w-20 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                        [value]="passDraft()"
                        (change)="passDraft.set(+$any($event.target).value)"
                      />
                    </label>
                    <app-field-help scope="suppliers" page="questionnaire" field="pass_score" />
                  </div>
                  <app-question-editor
                    [questions]="questionDraft()"
                    [disabled]="saving()"
                    (questionsChange)="questionDraft.set($event)"
                  />
                  <p class="mt-2 text-meta text-fg-subtle">
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
                  <h2 class="flex items-center gap-1 font-display text-card font-bold text-fg">
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
                    <p class="mb-1 text-meta font-semibold text-accent">
                      {{ 'suppliers.ai.suggestion' | transloco }}
                    </p>
                    <div class="cf-prose text-body text-fg" [innerHTML]="text | appMarkdown"></div>
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
                    class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-body text-fg"
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
                    class="cf-prose text-body text-fg"
                    [innerHTML]="e.summary | appMarkdown"
                  ></div>
                } @else {
                  <p class="text-body text-fg-subtle">
                    {{ 'suppliers.evaluation.noSummary' | transloco }}
                  </p>
                }
              </app-card>

              <app-why-it-matters scope="suppliers" page="evaluation" />
            </div>

            <ng-container aside>
              <app-card>
                <div class="mb-2 flex items-center justify-between gap-2">
                  <h2 class="font-display text-body font-bold text-fg">
                    {{ 'suppliers.evaluation.details' | transloco }}
                  </h2>
                  @if (isOpen() && e.can_edit && !editingDetails()) {
                    <button
                      type="button"
                      class="text-meta font-semibold text-accent hover:underline"
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
                        [attr.lang]="lang()"
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
                  <dl class="flex flex-col gap-2 text-ui">
                    <div>
                      <dt class="text-meta text-fg-muted">
                        {{ 'suppliers.evaluations.evaluator' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{ e.evaluator?.name ?? ('suppliers.common.nobody' | transloco) }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-meta text-fg-muted">
                        {{ 'suppliers.evaluations.dueAt' | transloco }}
                      </dt>
                      <dd [class.text-warn-ink]="e.overdue && isOpen()">
                        {{ e.due_at ? (e.due_at | localDay) : '–' }}
                      </dd>
                    </div>
                    @if (e.submitted_at) {
                      <div>
                        <dt class="text-meta text-fg-muted">
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
                      <dt class="text-meta text-fg-muted">
                        {{ 'suppliers.evaluation.createdBy' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{ e.created_by?.name ?? '–' }} · {{ e.created_at | localDay }}
                      </dd>
                    </div>
                  </dl>
                }
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
            [open]="pending() === 'submitNoSummary'"
            [title]="'suppliers.evaluation.submitNoSummaryTitle' | transloco"
            [message]="'suppliers.evaluation.submitNoSummaryMessage' | transloco"
            [confirmLabel]="'suppliers.evaluation.submitAnyway' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            confirmVariant="primary"
            [busy]="busy()"
            (confirmed)="submit(true)"
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
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly flows = inject(CreateFlowService);
  protected readonly ai = inject(AiAvailability);

  /** Supplier id (route `:id`). */
  readonly id = input.required<string>();
  /** Evaluation id (route `:eid`). */
  readonly eid = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = EVALUATION_FIELD_LABELS;
  protected readonly statusBadge = evaluationStatusBadge;
  protected readonly decision = decisionBadge;
  /** Built-in questions and default titles come back in the UI language. */
  protected readonly lang = computed(() => questionnaireLang(this.language.active()));

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
  /** The summary box holds text that is not on the server yet (e.g. an adopted suggestion). */
  protected readonly summaryDirty = computed(
    () => this.canEditSummary() && this.summaryDraft() !== (this.evaluation()?.summary ?? ''),
  );

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
  /** Every clause the questions check (a decided evaluation is evidence for them). */
  protected readonly checkedRefs = computed(() => {
    const refs = new Set<string>();
    for (const q of this.evaluation()?.questions ?? []) {
      for (const ref of q.requirement_refs ?? []) {
        refs.add(ref);
      }
    }
    return [...refs];
  });
  /** Failed critical questions or a rejection: offer "Registrer avvik" (create from here). */
  protected readonly canRaiseDeviation = computed(() => {
    const e = this.evaluation();
    return (
      !!e &&
      e.can_edit &&
      this.permissions().includes('deviations:write') &&
      (e.decision === 'rejected' || (e.status !== 'draft' && this.criticalFailures().length > 0))
    );
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
        requirements: this.checkedRefs(),
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const eid = this.eid();
      const lang = this.lang();
      untracked(() => this.load(orgId, eid, lang));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.eid(), this.lang());
  }

  protected askScore(): void {
    this.ask.showWith(this.language.translate('suppliers.ai.prompts.explainScore'));
  }

  protected raiseDeviation(): void {
    const e = this.evaluation();
    if (e) {
      void this.flows.start('supplier_evaluation.to_deviation', 'supplier_evaluation', e.id);
    }
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
    const body = this.pendingChanges();
    if (!body) {
      return;
    }
    const toast = this.dirty()
      ? 'suppliers.evaluation.answersSaved'
      : 'suppliers.evaluation.summarySaved';
    this.saving.set(true);
    this.actionError.set(null);
    this.api.updateEvaluation(orgId, e.id, body, this.lang()).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.apply(updated);
        this.notifications.success(toast);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.actionError.set(supplierErrorKey(err));
      },
    });
  }

  /**
   * Submit for decision. Unsaved answers and an unsaved summary are saved first, so
   * nothing typed or adopted is lost; an empty summary asks for confirmation unless
   * `confirmedNoSummary` (the warning dialog's "Submit anyway").
   */
  protected submit(confirmedNoSummary = false): void {
    const orgId = this.selectedOrg.currentOrgId();
    const e = this.evaluation();
    if (!orgId || !e || this.busy()) {
      return;
    }
    const missing = this.preview().unanswered;
    if (missing.length) {
      this.pending.set(null);
      this.unanswered.set(missing);
      return;
    }
    if (!confirmedNoSummary && !this.summaryDraft().trim()) {
      this.pending.set('submitNoSummary');
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    const body = this.pendingChanges();
    const save$: Observable<unknown> = body
      ? this.api.updateEvaluation(orgId, e.id, body, this.lang())
      : of(null);
    save$.pipe(switchMap(() => this.api.submitEvaluation(orgId, e.id, this.lang()))).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.pending.set(null);
        this.apply(updated);
        this.notifications.success('suppliers.evaluation.submittedToast');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.pending.set(null);
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
    this.api.decideEvaluation(orgId, e.id, body, this.lang()).subscribe({
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
        ? this.api.reopenEvaluation(orgId, e.id, blankToNull(reason), this.lang())
        : this.api.cancelEvaluation(orgId, e.id, blankToNull(reason), this.lang());
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
    this.api.updateEvaluation(orgId, e.id, { questions, pass_score: pass }, this.lang()).subscribe({
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
      .updateEvaluation(
        orgId,
        e.id,
        {
          title: this.titleDraft().trim(),
          evaluator_user_id: this.evaluatorDraft() || null,
          due_at: due ? `${due}T23:59:59` : null,
        },
        this.lang(),
      )
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
      .updateEvaluation(orgId, e.id, { summary: blankToNull(this.summaryDraft()) }, this.lang())
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

  /** The unsaved answers and/or summary as one update body, or null when nothing changed. */
  private pendingChanges(): UpdateEvaluationRequest | null {
    const answers = this.dirty() ? { answers: answersBody(this.answers()) } : {};
    const summary = this.summaryDirty() ? { summary: blankToNull(this.summaryDraft()) } : {};
    const body: UpdateEvaluationRequest = { ...answers, ...summary };
    return Object.keys(body).length ? body : null;
  }

  /**
   * Take a fresh server copy. Answers reset to the server's; an unsaved summary on the
   * same evaluation is kept (another save must not wipe text the user has not saved).
   */
  private apply(e: EvaluationDetail): void {
    const prev = this.evaluation();
    // Kept only while it still differs from what the server now holds (the server trims,
    // so a saved draft with trailing whitespace must not stay "unsaved").
    const keepSummary =
      !!prev &&
      prev.id === e.id &&
      this.summaryDirty() &&
      blankToNull(this.summaryDraft()) !== (e.summary ?? null);
    this.evaluation.set(e);
    this.answers.set(answersDraft(e));
    if (!keepSummary) {
      this.summaryDraft.set(e.summary ?? '');
    }
    this.dirty.set(false);
    this.unanswered.set([]);
  }

  private load(orgId: string | null, eid: string, lang: 'en' | 'nb'): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getEvaluation(orgId, eid, lang).subscribe({
      next: (e) => {
        this.apply(e);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
