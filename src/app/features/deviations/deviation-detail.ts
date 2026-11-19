import { HttpErrorResponse } from '@angular/common/http';
import { formatNumber } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { hasAnyPermission } from '../../core/auth/permission';
import {
  invalidDataErrors,
  isDeviationClosedError,
  notifyDeviationError,
  notifyDeviationSaveError,
  recordDataErrors,
} from '../../core/deviations/deviation-errors';
import {
  AccessGrant,
  Action,
  DeviationAccess,
  DeviationDetail as DeviationDetailModel,
  DeviationEvent,
  DeviationStatus,
  DeviationType,
  DeviationVisibility,
  FieldDef,
  ReportingKey,
  RootCauseMethod,
  Severity,
  Source,
  SuggestedClause,
} from '../../core/deviations/deviation.models';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import { httpErrorMessageKey } from '../../core/http/error.interceptor';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RecordTypeVersion } from '../../core/records/record.models';
import { RecordsApi } from '../../core/records/records-api';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskPanelService } from '../ask/ask-panel.service';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip, EntityChipRef } from '../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../shared/kit/record-sections';
import { formatLocalDate, formatLocalDay } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { DynamicForm } from '../../shared/records/dynamic-form';
import { parseClause } from '../../shared/requirement-links/clause-picker';
import { fixedShortName, shortNameKey } from '../../shared/requirement-links/requirement-label';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { DeviationAccessEditor } from './access/deviation-access-editor';
import { DeviationActions } from './actions/deviation-actions';
import { DeviationClassificationFields } from './classification-fields';
import { DeviationCaseHistory, HistoryRow } from './detail/case-history';
import { STATE_TONE, deviationMissing, deviationState } from './detail/deviation-follow-up';
import { DeviationReporting, ReportingSave } from './detail/reporting-panel';
import {
  DEVIATIONS_ROOT_CRUMB,
  PersonOption,
  clauseRefsOf,
  clausesFromRefs,
  eventTimesErrorKey,
  isOpenObligation,
  personOptions,
} from './deviation-display';
import { buildDeviationPatch, editFormFrom } from './deviation-edit';
import {
  ROOT_CAUSE_METHOD_OPTIONS,
  actionStatusLabelKey,
  actionStatusToneValue,
  SEVERITY_OPTIONS,
  SOURCE_OPTIONS,
  fieldErrorKeys,
  isOverdue,
  rootCauseMethodLabelKey,
  severityLabelKey,
  sourceLabelKey,
  standardLabelKey,
  statusLabelKey,
  visibilityLabelKey,
} from './deviation-enums';
import { describeEvent } from './deviation-events';
import { DeviationStatusLabels } from './deviation-status';
import {
  STATUS_REASON_MAX,
  StatusMenuEntry,
  WorkflowError,
  editLockKey,
  isStillBlocked,
  isWorkflowManaged,
  parseWorkflowError,
  statusLockedKey,
  statusMenuEntries,
  workflowReasonKey,
} from './deviation-workflow';
import { DynamicField, DynamicFieldOption } from './dynamic-field';
import { SimilarCases } from './insights/similar-cases';
import { SuggestedActions } from './insights/suggested-actions';
import { RootCausePanel } from './root-cause/root-cause-panel';
import { groupFieldsIntoSections } from './types/type-schema';
import { DeviationEventFacts } from './ui/event-facts-fields';
import { DeviationFormRow } from './ui/form-row';
import { DeviationWorkflowPanel } from './workflow/deviation-workflow-panel';
import { DeviationEffectCheck } from './detail/effect-check';

/** The detail tabs (details, related records, history, comments, files, versions, tasks). */
const DETAIL_TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
  'tasks',
];

/** Revision snapshot field -> label key, for the versions tab. */
export const DEVIATION_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'deviations.create.fields.title',
  description: 'deviations.create.fields.description',
  severity: 'deviations.create.fields.severity',
  source: 'deviations.create.fields.source',
  status: 'deviations.filters.status',
  owner_user_id: 'deviations.detail.owner',
  department_id: 'deviations.create.fields.department',
  due_at: 'deviations.create.fields.due',
  root_cause: 'deviations.create.fields.rootCause',
  root_cause_method: 'deviations.create.fields.rootCauseMethod',
  standards: 'deviations.create.fields.standards',
  clauses: 'deviations.form.requirements',
  tags: 'deviations.create.fields.tags',
  visibility: 'deviations.wf.visibility',
  closed_at: 'deviations.detail.meta.closed',
  occurred_at: 'deviations.facts.occurredAt',
  detected_at: 'deviations.facts.detectedAt',
  location: 'deviations.facts.location',
  immediate_action: 'deviations.facts.immediateAction',
  data: 'deviations.wf.fieldsTitle',
};

/** A rejected status change: the workflow error plus the status that was attempted. */
type StatusRejection = WorkflowError & {
  readonly status: DeviationStatus;
  readonly reasonKey: string;
};

/** A cited or typical clause, ready to render as a chip. */
interface ClauseChip {
  readonly ref: string;
  readonly shortKey: string | null;
  readonly short: string;
  readonly number: string;
  readonly title: string;
}

/**
 * Deviation detail on the detail-page anatomy (docs/ux-guide.md §2.7): the title
 * as h1 with code · type · status · severity in the meta line, "Endre status" as
 * the one primary action, Rediger as secondary, Følg / "Lag ny fra denne" / Print /
 * Delete in "Mer", and every assistant action (summary, root cause, actions,
 * compare) in "Spør KI". "Hovedinformasjon" comes first: a status sentence, what
 * happened, what was done straight away, the root cause and the actions. The
 * Details tab has the other facts (empty ones hidden), the authority
 * notifications, the type's fields, then the case in order: why it happened, what
 * we do, did it work, similar cases. The "Oppfølging" card lists what the case
 * still needs before it can be closed (the closing checklist as actionable lines),
 * the requirements (with the type's typical clauses one click away), the
 * connections and owner / visibility / dates; managers change owner and access in
 * a collapsed panel below it. The Activity tab is the case history.
 */
@Component({
  selector: 'app-deviation-detail',
  imports: [
    TourStepDirective,
    AiAssistButton,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    MarkdownPipe,
    DynamicForm,
    EntityTasks,
    EntityChip,
    SimilarCases,
    SuggestedActions,
    RootCausePanel,
    DeviationWorkflowPanel,
    DeviationEffectCheck,
    WhyItMatters,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    Card,
    Badge,
    Button,
    Icon,
    EmptyState,
    FieldList,
    FieldItem,
    HelpStrip,
    LoadingState,
    MenuItem,
    StatusBadge,
    DynamicField,
    DeviationActions,
    DeviationAccessEditor,
    DeviationClassificationFields,
    DeviationCaseHistory,
    DeviationEventFacts,
    DeviationFormRow,
    DeviationReporting,
    Alert,
    ConfirmDialog,
    SupportsRequirements,
  ],
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="mx-auto max-w-[1180px] px-4 pt-7 pb-12 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
    } @else if (deviation(); as dev) {
      <app-record-detail-layout
        [anatomy]="true"
        entityType="deviation"
        [entityId]="dev.id"
        [title]="dev.title"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="isAdmin() ? '/settings/modules/deviations' : null"
        [tabs]="tabs"
        [canEdit]="canEditThis()"
        [canComment]="canWrite()"
        [fieldLabels]="fieldLabels"
        [customActivity]="true"
        [counts]="{ activity: events().length }"
        [missing]="missing()"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="deviation-code">{{ dev.code }}</span>
          @if (dev.type_name) {
            <span aria-hidden="true">·</span>
            <span>{{ dev.type_name }}</span>
          }
          <span aria-hidden="true">·</span>
          <app-badge [tone]="statusLabels.tone(dev)" data-testid="status-badge">{{
            statusLabels.label(dev)
          }}</app-badge>
          <app-status-badge
            meaning="severity"
            [value]="dev.severity"
            [labelKey]="severityLabelKey(dev.severity)"
          />
          @if (overdue(dev)) {
            <app-status-badge meaning="lifecycle" value="overdue" />
          }
        </ng-container>

        <!-- §2.7: every assistant action of the case in the header's "Spør KI" menu. -->
        <button
          appMenuItem
          ask
          type="button"
          data-testid="ai-summarise"
          (click)="runAssist('summary')"
        >
          <app-icon name="spark" [size]="15" />
          {{ 'deviations.page.ai.summarise' | transloco }}
        </button>
        @if (canEditThis() && !editing()) {
          <ng-container ngProjectAs="[ask]">
            <button
              appMenuItem
              ask
              type="button"
              data-testid="ai-root-cause"
              (click)="runAssist('rootCause')"
            >
              <app-icon name="spark" [size]="15" />
              {{ 'deviations.assist.suggestRootCause' | transloco }}
            </button>
            <button
              appMenuItem
              ask
              type="button"
              data-testid="ai-actions"
              (click)="runAssist('actions')"
            >
              <app-icon name="spark" [size]="15" />
              {{ 'deviations.assist.suggestActions' | transloco }}
            </button>
          </ng-container>
        }
        @if (similarCases()?.hasItems() && !editing()) {
          <button
            appMenuItem
            ask
            type="button"
            data-testid="ai-compare"
            (click)="runAssist('similar')"
          >
            <app-icon name="spark" [size]="15" />
            {{ 'deviations.page.ai.compare' | transloco }}
          </button>
        }
        <button appMenuItem ask type="button" data-testid="ai-ask" (click)="askAboutCase(dev)">
          <app-icon name="spark" [size]="15" />
          {{ 'deviations.page.ai.ask' | transloco }}
        </button>

        <ng-container ngProjectAs="[primary]">
          @if (!editing()) {
            <div
              *appHasPermission="'deviations:write'"
              #statusTrigger
              class="relative"
              [class.hidden]="isWorkflow()"
              [attr.title]="statusLockedKey() ? (statusLockedKey()! | transloco) : null"
              data-testid="status-trigger"
            >
              <app-button
                [disabled]="statusLockedKey() !== null"
                (click)="toggleStatusMenu($event)"
              >
                <app-icon name="flag" [size]="15" />
                {{ 'deviations.detail.changeStatus' | transloco }}
                <app-icon name="chevron" [size]="14" />
              </app-button>
              @if (statusMenuOpen()) {
                <div
                  class="animate-cf-pop absolute right-0 z-30 mt-1.5 w-72 rounded-card border border-border bg-surface p-1 shadow-pop"
                  data-testid="status-menu"
                >
                  <div
                    class="flex w-full items-center gap-2 px-2.5 py-2 text-ui font-semibold text-fg"
                  >
                    <app-icon name="check" [size]="15" class="text-accent" />
                    {{ statusLabelKey(dev.status) | transloco }}
                  </div>
                  @for (entry of statusEntries(); track entry.status) {
                    <button
                      type="button"
                      [disabled]="savingStatus() || entry.blockedBy !== null"
                      [attr.data-status]="entry.status"
                      (click)="pickStatus(entry)"
                      class="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-ui text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span class="mt-0.5 w-[15px] flex-none"></span>
                      <span class="min-w-0 flex-1">
                        <span class="block" [class.opacity-50]="entry.blockedBy !== null">{{
                          statusLabelKey(entry.status) | transloco
                        }}</span>
                        @if (entry.blockedBy) {
                          <span class="mt-0.5 block text-meta text-fg-muted">{{
                            reasonKeyFor(entry.blockedBy, entry.status) | transloco
                          }}</span>
                        } @else if (entry.requiresReason) {
                          <span class="mt-0.5 block text-meta text-fg-muted">{{
                            'deviations.workflow.reasonHint' | transloco
                          }}</span>
                        }
                      </span>
                    </button>
                  }
                </div>
              }
            </div>
          } @else {
            <app-button [loading]="savingEdit()" (click)="saveEdit()" data-testid="save">
              <app-icon name="check" [size]="15" />
              {{ 'deviations.detail.save' | transloco }}
            </app-button>
          }
        </ng-container>
        <ng-container ngProjectAs="[secondary]">
          @if (!editing()) {
            @if (canEditThis()) {
              <app-button variant="secondary" (click)="startEdit(dev)" data-testid="edit">
                <app-icon name="procedures" [size]="15" />
                {{ 'deviations.detail.edit' | transloco }}
              </app-button>
            }
          } @else {
            <app-button variant="ghost" (click)="cancelEdit()">
              {{ 'deviations.detail.cancel' | transloco }}
            </app-button>
          }
        </ng-container>
        <ng-container ngProjectAs="[overflow]">
          @if (!editing()) {
            <a appMenuItem [routerLink]="['/deviations', dev.id, 'print']" data-testid="print">
              <app-icon name="documents" [size]="15" />
              {{ 'deviations.print.menu' | transloco }}
            </a>
            @if (canManage()) {
              <button
                appMenuItem
                type="button"
                [danger]="true"
                (click)="confirmDelete.set(true)"
                data-testid="delete"
              >
                <app-icon name="trash" [size]="15" />
                {{ 'deviations.detail.delete' | transloco }}
              </button>
            }
          }
        </ng-container>

        <app-help-strip
          help
          scope="deviations"
          page="detail"
          tour="detail"
          lesson="root-cause-analysis"
        />

        <!-- §2.7 "Hovedinformasjon": what happened, what was done, why, and the actions. -->
        @if (!editing()) {
          <app-record-lead record-lead [fillLink]="canEditThis() ? editLink() : null">
            <app-record-status-line status [tone]="statusTone()">{{
              statusSentence()
            }}</app-record-status-line>
            <app-field-item
              size="lead"
              [wide]="true"
              labelKey="deviations.page.lead.whatHappened"
              [value]="dev.description"
              [multiline]="true"
            />
            <app-field-item
              size="lead"
              labelKey="deviations.page.lead.immediateAction"
              [value]="dev.immediate_action"
              [multiline]="true"
            />
            <app-field-item
              size="lead"
              [labelKey]="
                dev.root_cause_method === 'not_needed'
                  ? 'deviations.page.lead.rootCauseNotNeeded'
                  : 'deviations.page.lead.rootCause'
              "
              [value]="dev.root_cause"
              [multiline]="true"
            />
            <app-field-item
              size="lead"
              [wide]="true"
              labelKey="deviations.page.lead.actions"
              [keepEmpty]="true"
              emptyKey="deviations.page.lead.actionsNone"
            >
              @if (actionSummary(); as s) {
                <span class="flex flex-col gap-1.5" data-testid="lead-actions">
                  @for (a of s.top; track a.id) {
                    <span class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="actionStatusToneValue(a.status)"
                        [labelKey]="actionStatusLabelKey(a.status)"
                      />
                      <span class="min-w-0">{{ a.description }}</span>
                      @if (a.owner_name || a.due_at) {
                        <span class="text-meta font-normal text-fg-muted">
                          {{ a.owner_name }}
                          @if (a.owner_name && a.due_at) {
                            ·
                          }
                          @if (a.due_at) {
                            {{ 'deviations.actions.dueLabel' | transloco: { date: day(a.due_at) } }}
                          }
                        </span>
                      }
                    </span>
                  }
                  <button
                    type="button"
                    class="w-fit text-meta font-semibold text-accent hover:underline"
                    (click)="scrollTo('dev-actions')"
                  >
                    {{
                      'deviations.page.lead.seeActions'
                        | transloco: { total: s.total, done: s.done }
                    }}
                    <span aria-hidden="true">↓</span>
                  </button>
                </span>
              }
            </app-field-item>
          </app-record-lead>
        }

        <!-- Details -->
        <div class="flex flex-col gap-5">
          <app-ai-assist-button
            #summaryAssist
            class="empty:hidden"
            [quiet]="true"
            assist="deviations.summarise"
            labelKey="deviations.page.ai.summarise"
            entityType="deviation"
            [entityId]="dev.id"
            (text)="summary.set($event)"
          />
          @if (summary()) {
            <app-card>
              <div class="flex items-start justify-between gap-3" aria-live="polite">
                <div class="min-w-0">
                  <h2 class="mb-1 text-meta font-bold tracking-wide text-fg-subtle uppercase">
                    {{ 'deviations.assist.summaryTitle' | transloco }}
                  </h2>
                  <div class="text-ui text-fg" [innerHTML]="summary() | appMarkdown"></div>
                  <p class="mt-1.5 text-meta text-fg-muted">
                    {{ 'deviations.assist.reviewNote' | transloco }}
                  </p>
                </div>
                <button
                  type="button"
                  (click)="summary.set('')"
                  [attr.aria-label]="'deviations.assist.dismiss' | transloco"
                  class="flex flex-none rounded-lg p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                >
                  <app-icon name="x" [size]="15" />
                </button>
              </div>
            </app-card>
          }

          @if (canWrite() && editLockKey(); as lockKey) {
            <div data-testid="edit-lock-note">
              <app-alert tone="info">{{ lockKey | transloco }}</app-alert>
            </div>
          }

          @if (workflowError(); as wfError) {
            <div class="flex flex-col gap-2" data-testid="workflow-error">
              <app-alert tone="error">
                {{
                  'deviations.workflow.rejected'
                    | transloco
                      : {
                          status: (statusLabelKey(wfError.status) | transloco),
                          reason: (wfError.reasonKey | transloco),
                        }
                }}
              </app-alert>
              @if (wfError.blocking.length) {
                <div class="rounded-tile border border-fail/30 bg-surface px-3 py-2">
                  <p class="text-meta font-semibold text-fg-muted">
                    {{ 'deviations.workflow.blockingActions' | transloco }}
                  </p>
                  <ul class="mt-1 list-disc pl-5 text-ui text-fg">
                    @for (b of wfError.blocking; track b.action_id) {
                      <li>{{ b.description }}</li>
                    }
                  </ul>
                </div>
              }
              <button
                type="button"
                (click)="workflowError.set(null)"
                class="w-fit text-meta font-semibold text-fg-muted hover:text-fg hover:underline"
              >
                {{ 'deviations.workflow.dismiss' | transloco }}
              </button>
            </div>
          }

          @if (openObligations().length && !editing()) {
            <app-deviation-reporting
              id="dev-reporting"
              class="block scroll-mt-6"
              [obligations]="dev.reporting_obligations ?? []"
              [deviationId]="dev.id"
              [version]="dev"
              [canEdit]="canEditThis()"
              [busy]="savingReporting()"
              (save)="saveReporting($event)"
            />
          }

          @if (!editing()) {
            <app-card appTourStep="deviations-meta">
              <app-record-details
                [columns]="3"
                [fillLink]="canEditThis() ? editLink() : null"
                titleKey="deviations.page.details.title"
              >
                <app-field-item
                  labelKey="deviations.facts.occurredAt"
                  [value]="dateTime(dev.occurred_at)"
                />
                <app-field-item
                  labelKey="deviations.facts.detectedAt"
                  [value]="dateTime(dev.detected_at)"
                />
                <app-field-item labelKey="deviations.facts.location" [value]="dev.location" />
                <app-field-item labelKey="deviations.page.details.source">
                  <span class="flex flex-col gap-1">
                    <span>{{ sourceLabelKey(dev.source) | transloco }}</span>
                    @if (originRef(); as ref) {
                      <span class="text-meta text-fg-muted">{{
                        'deviations.page.details.createdFrom' | transloco
                      }}</span>
                      <app-entity-chip [ref]="ref" [stacked]="true" data-testid="origin" />
                    }
                  </span>
                </app-field-item>
                <app-field-item
                  labelKey="deviations.create.fields.department"
                  [value]="dev.department_id ? departmentName(dev.department_id) : null"
                />
                <app-field-item labelKey="deviations.create.fields.tags" [wide]="true">
                  @if (dev.tags.length) {
                    <span class="flex flex-wrap gap-1.5">
                      @for (t of dev.tags; track t) {
                        <span
                          class="inline-flex items-center rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-meta font-medium text-fg"
                          >{{ t }}</span
                        >
                      }
                    </span>
                  }
                </app-field-item>
              </app-record-details>
            </app-card>
          } @else {
            <!-- Edit form -->
            <app-card>
              <h2 class="mb-4 font-display text-section font-bold text-fg">
                {{ 'deviations.create.sections.what' | transloco }}
              </h2>
              <div class="flex flex-col gap-4">
                <app-deviation-form-row
                  labelKey="deviations.create.fields.title"
                  inputId="edit-title"
                  page="detail"
                  [required]="true"
                  [errorKey]="titleError() ? 'deviations.create.titleRequired' : null"
                >
                  <input
                    id="edit-title"
                    type="text"
                    maxlength="255"
                    autocomplete="off"
                    [ngModel]="title()"
                    (ngModelChange)="title.set($event); titleError.set(false)"
                  />
                </app-deviation-form-row>
                <app-deviation-form-row
                  labelKey="deviations.create.fields.description"
                  inputId="edit-desc"
                  page="detail"
                >
                  <textarea
                    id="edit-desc"
                    rows="3"
                    [ngModel]="description()"
                    (ngModelChange)="description.set($event)"
                  ></textarea>
                </app-deviation-form-row>
                <app-deviation-event-facts
                  idPrefix="edit"
                  page="detail"
                  [(occurred)]="occurredAt"
                  [(detected)]="detectedAt"
                  [(location)]="location"
                  [(immediateAction)]="immediateAction"
                />
              </div>
            </app-card>

            <app-card>
              <h2 class="mb-4 font-display text-section font-bold text-fg">
                {{ 'deviations.create.sections.classify' | transloco }}
              </h2>
              <div class="flex flex-col gap-4">
                <div class="grid gap-4 sm:grid-cols-2">
                  <app-deviation-form-row
                    labelKey="deviations.create.fields.severity"
                    inputId="edit-severity"
                    page="detail"
                  >
                    <select
                      id="edit-severity"
                      [ngModel]="severity()"
                      (ngModelChange)="severity.set($event)"
                    >
                      @for (option of severityOptions; track option) {
                        <option [value]="option">{{ severityLabelKey(option) | transloco }}</option>
                      }
                    </select>
                  </app-deviation-form-row>
                  <app-deviation-form-row
                    labelKey="deviations.create.fields.source"
                    inputId="edit-source"
                    page="detail"
                  >
                    <select
                      id="edit-source"
                      [ngModel]="source()"
                      (ngModelChange)="source.set($event)"
                    >
                      @for (option of sourceOptions; track option) {
                        <option [value]="option">{{ sourceLabelKey(option) | transloco }}</option>
                      }
                    </select>
                  </app-deviation-form-row>
                  <app-deviation-form-row
                    labelKey="deviations.create.fields.due"
                    inputId="edit-due"
                    page="detail"
                  >
                    <input
                      id="edit-due"
                      type="date"
                      [ngModel]="dueAt()"
                      (ngModelChange)="dueAt.set($event)"
                    />
                  </app-deviation-form-row>
                  @if (departments().length) {
                    <app-deviation-form-row
                      labelKey="deviations.create.fields.department"
                      inputId="edit-dept"
                      page="detail"
                    >
                      <select
                        id="edit-dept"
                        [ngModel]="departmentId()"
                        (ngModelChange)="departmentId.set($event)"
                      >
                        <option value="">{{ 'deviations.create.none' | transloco }}</option>
                        @for (dept of departments(); track dept.id) {
                          <option [value]="dept.id">{{ dept.name }}</option>
                        }
                      </select>
                    </app-deviation-form-row>
                  }
                </div>
                <app-deviation-classification-fields
                  idPrefix="edit"
                  page="detail"
                  [typical]="typicalRefs()"
                  [(refs)]="refs"
                  [(tags)]="tags"
                />
              </div>
            </app-card>

            <app-card>
              <h2 class="mb-1 font-display text-section font-bold text-fg">
                {{ 'deviations.detail.rootCauseOverride' | transloco }}
              </h2>
              <p class="mb-4 text-meta text-fg-muted">
                {{ 'deviations.detail.rootCauseOverrideHint' | transloco }}
              </p>
              <div class="grid gap-4 sm:grid-cols-2">
                <app-deviation-form-row
                  labelKey="deviations.create.fields.rootCauseMethod"
                  inputId="edit-rcm"
                  page="detail"
                >
                  <select
                    id="edit-rcm"
                    [ngModel]="rootCauseMethod()"
                    (ngModelChange)="rootCauseMethod.set($event)"
                  >
                    <option value="">{{ 'deviations.create.none' | transloco }}</option>
                    @for (option of rootCauseMethodOptions; track option) {
                      <option [value]="option">
                        {{ rootCauseMethodLabelKey(option) | transloco }}
                      </option>
                    }
                  </select>
                </app-deviation-form-row>
                <app-deviation-form-row
                  [labelKey]="
                    rootCauseMethod() === 'not_needed'
                      ? 'deviations.detail.notNeededReason'
                      : 'deviations.create.fields.rootCause'
                  "
                  inputId="edit-rc"
                  page="detail"
                  class="sm:col-span-2"
                >
                  <textarea
                    id="edit-rc"
                    rows="2"
                    [ngModel]="rootCause()"
                    (ngModelChange)="rootCause.set($event)"
                  ></textarea>
                </app-deviation-form-row>
              </div>
            </app-card>
          }

          @if (recordVersion(); as version) {
            <app-card>
              <h2 class="mb-3 font-display text-section font-bold text-fg">
                {{ 'deviations.wf.fieldsTitle' | transloco }}
              </h2>
              <app-dynamic-form
                [fields]="version.fields"
                [layout]="version.layout"
                [value]="editing() ? data() : dev.data"
                [readonly]="!editing()"
                [errors]="recordErrors()"
                [people]="owners()"
                [departments]="departments()"
                (valueChange)="setRecordData($event)"
              />
            </app-card>
          } @else if (schemaSections().length) {
            <app-card>
              <h2 class="mb-4 font-display text-section font-bold text-fg">
                {{
                  'deviations.create.sections.typeFields' | transloco: { type: dev.type_name ?? '' }
                }}
              </h2>
              @if (!editing()) {
                <div class="flex flex-col gap-5">
                  @for (section of schemaSections(); track section.title) {
                    <div class="flex flex-col gap-3">
                      @if (!section.isDefault) {
                        <h3 class="text-ui font-semibold text-fg-muted">{{ section.title }}</h3>
                      }
                      <app-field-list [columns]="2">
                        @for (def of section.fields; track def.key) {
                          <app-field-item
                            [labelText]="def.label"
                            [value]="displayValue(def)"
                            [wide]="def.width === 'full'"
                            [multiline]="def.type === 'textarea'"
                          />
                        }
                      </app-field-list>
                    </div>
                  }
                </div>
              } @else {
                <div class="flex flex-col gap-6">
                  @for (section of schemaSections(); track section.title) {
                    <div class="flex flex-col gap-4">
                      @if (!section.isDefault) {
                        <h3 class="text-ui font-semibold text-fg-muted">{{ section.title }}</h3>
                      }
                      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        @for (def of section.fields; track def.key) {
                          <div [class.sm:col-span-2]="def.width === 'full'">
                            <app-dynamic-field
                              [field]="def"
                              [value]="data()[def.key]"
                              [options]="optionsFor(def.type)"
                              [error]="dataErrors()[def.key] ?? null"
                              (valueChange)="setData(def.key, $event)"
                            />
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            </app-card>
          }

          @if (!editing()) {
            <app-card data-testid="card-why" id="dev-why" class="scroll-mt-6">
              <h2 class="font-display text-section font-bold text-fg">
                {{ 'deviations.plain.why.title' | transloco }}
              </h2>
              <p class="mt-0.5 mb-3 text-meta text-fg-muted">
                {{ 'deviations.plain.why.hint' | transloco }}
              </p>
              <app-root-cause-panel
                [deviationId]="dev.id"
                [canEdit]="canEditThis()"
                [quiet]="true"
                [problem]="dev.description ?? ''"
                (applied)="refreshDeviation()"
              />
            </app-card>

            <app-card
              appTourStep="deviations-capa"
              data-testid="card-what"
              id="dev-actions"
              class="scroll-mt-6"
            >
              <app-deviation-actions
                titleKey="deviations.plain.what.title"
                introKey="deviations.plain.what.hint"
                [deviationId]="dev.id"
                [actions]="actions()"
                [owners]="owners()"
                [canEdit]="canEditThis()"
                [highlighted]="blockingActionIds()"
                (actionsChange)="actions.set($event)"
                (changed)="reloadEvents()"
                (stale)="refreshDeviation()"
              />
              @if (canEditThis()) {
                <app-suggested-actions
                  class="mt-3 block empty:hidden"
                  [deviationId]="dev.id"
                  [quiet]="true"
                  (added)="onActionAdded($event)"
                />
              }
            </app-card>

            <app-card data-testid="card-effect" id="dev-effect" class="scroll-mt-6">
              <app-deviation-effect-check [actions]="actions()" />
            </app-card>

            @if (!openObligations().length && (dev.reporting_obligations ?? []).length) {
              <app-deviation-reporting
                id="dev-reporting"
                class="block scroll-mt-6"
                [obligations]="dev.reporting_obligations ?? []"
                [deviationId]="dev.id"
                [version]="dev"
                [canEdit]="canEditThis()"
                [busy]="savingReporting()"
                (save)="saveReporting($event)"
              />
            }

            <app-card id="dev-similar" class="scroll-mt-6">
              <app-similar-cases [deviationId]="dev.id" [quiet]="true" />
            </app-card>
          }
        </div>

        <!-- Oppfølging: requirements (with the type's typical clauses one click away). -->
        <ng-container ngProjectAs="[aside-requirements]">
          @if (canReadStandards()) {
            @for (key of [requirementsKey()]; track key) {
              <app-supports-requirements
                entityType="deviation"
                [entityId]="dev.id"
                [canEdit]="canEditThis()"
                [actions]="actions()"
                [frameworks]="requirementFrameworks()"
              />
            }
          } @else {
            <div data-testid="cited-requirements">
              <h2 class="mb-2 font-semibold text-fg">
                {{ 'deviations.form.requirements' | transloco }}
              </h2>
              @if (citedChips().length) {
                <ul class="flex flex-wrap gap-1.5">
                  @for (chip of citedChips(); track chip.ref) {
                    <li
                      class="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface px-2.5 py-0.5 text-meta font-semibold text-fg"
                      [title]="chip.title"
                    >
                      <app-icon name="checkcircle" [size]="12" class="text-pass-ink" />
                      {{ chip.shortKey ? (chip.shortKey | transloco) : chip.short }} ·
                      {{ chip.number }}
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-ui text-fg-muted">
                  {{ 'deviations.page.noRequirements' | transloco }}
                </p>
              }
            </div>
          }
          @if (typicalChips().length && canEditThis()) {
            <div class="mt-3 flex flex-wrap items-center gap-1.5" data-testid="suggested-clauses">
              <span class="w-full text-meta text-fg-muted">{{
                'deviations.page.typicalForType' | transloco
              }}</span>
              @for (chip of typicalChips(); track chip.ref) {
                <button
                  type="button"
                  class="inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-border-strong bg-surface px-2.5 text-meta font-semibold text-fg-muted hover:border-accent hover:text-accent disabled:opacity-60"
                  [title]="chip.title"
                  [disabled]="linkingClause() !== null"
                  (click)="linkClause(chip.ref)"
                >
                  <app-icon name="plus" [size]="12" />
                  {{ chip.shortKey ? (chip.shortKey | transloco) : chip.short }} ·
                  {{ chip.number }}
                </button>
              }
            </div>
          }
        </ng-container>

        <!-- Oppfølging: who owns the case, who can see it and the dates. -->
        <app-record-meta follow-up-meta>
          <app-field-item
            layout="inline"
            labelKey="deviations.detail.owner"
            [value]="dev.owner_name || access()?.owner_name"
            [keepEmpty]="true"
            emptyKey="deviations.page.meta.noOwner"
          />
          <app-field-item
            layout="inline"
            labelKey="deviations.page.meta.visibility"
            [value]="visibilityLabelKey(dev.visibility) | transloco"
          />
          <app-field-item
            layout="inline"
            labelKey="deviations.detail.meta.due"
            [keepEmpty]="true"
            emptyKey="deviations.page.meta.noDue"
            emptyActionKey="deviations.page.meta.setDue"
            [emptyLink]="canEditThis() ? editLink() : null"
          >
            @if (dev.due_at) {
              <span [class.text-warn-ink]="overdue(dev)" [class.font-semibold]="overdue(dev)">{{
                day(dev.due_at)
              }}</span>
            }
          </app-field-item>
          <app-field-item
            layout="inline"
            labelKey="deviations.detail.meta.raised"
            [value]="day(dev.raised_at)"
          />
          <app-field-item
            layout="inline"
            labelKey="deviations.detail.meta.closed"
            [value]="dev.closed_at ? day(dev.closed_at) : null"
          />
        </app-record-meta>

        <div aside class="flex flex-col gap-4">
          @if (dev.workflow) {
            <app-deviation-workflow-panel
              appTourStep="deviations-workflow"
              [deviation]="dev"
              [fields]="recordVersion()?.fields ?? []"
              [people]="owners()"
              [departments]="departments()"
              [canWrite]="canWrite()"
              (changed)="onWorkflowChanged($event)"
            />
          }

          @if (canManage() && access(); as acc) {
            <details
              id="dev-access"
              class="group scroll-mt-6 rounded-card border border-border bg-surface shadow-card"
              data-testid="access-panel"
            >
              <summary
                class="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-display text-card font-bold text-fg [&::-webkit-details-marker]:hidden"
              >
                {{ 'deviations.page.access.title' | transloco }}
                <app-icon
                  name="chevron"
                  [size]="14"
                  class="text-fg-muted transition-transform group-open:rotate-180"
                />
              </summary>
              <div class="border-t border-border px-4 pt-3 pb-4">
                <app-deviation-access-editor
                  [deviationId]="dev.id"
                  [canManage]="canManage()"
                  [locked]="editLockKey() !== null"
                  [owner]="acc.owner_user_id ?? ''"
                  [ownerName]="acc.owner_name ?? ''"
                  [visibility]="acc.visibility"
                  [grants]="grants()"
                  (ownerChange)="onOwnerChange($event)"
                  (visibilityChange)="onVisibilityChange($event)"
                  (grantsChange)="grants.set($event)"
                  (stale)="refreshDeviation()"
                />
              </div>
            </details>
          }
        </div>

        <div aside-learn>
          <app-why-it-matters scope="deviations" page="detail" [frameworks]="whyFrameworks()" />
        </div>
        <div activity>
          <app-deviation-case-history [rows]="history()" />
        </div>

        <div tasks>
          <app-entity-tasks
            entityType="deviation"
            [entityId]="dev.id"
            [canCreate]="canEditThis()"
            [entityLabel]="dev.code"
          />
        </div>
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="confirmDelete()"
        [busy]="deleting()"
        [title]="'deviations.detail.deleteTitle' | transloco"
        [message]="'deviations.detail.deleteConfirm' | transloco: { code: dev.code }"
        [confirmLabel]="'deviations.detail.delete' | transloco"
        [cancelLabel]="'deviations.detail.cancel' | transloco"
        (confirmed)="remove()"
        (cancelled)="confirmDelete.set(false)"
      />

      <app-confirm-dialog
        [open]="reasonFor() !== null"
        [busy]="savingStatus()"
        confirmVariant="primary"
        [confirmDisabled]="!statusReason().trim()"
        initialFocus="#status-reason"
        [returnFocus]="statusTriggerButton()"
        [title]="
          'deviations.workflow.reasonTitle'
            | transloco: { status: (statusLabelKey(reasonFor() ?? dev.status) | transloco) }
        "
        [message]="'deviations.workflow.reasonPrompt' | transloco"
        [confirmLabel]="'deviations.workflow.reasonConfirm' | transloco"
        [cancelLabel]="'deviations.detail.cancel' | transloco"
        (confirmed)="submitReason()"
        (cancelled)="closeReason()"
      >
        <div class="mt-3 flex flex-col gap-1.5">
          <label for="status-reason" class="text-ui font-semibold text-fg-muted">
            {{ 'deviations.workflow.reasonLabel' | transloco }}
            <span class="text-fail-ink" aria-hidden="true">*</span>
          </label>
          <textarea
            id="status-reason"
            rows="3"
            [value]="statusReason()"
            [maxLength]="reasonMax"
            aria-describedby="status-reason-count"
            (input)="statusReason.set($any($event.target).value)"
            class="w-full rounded-tile border border-border bg-bg px-3 py-2.5 text-ui text-fg outline-none focus:border-accent"
          ></textarea>
          <p id="status-reason-count" class="text-right text-meta text-fg-muted">
            {{
              'deviations.workflow.reasonCount'
                | transloco: { count: statusReason().length, max: reasonMax }
            }}
          </p>
        </div>
      </app-confirm-dialog>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-7 pb-12 sm:px-8">
        <app-empty-state
          icon="search"
          titleKey="deviations.detail.notFound"
          bodyKey="deviations.detail.notFoundBody"
          ctaKey="deviations.backToList"
          ctaLink="/deviations"
          ctaVariant="secondary"
        />
      </div>
    }
  `,
  host: { '(document:click)': 'closeStatusMenu()' },
})
export class DeviationDetail {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly recordsApi = inject(RecordsApi);
  protected readonly statusLabels = inject(DeviationStatusLabels);

  /** Route param `id`, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();
  /** Route data `edit` (`/deviations/:id/edit`): open in edit mode once loaded. */
  readonly edit = input(false);

  protected readonly tabs = DETAIL_TABS;
  protected readonly fieldLabels = DEVIATION_FIELD_LABELS;

  protected readonly summary = signal('');
  protected readonly recordVersion = signal<RecordTypeVersion | null>(null);
  protected readonly actionStatusLabelKey = actionStatusLabelKey;
  protected readonly actionStatusToneValue = actionStatusToneValue;
  private readonly ask = inject(AskPanelService);
  private readonly summaryAssist = viewChild<AiAssistButton>('summaryAssist');
  private readonly rootCausePanel = viewChild(RootCausePanel);
  private readonly suggestedActions = viewChild(SuggestedActions);
  protected readonly similarCases = viewChild(SimilarCases);
  protected readonly recordErrors = signal<Readonly<Record<string, string>>>({});
  protected readonly isWorkflow = computed(() => {
    const dev = this.deviation();
    return !!dev && isWorkflowManaged(dev);
  });

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly severityOptions = SEVERITY_OPTIONS;
  protected readonly sourceOptions = SOURCE_OPTIONS;
  protected readonly rootCauseMethodOptions = ROOT_CAUSE_METHOD_OPTIONS;
  protected readonly rootCauseMethodLabelKey = rootCauseMethodLabelKey;
  protected readonly statusLabelKey = statusLabelKey;
  protected readonly severityLabelKey = severityLabelKey;
  protected readonly sourceLabelKey = sourceLabelKey;
  protected readonly standardLabelKey = standardLabelKey;
  protected readonly visibilityLabelKey = visibilityLabelKey;

  protected readonly deviation = signal<DeviationDetailModel | null>(null);
  protected readonly type = signal<DeviationType | null>(null);
  protected readonly actions = signal<readonly Action[]>([]);
  protected readonly events = signal<readonly DeviationEvent[]>([]);
  protected readonly loading = signal(true);

  protected readonly access = signal<DeviationAccess | null>(null);
  protected readonly grants = signal<readonly AccessGrant[]>([]);

  protected readonly owners = signal<readonly PersonOption[]>([]);
  protected readonly departments = signal<readonly DynamicFieldOption[]>([]);

  protected readonly statusMenuOpen = signal(false);
  protected readonly savingStatus = signal(false);
  protected readonly deleting = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly savingReporting = signal<ReportingKey | null>(null);
  protected readonly linkingClause = signal<string | null>(null);
  /** Bumped after a clause link, so the requirements panel reloads its links. */
  protected readonly requirementsKey = signal(0);

  protected readonly reasonFor = signal<DeviationStatus | null>(null);
  protected readonly statusReason = signal('');
  protected readonly workflowError = signal<StatusRejection | null>(null);
  protected readonly blockingActionIds = computed(() =>
    (this.workflowError()?.blocking ?? []).map((b) => b.action_id),
  );
  protected readonly statusEntries = computed<readonly StatusMenuEntry[]>(() => {
    const dev = this.deviation();
    return dev ? statusMenuEntries(dev) : [];
  });

  // Edit mode state
  protected readonly editing = signal(false);
  protected readonly savingEdit = signal(false);
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly severity = signal<Severity>('medium');
  protected readonly source = signal<Source>('internal');
  protected readonly dueAt = signal('');
  protected readonly occurredAt = signal('');
  protected readonly detectedAt = signal('');
  protected readonly location = signal('');
  protected readonly immediateAction = signal('');
  protected readonly rootCause = signal('');
  protected readonly rootCauseMethod = signal<RootCauseMethod | ''>('');
  protected readonly refs = signal<readonly string[]>([]);
  protected readonly tags = signal<readonly string[]>([]);
  protected readonly departmentId = signal('');
  protected readonly data = signal<Record<string, unknown>>({});
  protected readonly dataErrors = signal<Record<string, string>>({});
  protected readonly titleError = signal(false);

  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/deviations',
    this.id(),
    'edit',
  ]);

  /** Status sentence of "Hovedinformasjon": the status word, then what it means. */
  protected readonly statusSentence = computed(() => {
    const dev = this.deviation();
    if (!dev) {
      return '';
    }
    return this.language.translate(`deviations.page.status.${deviationState(dev)}`, {
      status: this.statusLabels.label(dev),
    });
  });

  protected readonly statusTone = computed<StatusLineTone>(() => {
    const dev = this.deviation();
    return dev ? STATE_TONE[deviationState(dev)] : 'neutral';
  });

  /** The actions in "Hovedinformasjon": the open ones first (at most three) and the counts. */
  protected readonly actionSummary = computed(() => {
    const list = this.actions().filter((a) => a.status !== 'cancelled');
    if (!list.length) {
      return null;
    }
    const isDone = (a: Action) => a.status === 'done' || a.status === 'verified';
    const ordered = [...list.filter((a) => !isDone(a)), ...list.filter(isDone)];
    return { top: ordered.slice(0, 3), total: list.length, done: list.filter(isDone).length };
  });

  /** "Oppfølging": what the open case still needs, each line leading to where it is done. */
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const dev = this.deviation();
    if (!dev || !this.canEditThis() || this.editing()) {
      return [];
    }
    return deviationMissing(dev, {
      editLink: this.editLink(),
      overdue: this.overdue(dev),
      canManage: this.canManage() && this.access() !== null,
      scrollTo: (id) => this.scrollTo(id),
    });
  });

  protected readonly breadcrumbs = computed(() => [
    DEVIATIONS_ROOT_CRUMB,
    { label: this.deviation()?.code ?? '' },
  ]);

  protected readonly schema = computed<readonly FieldDef[]>(() =>
    this.deviation()?.record_type_version_id ? [] : (this.type()?.schema ?? []),
  );
  protected readonly schemaSections = computed(() =>
    groupFieldsIntoSections(
      this.schema(),
      this.language.translate('deviations.create.detailsSection'),
    ),
  );

  /** The case history, newest first, localised (re-evaluates on language switch). */
  protected readonly history = computed<readonly HistoryRow[]>(() => {
    this.language.active();
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const owners = this.owners();
    const departments = this.departments();
    const subjectName = (type: string, id: string) =>
      (type === 'department' ? departments : owners).find((s) => s.id === id)?.name;
    return [...this.events()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((event) => ({ event, text: describeEvent(event, t, subjectName) }));
  });

  /** Open authority notifications (shown first on the page when any). */
  protected readonly openObligations = computed(() =>
    (this.deviation()?.reporting_obligations ?? []).filter(isOpenObligation),
  );

  /** Standards of the confirmed requirement links (falls back to the cited clauses). */
  protected readonly requirementStandards = computed(() => {
    const dev = this.deviation();
    if (!dev) {
      return [];
    }
    if (dev.requirement_standards?.length) {
      return dev.requirement_standards;
    }
    return [...new Set(dev.clauses.map((c) => c.standard).filter((s) => s !== 'hs'))];
  });

  /** Narrows the requirement picker / suggestions to the case's standards. */
  protected readonly requirementFrameworks = computed(() => {
    const dev = this.deviation();
    const own = [...this.requirementStandards(), ...(this.type()?.standards ?? [])];
    return dev && own.length ? [...new Set(own)] : null;
  });

  /** Why-it-matters teaches only the clauses of this case's standards (finding 17). */
  protected readonly whyFrameworks = computed(() => this.requirementFrameworks() ?? []);

  protected readonly citedChips = computed<ClauseChip[]>(() => {
    const dev = this.deviation();
    if (!dev) {
      return [];
    }
    const titles = new Map((dev.suggested_clauses ?? []).map((s) => [s.ref, this.titleOf(s)]));
    return clauseRefsOf(dev.clauses).map((ref) => this.chip(ref, titles.get(ref) ?? ''));
  });

  protected readonly typicalChips = computed<ClauseChip[]>(() =>
    (this.deviation()?.suggested_clauses ?? [])
      .filter((s) => !s.linked)
      .map((s) => this.chip(s.ref, this.titleOf(s))),
  );

  protected readonly typicalRefs = computed(() =>
    (this.deviation()?.suggested_clauses ?? []).map((s) => s.ref),
  );

  /** "Opprettet fra" (finding 8): the finding, feedback, breach or report it came from. */
  protected readonly originRef = computed<EntityChipRef | null>(() => {
    const origin = this.deviation()?.origin;
    if (!origin) {
      return null;
    }
    return {
      entity_type: origin.entity_type,
      entity_id: origin.id,
      title: origin.title ?? origin.code ?? '',
      code: origin.code ?? null,
      url: origin.url ?? null,
      module: origin.module ?? null,
    };
  });

  protected readonly canWrite = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'deviations:write'),
  );
  protected readonly canManage = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'deviations:manage'),
  );
  protected readonly isAdmin = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'deviations:admin'),
  );
  protected readonly canReadStandards = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'standards:read'),
  );

  protected readonly editLockKey = computed(() => {
    const dev = this.deviation();
    return dev ? editLockKey(dev) : null;
  });
  protected readonly canEditThis = computed(() => this.canWrite() && this.editLockKey() === null);
  protected readonly statusLockedKey = computed(() => {
    const dev = this.deviation();
    return dev ? statusLockedKey(dev) : null;
  });

  protected readonly reasonMax = STATUS_REASON_MAX;
  private readonly statusTrigger = viewChild<ElementRef<HTMLElement>>('statusTrigger');

  private currentOrgId: string | null = null;

  constructor() {
    providePageContext(() => {
      const dev = this.deviation();
      return {
        module: 'deviations',
        entityType: 'deviation',
        entityId: this.id(),
        view: this.editing() ? 'edit' : 'detail',
        title: dev ? `${dev.code} ${dev.title}` : null,
        requirements: dev ? clauseRefsOf(dev.clauses) : undefined,
      };
    });

    effect(() => {
      const orgId = this.orgId();
      const id = this.id();
      if (this.currentOrgId !== null && orgId !== this.currentOrgId) {
        void this.router.navigateByUrl('/deviations');
        return;
      }
      this.currentOrgId = orgId;
      if (orgId) {
        // Untracked: loading reads (and resets) page state such as `editing`.
        untracked(() => {
          this.load(orgId, id);
          this.loadSubjects(orgId);
        });
      }
    });
  }

  /** Bring a section of the Details tab into view (open it first when collapsed). */
  protected scrollTo(id: string): void {
    const target = document.getElementById(id);
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** A "Spør KI" menu item: run the assist where its answer is shown, and show it. */
  protected runAssist(kind: 'summary' | 'rootCause' | 'actions' | 'similar'): void {
    switch (kind) {
      case 'summary':
        this.summaryAssist()?.run();
        return;
      case 'rootCause':
        this.rootCausePanel()?.suggest();
        this.scrollTo('dev-why');
        return;
      case 'actions':
        this.suggestedActions()?.run();
        this.scrollTo('dev-actions');
        return;
      case 'similar':
        this.similarCases()?.compare();
        this.scrollTo('dev-similar');
        return;
    }
  }

  /** "Spør om saken": open the assistant with a question about this case. */
  protected askAboutCase(dev: DeviationDetailModel): void {
    this.ask.askAbout(
      this.language.translate('deviations.page.ai.askPrompt', { code: dev.code, title: dev.title }),
      undefined,
      { requirements: clauseRefsOf(dev.clauses) },
    );
  }

  protected overdue(dev: DeviationDetailModel): boolean {
    return dev.overdue ?? isOverdue(dev.due_at, dev.status);
  }

  protected dateTime(value: string | null | undefined): string | null {
    return value ? formatLocalDate(value, 'dateTime', this.language.locale()) || null : null;
  }

  protected day(value: string | null | undefined): string | null {
    return value ? formatLocalDay(value.slice(0, 10), 'mediumDate', this.language.locale()) : null;
  }

  protected departmentName(id: string): string {
    return this.departments().find((d) => d.id === id)?.name ?? '';
  }

  protected optionsFor(type: string): readonly DynamicFieldOption[] {
    if (type === 'user') {
      return this.owners();
    }
    if (type === 'department') {
      return this.departments();
    }
    return [];
  }

  /** Human-readable display of a type field's stored value (null renders "Ikke satt"). */
  protected displayValue(def: FieldDef): string | null {
    const value = this.data()[def.key];
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'boolean') {
      return this.language.translate(value ? 'deviations.detail.yes' : 'deviations.detail.no');
    }
    if (def.type === 'date' && typeof value === 'string') {
      return formatLocalDay(value, 'mediumDate', this.language.locale()) || value;
    }
    if (def.type === 'number' && typeof value === 'number') {
      return formatNumber(value, this.language.locale(), '1.0-6');
    }
    if (Array.isArray(value)) {
      return value.length ? value.map((v) => String(v)).join(', ') : null;
    }
    if (def.type === 'user') {
      return this.owners().find((o) => o.id === value)?.name ?? String(value);
    }
    if (def.type === 'department') {
      return this.departments().find((o) => o.id === value)?.name ?? String(value);
    }
    return String(value);
  }

  protected reasonKeyFor(
    code: string | null | undefined,
    to: string,
    from: string = this.deviation()?.status ?? to,
  ): string {
    return workflowReasonKey(code, { from, to, canManage: this.canManage() });
  }

  protected statusTriggerButton(): HTMLElement | null {
    const host = this.statusTrigger()?.nativeElement;
    return host?.querySelector<HTMLElement>('button') ?? host ?? null;
  }

  protected toggleStatusMenu(event: Event): void {
    event.stopPropagation();
    if (this.statusLockedKey() !== null) {
      return;
    }
    this.statusMenuOpen.update((open) => !open);
  }

  protected closeStatusMenu(): void {
    if (this.statusMenuOpen()) {
      this.statusMenuOpen.set(false);
    }
  }

  protected pickStatus(entry: StatusMenuEntry): void {
    if (entry.blockedBy !== null || this.savingStatus()) {
      return;
    }
    this.statusMenuOpen.set(false);
    if (entry.requiresReason) {
      this.openReason(entry.status);
      return;
    }
    this.changeStatus(entry.status);
  }

  protected submitReason(): void {
    const status = this.reasonFor();
    const reason = this.statusReason().trim();
    if (status === null || !reason) {
      return;
    }
    this.changeStatus(status, reason);
  }

  protected closeReason(): void {
    this.reasonFor.set(null);
    this.statusReason.set('');
  }

  private openReason(status: DeviationStatus): void {
    this.statusReason.set('');
    this.reasonFor.set(status);
  }

  protected changeStatus(status: DeviationStatus, reason?: string): void {
    const orgId = this.orgId();
    const dev = this.deviation();
    if (!orgId || !dev || this.savingStatus() || status === dev.status) {
      return;
    }
    this.statusMenuOpen.set(false);
    this.savingStatus.set(true);
    this.api.changeStatus(orgId, dev.id, status, reason).subscribe({
      next: (updated) => {
        this.savingStatus.set(false);
        this.closeReason();
        this.workflowError.set(null);
        this.applyUpdated(updated);
        this.notifications.success('deviations.detail.statusChangedToast');
      },
      error: (error: unknown) => {
        this.savingStatus.set(false);
        this.handleStatusError(status, reason, error);
      },
    });
  }

  private handleStatusError(status: DeviationStatus, reason: string | undefined, error: unknown) {
    const rejection = parseWorkflowError(error);
    if (!rejection) {
      if (error instanceof HttpErrorResponse && error.status !== 401 && error.status !== 403) {
        this.notifications.error(httpErrorMessageKey(error.status));
      }
      return;
    }
    if (rejection.code === 'reason_required' && !reason) {
      this.openReason(status);
      return;
    }
    const from = this.deviation()?.status ?? status;
    this.closeReason();
    this.workflowError.set({
      ...rejection,
      status,
      reasonKey: this.reasonKeyFor(rejection.code, status, from),
    });
    this.refreshDeviation();
  }

  protected remove(): void {
    const orgId = this.orgId();
    const dev = this.deviation();
    if (!orgId || !dev || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.api.deleteDeviation(orgId, dev.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmDelete.set(false);
        this.notifications.info('deviations.detail.deletedToast');
        void this.router.navigateByUrl('/deviations');
      },
      error: () => {
        this.deleting.set(false);
        this.confirmDelete.set(false);
      },
    });
  }

  protected startEdit(dev: DeviationDetailModel): void {
    const form = editFormFrom(dev);
    this.title.set(form.title);
    this.description.set(form.description);
    this.severity.set(form.severity);
    this.source.set(form.source);
    this.dueAt.set(form.dueAt);
    this.occurredAt.set(form.occurredAt);
    this.detectedAt.set(form.detectedAt);
    this.location.set(form.location);
    this.immediateAction.set(form.immediateAction);
    this.rootCause.set(form.rootCause);
    this.rootCauseMethod.set(form.rootCauseMethod);
    this.refs.set(form.refs);
    this.tags.set(form.tags);
    this.departmentId.set(form.departmentId);
    this.data.set(form.data);
    this.dataErrors.set({});
    this.recordErrors.set({});
    this.titleError.set(false);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.dataErrors.set({});
    const dev = this.deviation();
    if (dev) {
      this.data.set({ ...dev.data });
    }
  }

  protected setRecordData(value: Record<string, unknown>): void {
    const errors = this.recordErrors();
    const changed = Object.keys(errors).filter((key) => value[key] !== this.data()[key]);
    if (changed.length) {
      const next = { ...errors };
      for (const key of changed) {
        delete next[key];
      }
      this.recordErrors.set(next);
    }
    this.data.set(value);
  }

  protected onWorkflowChanged(updated: DeviationDetailModel): void {
    this.applyUpdated(updated);
  }

  protected onActionAdded(action: Action): void {
    this.actions.set([...this.actions(), action]);
    this.reloadEvents();
  }

  protected setData(key: string, value: unknown): void {
    this.data.set({ ...this.data(), [key]: value });
    const errors = this.dataErrors();
    if (errors[key]) {
      const next = { ...errors };
      delete next[key];
      this.dataErrors.set(next);
    }
  }

  protected saveEdit(): void {
    const orgId = this.orgId();
    const dev = this.deviation();
    if (!orgId || !dev || this.savingEdit()) {
      return;
    }
    if (!this.title().trim()) {
      this.titleError.set(true);
      this.notifications.error('deviations.create.fixTitle');
      document.getElementById('edit-title')?.focus();
      return;
    }
    const timeError = eventTimesErrorKey(this.occurredAt(), this.detectedAt());
    if (timeError) {
      this.notifications.error(timeError);
      return;
    }
    this.titleError.set(false);

    const patch = buildDeviationPatch(dev, {
      title: this.title(),
      description: this.description(),
      severity: this.severity(),
      source: this.source(),
      dueAt: this.dueAt(),
      occurredAt: this.occurredAt(),
      detectedAt: this.detectedAt(),
      location: this.location(),
      immediateAction: this.immediateAction(),
      rootCause: this.rootCause(),
      rootCauseMethod: this.rootCauseMethod(),
      refs: this.refs(),
      tags: this.tags(),
      departmentId: this.departmentId(),
      data: this.data(),
    });
    if (Object.keys(patch).length === 0) {
      this.editing.set(false);
      return;
    }

    this.savingEdit.set(true);
    this.dataErrors.set({});
    this.api.updateDeviation(orgId, dev.id, patch).subscribe({
      next: (updated) => {
        this.savingEdit.set(false);
        this.editing.set(false);
        this.applyUpdated(updated);
        if ('clauses' in patch) {
          this.requirementsKey.update((k) => k + 1);
        }
        this.clearResolvedWorkflowError();
        this.notifications.success('deviations.detail.savedToast');
      },
      error: (error: unknown) => {
        this.savingEdit.set(false);
        this.handleEditError(error);
      },
    });
  }

  /** One-click link of a typical clause (it becomes a confirmed requirement link). */
  protected linkClause(ref: string): void {
    const orgId = this.orgId();
    const dev = this.deviation();
    if (!orgId || !dev || this.linkingClause()) {
      return;
    }
    const clauses = clausesFromRefs([...clauseRefsOf(dev.clauses), ref]);
    this.linkingClause.set(ref);
    this.api.updateDeviation(orgId, dev.id, { clauses }).subscribe({
      next: (updated) => {
        this.linkingClause.set(null);
        this.applyUpdated(updated);
        this.requirementsKey.update((k) => k + 1);
        this.notifications.success('deviations.detail.clauseLinkedToast');
      },
      error: (error: unknown) => {
        this.linkingClause.set(null);
        notifyDeviationSaveError(this.notifications, error);
      },
    });
  }

  /** Record (or clear) an authority notification. */
  protected saveReporting(event: ReportingSave): void {
    const orgId = this.orgId();
    const dev = this.deviation();
    if (!orgId || !dev || this.savingReporting()) {
      return;
    }
    this.savingReporting.set(event.key);
    this.api
      .updateDeviation(orgId, dev.id, { reporting: { [event.key]: event.update } })
      .subscribe({
        next: (updated) => {
          this.savingReporting.set(null);
          this.applyUpdated(updated);
          this.notifications.success('deviations.reporting.savedToast');
        },
        error: (error: unknown) => {
          this.savingReporting.set(null);
          notifyDeviationError(this.notifications, error);
        },
      });
  }

  private handleEditError(error: unknown): void {
    const recordFieldErrors = recordDataErrors(error);
    if (recordFieldErrors) {
      this.recordErrors.set(recordFieldErrors);
      this.notifications.error('deviations.create.validationToast');
      return;
    }
    const fieldErrors = invalidDataErrors(error);
    if (fieldErrors) {
      this.dataErrors.set(fieldErrorKeys(fieldErrors));
      this.notifications.error('deviations.create.validationToast');
      return;
    }
    notifyDeviationSaveError(this.notifications, error);
    if (isDeviationClosedError(error)) {
      this.editing.set(false);
      this.refreshDeviation();
    }
  }

  protected onOwnerChange(ownerUserId: string): void {
    const acc = this.access();
    if (acc) {
      this.access.set({ ...acc, owner_user_id: ownerUserId || undefined });
    }
    const dev = this.deviation();
    if (dev) {
      const owner = this.owners().find((o) => o.id === ownerUserId);
      this.deviation.set({
        ...dev,
        owner_user_id: ownerUserId || undefined,
        owner_name: owner?.name,
      });
    }
  }

  protected onVisibilityChange(visibility: DeviationVisibility): void {
    const acc = this.access();
    if (acc) {
      this.access.set({ ...acc, visibility });
    }
    const dev = this.deviation();
    if (dev) {
      this.deviation.set({ ...dev, visibility });
    }
  }

  protected reloadEvents(): void {
    const orgId = this.orgId();
    const id = this.id();
    if (!orgId) {
      return;
    }
    this.api.getDeviation(orgId, id).subscribe({
      next: (dev) => {
        this.events.set(dev.events);
        this.actions.set(dev.actions);
        const current = this.deviation();
        if (current) {
          // Action changes can unblock (or block) transitions and tick the checklist.
          this.deviation.set({
            ...current,
            allowed_transitions: dev.allowed_transitions,
            closure_checklist: dev.closure_checklist,
          });
        }
        this.clearResolvedWorkflowError();
      },
    });
  }

  private clearResolvedWorkflowError(): void {
    const error = this.workflowError();
    const dev = this.deviation();
    if (error && dev && !isStillBlocked(dev, error.status)) {
      this.workflowError.set(null);
    }
  }

  protected refreshDeviation(): void {
    const orgId = this.orgId();
    const dev = this.deviation();
    if (!orgId || !dev) {
      return;
    }
    this.api.getDeviation(orgId, dev.id).subscribe({
      next: (fresh) => this.applyUpdated(fresh),
    });
  }

  private applyUpdated(updated: DeviationDetailModel): void {
    this.deviation.set(updated);
    this.actions.set(updated.actions);
    this.events.set(updated.events);
    if (!this.editing()) {
      this.data.set({ ...updated.data });
    }
  }

  private chip(ref: string, title: string): ClauseChip {
    const p = parseClause(ref);
    return {
      ref,
      shortKey: shortNameKey(p.framework),
      short: fixedShortName(p.framework) ?? p.framework,
      number: p.number,
      title,
    };
  }

  private titleOf(s: SuggestedClause): string {
    return this.language.active() === 'nb' ? s.title_nb || s.title : s.title;
  }

  private load(orgId: string, id: string): void {
    this.loading.set(true);
    this.editing.set(false);
    this.access.set(null);
    this.workflowError.set(null);
    this.closeReason();
    this.confirmDelete.set(false);
    this.api.getDeviation(orgId, id).subscribe({
      next: (dev) => {
        this.applyUpdated(dev);
        this.loading.set(false);
        this.loadType(orgId, dev.type_id);
        this.loadRecordVersion(orgId, dev);
        this.loadAccess(orgId, id);
        if (this.edit() && this.canEditThis()) {
          this.startEdit(dev);
        }
      },
      error: () => {
        this.deviation.set(null);
        this.loading.set(false);
      },
    });
  }

  private loadRecordVersion(orgId: string, dev: DeviationDetailModel): void {
    this.recordVersion.set(null);
    this.recordErrors.set({});
    if (!dev.record_type_id || !dev.record_type_version) {
      return;
    }
    this.recordsApi
      .getRecordTypeVersion(orgId, dev.record_type_id, dev.record_type_version)
      .subscribe({ next: (version) => this.recordVersion.set(version) });
  }

  private loadType(orgId: string, typeId: string): void {
    this.api.getType(orgId, typeId).subscribe({
      next: (type) => this.type.set(type),
    });
  }

  private loadAccess(orgId: string, id: string): void {
    if (!this.canManage()) {
      return;
    }
    this.api.getAccess(orgId, id).subscribe({
      next: (access) => {
        this.access.set(access);
        this.grants.set(access.grants);
      },
    });
  }

  private loadSubjects(orgId: string): void {
    this.api.listAccessSubjects(orgId).subscribe({
      next: (subjects) => {
        this.owners.set(personOptions(subjects.users));
        this.departments.set(subjects.departments.map((d) => ({ id: d.id, name: d.name })));
      },
    });
  }
}
