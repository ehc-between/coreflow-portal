import { HttpErrorResponse } from '@angular/common/http';
import { formatNumber } from '@angular/common';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
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
  RootCauseMethod,
  Severity,
  Source,
  Standard,
} from '../../core/deviations/deviation.models';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import {
  invalidDataErrors,
  isDeviationClosedError,
  notifyDeviationSaveError,
} from '../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../core/http/error.interceptor';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { LocalDatePipe, LocalDayPipe, formatLocalDay } from '../../shared/locale/locale-pipes';
import { Icon } from '../../shared/ui/icon/icon';
import { DeviationAccessEditor } from './access/deviation-access-editor';
import { DeviationActions } from './actions/deviation-actions';
import { DeviationClassificationFields } from './classification-fields';
import { ClauseRow, buildDeviationPatch, editFormFrom } from './deviation-edit';
import { EventText, describeEvent } from './deviation-events';
import {
  STATUS_REASON_MAX,
  StatusMenuEntry,
  WorkflowError,
  editLockKey,
  isStillBlocked,
  parseWorkflowError,
  statusLockedKey,
  statusMenuEntries,
  workflowReasonKey,
} from './deviation-workflow';
import {
  ROOT_CAUSE_METHOD_OPTIONS,
  SEVERITY_OPTIONS,
  SOURCE_OPTIONS,
  fieldErrorKeys,
  isOverdue,
  rootCauseMethodLabelKey,
  severityLabelKey,
  severityTone,
  sourceLabelKey,
  standardLabelKey,
  statusLabelKey,
  statusTone,
} from './deviation-enums';
import { DynamicField, DynamicFieldOption } from './dynamic-field';
import { groupFieldsIntoSections } from './types/type-schema';
import { WatchButton } from '../../shared/activity/watch-button';
import { providePageContext } from '../../core/ai/page-context';
import { AskAbout } from '../../shared/ask/ask-about';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { DynamicForm } from '../../shared/records/dynamic-form';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { RecordsApi } from '../../core/records/records-api';
import { RecordTypeVersion } from '../../core/records/record.models';
import { recordDataErrors } from '../../core/deviations/deviation-errors';
import { DeviationStatusLabels } from './deviation-status';
import { DeviationPageGuide } from './guide/deviation-page-guide';
import { SimilarCases } from './insights/similar-cases';
import { SuggestedActions } from './insights/suggested-actions';
import { RootCausePanel } from './root-cause/root-cause-panel';
import { DeviationWorkflowPanel } from './workflow/deviation-workflow-panel';
import { isWorkflowManaged } from './deviation-workflow';

/** The detail tabs (details, related records, activity, comments, files, revisions, tasks). */
const DETAIL_TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
  'tasks',
];

/** Revision snapshot field -> label key, for the revisions tab. */
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
  clauses: 'deviations.create.fields.clauses',
  tags: 'deviations.create.fields.tags',
  visibility: 'deviations.wf.visibility',
  closed_at: 'deviations.detail.meta.closed',
  data: 'deviations.wf.fieldsTitle',
};

/** A rejected status change: the workflow error plus the status that was attempted. */
type StatusRejection = WorkflowError & {
  readonly status: DeviationStatus;
  /** i18n key explaining the rejection, resolved when it happened. */
  readonly reasonKey: string;
};

/**
 * Deviation detail, scoped to the currently selected org. A header band (code,
 * title, type, status / severity badges, standards + clauses, owner, raised /
 * due / closed dates) over the body — core fields plus the type's dynamic `data`
 * rendered read-only, switchable into an inline editor (reusing
 * {@link DynamicField}). Alongside: the CAPA actions panel, the audit-trail
 * timeline and the access / sharing panel. The status menu offers only the
 * workflow's `allowed_transitions` (blocked ones disabled with an explanation),
 * asks for a reason where required and explains a 409 rejection in place,
 * highlighting the blocking actions. Delete goes through the shared confirm
 * dialog. 404 / no-access shows a not-found card; navigates back to the list on
 * org switch.
 */
@Component({
  selector: 'app-deviation-detail',
  imports: [
    TourStepDirective,
    WatchButton,
    AskAbout,
    AiAssistButton,
    RecordDetailLayout,
    MarkdownPipe,
    DynamicForm,
    EntityTasks,
    DeviationPageGuide,
    SimilarCases,
    SuggestedActions,
    RootCausePanel,
    DeviationWorkflowPanel,
    LocalDatePipe,
    LocalDayPipe,
    FormsModule,
    TranslocoPipe,
    HasPermissionDirective,
    Card,
    Badge,
    Button,
    Icon,
    DynamicField,
    DeviationActions,
    DeviationAccessEditor,
    DeviationClassificationFields,
    Alert,
    ConfirmDialog,
    SupportsRequirements,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        </app-card>
      </div>
    } @else if (deviation(); as dev) {
      <app-record-detail-layout
        entityType="deviation"
        [entityId]="dev.id"
        [tabs]="tabs"
        [canEdit]="canEditThis()"
        [canComment]="canWrite()"
        [fieldLabels]="fieldLabels"
        backLink="/deviations"
        backLabelKey="deviations.backToList"
      >
        <div header class="min-w-0">
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <span class="font-mono text-[12.5px] text-fg-subtle">{{ dev.code }}</span>
            @if (dev.type_name) {
              <app-badge tone="neutral">{{ dev.type_name }}</app-badge>
            }
            <app-badge [tone]="statusLabels.tone(dev)" data-testid="status-badge">{{
              statusLabels.label(dev)
            }}</app-badge>
            @if (dev.record_type_version) {
              <app-badge tone="neutral">{{
                'deviations.wf.version' | transloco: { version: dev.record_type_version }
              }}</app-badge>
            }
            <app-badge [tone]="severityTone(dev.severity)">{{
              severityLabelKey(dev.severity) | transloco
            }}</app-badge>
          </div>
          <div class="flex items-start gap-1.5">
            <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
              {{ dev.title }}
            </h1>
            <app-ask-about class="mt-1.5 flex-none" />
          </div>
        </div>

        <div actions class="flex flex-wrap items-center gap-2">
          <app-watch-button entityType="deviation" [entityId]="dev.id" />
          @if (!editing()) {
            <app-ai-assist-button
              assist="deviations.summarise"
              labelKey="deviations.assist.summarise"
              entityType="deviation"
              [entityId]="dev.id"
              (text)="summary.set($event)"
            />
            <div
              *appHasPermission="'deviations:write'"
              #statusTrigger
              class="relative"
              [class.hidden]="isWorkflow()"
              [attr.title]="statusLockedKey() ? (statusLockedKey()! | transloco) : null"
              data-testid="status-trigger"
            >
              <app-button
                variant="secondary"
                [disabled]="statusLockedKey() !== null"
                (click)="toggleStatusMenu($event)"
              >
                <app-icon name="flag" [size]="15" />
                {{ 'deviations.detail.changeStatus' | transloco }}
                <app-icon name="chevron" [size]="14" />
              </app-button>
              @if (statusMenuOpen()) {
                <div
                  class="animate-cf-pop absolute right-0 z-30 mt-1.5 w-72 rounded-tile border border-border bg-surface p-1 shadow-pop"
                  data-testid="status-menu"
                >
                  <div
                    class="flex w-full items-center gap-2 px-2.5 py-2 text-[13.5px] font-semibold text-fg"
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
                      class="flex w-full items-start gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13.5px] text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span class="mt-0.5 w-[15px] flex-none"></span>
                      <span class="min-w-0 flex-1">
                        <span class="block" [class.opacity-50]="entry.blockedBy !== null">{{
                          statusLabelKey(entry.status) | transloco
                        }}</span>
                        @if (entry.blockedBy) {
                          <span class="mt-0.5 block text-[12px] text-fg-muted">{{
                            reasonKeyFor(entry.blockedBy, entry.status) | transloco
                          }}</span>
                        } @else if (entry.requiresReason) {
                          <span class="mt-0.5 block text-[12px] text-fg-subtle">{{
                            'deviations.workflow.reasonHint' | transloco
                          }}</span>
                        }
                      </span>
                    </button>
                  }
                </div>
              }
            </div>

            @if (canEditThis()) {
              <app-button variant="secondary" (click)="startEdit(dev)">
                <app-icon name="procedures" [size]="15" />
                {{ 'deviations.detail.edit' | transloco }}
              </app-button>
            }

            <app-button
              *appHasPermission="'deviations:manage'"
              variant="secondary"
              [loading]="deleting()"
              (click)="confirmDelete.set(true)"
            >
              <app-icon name="x" [size]="15" />
              {{ 'deviations.detail.delete' | transloco }}
            </app-button>
          } @else {
            <app-button variant="ghost" (click)="cancelEdit()">
              {{ 'deviations.detail.cancel' | transloco }}
            </app-button>
            <app-button [loading]="savingEdit()" (click)="saveEdit()">
              <app-icon name="check" [size]="15" />
              {{ 'deviations.detail.save' | transloco }}
            </app-button>
          }
        </div>

        <div class="flex flex-col gap-5">
          <app-deviation-page-guide page="detail" lesson="root-cause-analysis" tour="detail" />

          @if (summary()) {
            <app-card>
              <div class="flex items-start justify-between gap-3" aria-live="polite">
                <div class="min-w-0">
                  <h2 class="mb-1 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
                    {{ 'deviations.assist.summaryTitle' | transloco }}
                  </h2>
                  <div class="text-[13.5px] text-fg" [innerHTML]="summary() | appMarkdown"></div>
                  <p class="mt-1.5 text-[11.5px] text-fg-subtle">
                    {{ 'deviations.assist.reviewNote' | transloco }}
                  </p>
                </div>
                <button
                  type="button"
                  (click)="summary.set('')"
                  [attr.aria-label]="'deviations.assist.dismiss' | transloco"
                  class="flex flex-none rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
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
                  <p class="text-[12.5px] font-semibold text-fg-muted">
                    {{ 'deviations.workflow.blockingActions' | transloco }}
                  </p>
                  <ul class="mt-1 list-disc pl-5 text-[13px] text-fg">
                    @for (b of wfError.blocking; track b.action_id) {
                      <li>{{ b.description }}</li>
                    }
                  </ul>
                </div>
              }
              <button
                type="button"
                (click)="workflowError.set(null)"
                class="w-fit text-[12.5px] font-semibold text-fg-muted hover:text-fg hover:underline"
              >
                {{ 'deviations.workflow.dismiss' | transloco }}
              </button>
            </div>
          }

          <app-card>
            <div
              class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4"
              appTourStep="deviations-meta"
            >
              <div>
                <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                  {{ 'deviations.detail.meta.raised' | transloco }}
                </div>
                <div class="mt-0.5 text-[13px] text-fg">
                  {{ dev.raised_at | localDate: 'mediumDate' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                  {{ 'deviations.detail.meta.due' | transloco }}
                </div>
                <div class="mt-0.5 text-[13px]">
                  @if (dev.due_at) {
                    <span
                      [class.text-fail]="overdue(dev)"
                      [class.font-semibold]="overdue(dev)"
                      [class.text-fg]="!overdue(dev)"
                    >
                      {{ dev.due_at | localDay }}
                    </span>
                  } @else {
                    <span class="text-fg-subtle">—</span>
                  }
                </div>
              </div>
              <div>
                <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                  {{ 'deviations.detail.meta.closed' | transloco }}
                </div>
                <div class="mt-0.5 text-[13px] text-fg">
                  {{ dev.closed_at ? (dev.closed_at | localDate: 'mediumDate') : '—' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                  {{ 'deviations.detail.meta.source' | transloco }}
                </div>
                <div class="mt-0.5 text-[13px] text-fg">
                  {{ sourceLabelKey(dev.source) | transloco }}
                </div>
              </div>
            </div>

            @if (
              dev.standards.length || dev.clauses.length || dev.tags.length || dev.department_id
            ) {
              <div class="mt-4 flex flex-col gap-2.5 border-t border-border pt-4">
                @if (dev.department_id) {
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-[12px] font-semibold text-fg-subtle">{{
                      'deviations.create.fields.department' | transloco
                    }}</span>
                    <span class="text-[13px] text-fg">{{ departmentName(dev.department_id) }}</span>
                  </div>
                }
                @if (dev.standards.length) {
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-[12px] font-semibold text-fg-subtle">{{
                      'deviations.create.fields.standards' | transloco
                    }}</span>
                    @for (std of dev.standards; track std) {
                      <app-badge tone="neutral">{{ standardLabelKey(std) | transloco }}</app-badge>
                    }
                  </div>
                }
                @if (dev.clauses.length) {
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-[12px] font-semibold text-fg-subtle">{{
                      'deviations.create.fields.clauses' | transloco
                    }}</span>
                    @for (c of dev.clauses; track c.standard + c.clause) {
                      <app-badge tone="neutral"
                        >{{ standardLabelKey(c.standard) | transloco }} {{ c.clause }}</app-badge
                      >
                    }
                  </div>
                }
                @if (dev.tags.length) {
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-[12px] font-semibold text-fg-subtle">{{
                      'deviations.create.fields.tags' | transloco
                    }}</span>
                    @for (t of dev.tags; track t) {
                      <span
                        class="inline-flex items-center rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[12px] font-medium text-fg"
                        >{{ t }}</span
                      >
                    }
                  </div>
                }
              </div>
            }
          </app-card>

          <!-- Core fields + dynamic data -->
          <app-card>
            @if (!editing()) {
              <dl class="flex flex-col gap-4">
                <div>
                  <dt class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                    {{ 'deviations.create.fields.description' | transloco }}
                  </dt>
                  <dd class="mt-1 text-[13.5px] whitespace-pre-line text-fg">
                    {{ dev.description || ('deviations.detail.notProvided' | transloco) }}
                  </dd>
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                      {{ 'deviations.create.fields.rootCause' | transloco }}
                    </dt>
                    <dd class="mt-1 text-[13.5px] whitespace-pre-line text-fg">
                      {{ dev.root_cause || ('deviations.detail.notProvided' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                      {{ 'deviations.create.fields.rootCauseMethod' | transloco }}
                    </dt>
                    <dd class="mt-1 text-[13.5px] text-fg">
                      {{
                        (dev.root_cause_method
                          ? rootCauseMethodLabelKey(dev.root_cause_method)
                          : 'deviations.detail.notProvided'
                        ) | transloco
                      }}
                    </dd>
                  </div>
                </div>

                @for (section of schemaSections(); track section.title) {
                  <div class="flex flex-col gap-3">
                    @if (!section.isDefault) {
                      <p class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                        {{ section.title }}
                      </p>
                    }
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      @for (def of section.fields; track def.key) {
                        <div [class.sm:col-span-2]="def.width === 'full'">
                          <dt
                            class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
                          >
                            {{ def.label }}
                          </dt>
                          <dd class="mt-1 text-[13.5px] whitespace-pre-line text-fg">
                            {{ displayValue(def) }}
                          </dd>
                        </div>
                      }
                    </div>
                  </div>
                }
              </dl>
            } @else {
              <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-1.5">
                  <label for="edit-title" class="text-[13px] font-semibold text-fg-muted">
                    {{ 'deviations.create.fields.title' | transloco }}
                    <span class="text-fail" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="edit-title"
                    type="text"
                    [ngModel]="title()"
                    (ngModelChange)="title.set($event)"
                    autocomplete="off"
                    class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                  />
                  @if (titleError()) {
                    <p class="text-[12px] font-medium text-fail">
                      {{ 'deviations.create.titleRequired' | transloco }}
                    </p>
                  }
                </div>

                <div class="flex flex-col gap-1.5">
                  <label for="edit-desc" class="text-[13px] font-semibold text-fg-muted">
                    {{ 'deviations.create.fields.description' | transloco }}
                  </label>
                  <textarea
                    id="edit-desc"
                    [ngModel]="description()"
                    (ngModelChange)="description.set($event)"
                    rows="3"
                    class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                  ></textarea>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="flex flex-col gap-1.5">
                    <label for="edit-severity" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.create.fields.severity' | transloco }}
                    </label>
                    <div class="cf-select">
                      <select
                        id="edit-severity"
                        [ngModel]="severity()"
                        (ngModelChange)="severity.set($event)"
                      >
                        @for (option of severityOptions; track option) {
                          <option [value]="option">
                            {{ severityLabelKey(option) | transloco }}
                          </option>
                        }
                      </select>
                    </div>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label for="edit-source" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.create.fields.source' | transloco }}
                    </label>
                    <div class="cf-select">
                      <select
                        id="edit-source"
                        [ngModel]="source()"
                        (ngModelChange)="source.set($event)"
                      >
                        @for (option of sourceOptions; track option) {
                          <option [value]="option">
                            {{ sourceLabelKey(option) | transloco }}
                          </option>
                        }
                      </select>
                    </div>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label for="edit-due" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.create.fields.due' | transloco }}
                    </label>
                    <input
                      id="edit-due"
                      type="date"
                      [ngModel]="dueAt()"
                      (ngModelChange)="dueAt.set($event)"
                      class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                    />
                  </div>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="flex flex-col gap-1.5">
                    <label for="edit-rc" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.create.fields.rootCause' | transloco }}
                    </label>
                    <textarea
                      id="edit-rc"
                      [ngModel]="rootCause()"
                      (ngModelChange)="rootCause.set($event)"
                      rows="2"
                      class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                    ></textarea>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label for="edit-rcm" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.create.fields.rootCauseMethod' | transloco }}
                    </label>
                    <div class="cf-select">
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
                    </div>
                  </div>
                </div>

                <!-- Classification: department, standards, clauses, tags -->
                <div class="flex flex-col gap-4 border-t border-border pt-4">
                  <div class="flex flex-col gap-1.5 sm:max-w-[50%]">
                    <label for="edit-dept" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.create.fields.department' | transloco }}
                    </label>
                    <div class="cf-select">
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
                    </div>
                  </div>
                  <app-deviation-classification-fields
                    idPrefix="edit"
                    [(standards)]="standards"
                    [(clauses)]="clauses"
                    [(tags)]="tags"
                  />
                </div>

                @if (schemaSections().length) {
                  <div class="flex flex-col gap-6 border-t border-border pt-4">
                    @for (section of schemaSections(); track section.title) {
                      <div class="flex flex-col gap-4">
                        @if (!section.isDefault) {
                          <p class="text-[13px] font-semibold text-fg-muted">
                            {{ section.title }}
                          </p>
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
              </div>
            }
          </app-card>

          @if (recordVersion(); as version) {
            <app-card>
              <h2 class="mb-3 font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
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
          }

          <app-card>
            <app-root-cause-panel
              [deviationId]="dev.id"
              [canEdit]="canEditThis()"
              [problem]="dev.description ?? ''"
              (applied)="refreshDeviation()"
            />
          </app-card>

          <app-card appTourStep="deviations-capa">
            <app-deviation-actions
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
              <div class="mt-3 border-t border-border pt-3">
                <app-suggested-actions [deviationId]="dev.id" (added)="onActionAdded($event)" />
              </div>
            }
          </app-card>

          <app-card>
            <app-similar-cases [deviationId]="dev.id" />
          </app-card>
        </div>

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
          <app-card [padded]="false">
            <h2
              class="px-4 pt-3.5 pb-1 font-display text-[15px] font-bold tracking-[-0.02em] text-fg"
            >
              {{ 'deviations.detail.owner' | transloco }}
            </h2>
            <p class="px-4 pb-3.5 text-[13.5px] text-fg">
              {{ dev.owner_name || ('deviations.access.unassigned' | transloco) }}
            </p>
          </app-card>

          <app-card *appHasPermission="'standards:read'">
            <app-supports-requirements
              entityType="deviation"
              [entityId]="dev.id"
              [actions]="actions()"
            />
          </app-card>

          <app-card [padded]="false">
            <h2
              class="px-4 pt-3.5 pb-2 font-display text-[15px] font-bold tracking-[-0.02em] text-fg"
            >
              {{ 'deviations.detail.auditTrail' | transloco }}
            </h2>
            @if (events().length === 0) {
              <p class="px-4 pb-4 text-[13.5px] text-fg-muted">
                {{ 'deviations.detail.noEvents' | transloco }}
              </p>
            } @else {
              <ul class="px-4 pb-4">
                @for (row of timeline(); track row.event.id) {
                  <li class="flex gap-2.5 pb-3 last:pb-0">
                    <span class="mt-0.5 flex flex-none text-fg-subtle">
                      <app-icon [name]="eventIcon(row.event.kind)" [size]="15" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-[13px] font-medium text-fg">{{
                        row.text.summary
                      }}</span>
                      @if (row.text.detail) {
                        <span class="block text-[12.5px] whitespace-pre-line text-fg-muted">{{
                          row.text.detail
                        }}</span>
                      }
                      <span class="block text-[12px] text-fg-subtle">
                        @if (row.event.actor_name) {
                          {{
                            'deviations.events.byline'
                              | transloco
                                : {
                                    actor: row.event.actor_name,
                                    date: (row.event.created_at | localDate: 'medium'),
                                  }
                          }}
                        } @else {
                          {{ row.event.created_at | localDate: 'medium' }}
                        }
                      </span>
                    </span>
                  </li>
                }
              </ul>
            }
          </app-card>

          @if (access(); as acc) {
            <app-card *appHasPermission="'deviations:manage'" [padded]="false">
              <h2
                class="px-4 pt-3.5 pb-3 font-display text-[15px] font-bold tracking-[-0.02em] text-fg"
              >
                {{ 'deviations.access.sharingTitle' | transloco }}
              </h2>
              <div class="px-4 pb-4">
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
            </app-card>
          }
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
          <label for="status-reason" class="text-[13px] font-semibold text-fg-muted">
            {{ 'deviations.workflow.reasonLabel' | transloco }}
            <span class="text-fail" aria-hidden="true">*</span>
          </label>
          <textarea
            id="status-reason"
            rows="3"
            [value]="statusReason()"
            [maxLength]="reasonMax"
            aria-describedby="status-reason-count"
            (input)="statusReason.set($any($event.target).value)"
            class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          ></textarea>
          <p id="status-reason-count" class="text-right text-[12px] text-fg-subtle">
            {{
              'deviations.workflow.reasonCount'
                | transloco: { count: statusReason().length, max: reasonMax }
            }}
          </p>
        </div>
      </app-confirm-dialog>
    } @else {
      <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'deviations.detail.notFound' | transloco }}
          </div>
        </app-card>
      </div>
    }
  `,
  styles: [
    `
      .cf-select select {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-select select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
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

  /** An AI summary of the deviation (text assist), shown until dismissed. */
  protected readonly summary = signal('');
  /** The pinned record type version of a record-typed deviation (fields + layout). */
  protected readonly recordVersion = signal<RecordTypeVersion | null>(null);
  /** Per-field validation codes for the record fields (422 `invalid_data`). */
  protected readonly recordErrors = signal<Readonly<Record<string, string>>>({});
  /** The deviation's lifecycle is an F4 workflow (record-typed). */
  protected readonly isWorkflow = computed(() => {
    const dev = this.deviation();
    return !!dev && isWorkflowManaged(dev);
  });

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly severityOptions = SEVERITY_OPTIONS;
  protected readonly sourceOptions = SOURCE_OPTIONS;
  protected readonly rootCauseMethodOptions = ROOT_CAUSE_METHOD_OPTIONS;
  protected readonly rootCauseMethodLabelKey = rootCauseMethodLabelKey;
  protected readonly statusTone = statusTone;
  protected readonly severityTone = severityTone;
  protected readonly statusLabelKey = statusLabelKey;
  protected readonly severityLabelKey = severityLabelKey;
  protected readonly sourceLabelKey = sourceLabelKey;
  protected readonly standardLabelKey = standardLabelKey;

  protected readonly deviation = signal<DeviationDetailModel | null>(null);
  protected readonly type = signal<DeviationType | null>(null);
  protected readonly actions = signal<readonly Action[]>([]);
  protected readonly events = signal<readonly DeviationEvent[]>([]);
  protected readonly loading = signal(true);

  protected readonly access = signal<DeviationAccess | null>(null);
  protected readonly grants = signal<readonly AccessGrant[]>([]);

  protected readonly owners = signal<readonly DynamicFieldOption[]>([]);
  protected readonly departments = signal<readonly DynamicFieldOption[]>([]);

  protected readonly statusMenuOpen = signal(false);
  protected readonly savingStatus = signal(false);
  protected readonly deleting = signal(false);
  protected readonly confirmDelete = signal(false);

  // Status workflow state
  /** Target status awaiting a reason (the reason dialog is open while set). */
  protected readonly reasonFor = signal<DeviationStatus | null>(null);
  protected readonly statusReason = signal('');
  /** The last status change the workflow rejected (409), explained in place. */
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
  protected readonly rootCause = signal('');
  protected readonly rootCauseMethod = signal<RootCauseMethod | ''>('');
  protected readonly standards = signal<readonly Standard[]>([]);
  protected readonly clauses = signal<readonly ClauseRow[]>([]);
  protected readonly tags = signal<readonly string[]>([]);
  protected readonly departmentId = signal('');
  protected readonly data = signal<Record<string, unknown>>({});
  protected readonly dataErrors = signal<Record<string, string>>({});
  protected readonly titleError = signal(false);

  /** The type's dynamic field schema, for read-only and edit rendering. */
  protected readonly schema = computed<readonly FieldDef[]>(() =>
    // A record-typed deviation renders its record type version's fields instead.
    this.deviation()?.record_type_version_id ? [] : (this.type()?.schema ?? []),
  );

  /** The schema grouped into render sections for the 2-col grid (read + edit). */
  protected readonly schemaSections = computed(() =>
    groupFieldsIntoSections(
      this.schema(),
      this.language.translate('deviations.create.detailsSection'),
    ),
  );

  /**
   * The audit trail localised from each event's kind + structured detail (the
   * backend's `summary` is English). Re-evaluates on language switch.
   */
  protected readonly timeline = computed<readonly { event: DeviationEvent; text: EventText }[]>(
    () => {
      const t = (key: string, params?: Record<string, unknown>) =>
        this.language.translate(key, params);
      const owners = this.owners();
      const departments = this.departments();
      const subjectName = (type: string, id: string) =>
        (type === 'department' ? departments : owners).find((s) => s.id === id)?.name;
      return this.events().map((event) => ({ event, text: describeEvent(event, t, subjectName) }));
    },
  );

  /** Whether the current user holds org-level write. */
  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('deviations:write'),
  );
  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('deviations:manage'),
  );

  /** Why the deviation can't be edited right now (closed / no reach), or null. */
  protected readonly editLockKey = computed(() => {
    const dev = this.deviation();
    return dev ? editLockKey(dev) : null;
  });
  /** Edit + action controls: org write, and the deviation is open to edits. */
  protected readonly canEditThis = computed(() => this.canWrite() && this.editLockKey() === null);
  /** Why "Change status" is disabled (no transitions offered), or null. */
  protected readonly statusLockedKey = computed(() => {
    const dev = this.deviation();
    return dev ? statusLockedKey(dev) : null;
  });

  protected readonly reasonMax = STATUS_REASON_MAX;
  private readonly statusTrigger = viewChild<ElementRef<HTMLElement>>('statusTrigger');

  private currentOrgId: string | null = null;

  constructor() {
    // Tell the assistant which deviation this page shows (F5 page context).
    providePageContext(() => ({
      module: 'deviations',
      entityType: 'deviation',
      entityId: this.id(),
      view: this.editing() ? 'edit' : 'detail',
      title: this.deviation()?.title ?? null,
    }));

    effect(() => {
      const orgId = this.orgId();
      const id = this.id();
      if (this.currentOrgId !== null && orgId !== this.currentOrgId) {
        void this.router.navigateByUrl('/deviations');
        return;
      }
      this.currentOrgId = orgId;
      if (orgId) {
        this.load(orgId, id);
        this.loadSubjects(orgId);
      }
    });
  }

  protected overdue(dev: DeviationDetailModel): boolean {
    return isOverdue(dev.due_at, dev.status);
  }

  protected departmentName(id: string): string {
    return this.departments().find((d) => d.id === id)?.name ?? '—';
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

  /** Human-readable display for a dynamic field's stored value. */
  protected displayValue(def: FieldDef): string {
    const value = this.data()[def.key];
    if (value === null || value === undefined || value === '') {
      return '—';
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
      return value.length ? value.map((v) => String(v)).join(', ') : '—';
    }
    if (def.type === 'user') {
      return this.owners().find((o) => o.id === value)?.name ?? String(value);
    }
    if (def.type === 'department') {
      return this.departments().find((o) => o.id === value)?.name ?? String(value);
    }
    return String(value);
  }

  protected eventIcon(kind: string): string {
    switch (kind) {
      case 'status':
      case 'status_change':
        return 'flag';
      case 'action':
      case 'action_added':
      case 'action_updated':
        return 'checkcircle';
      case 'comment':
        return 'comment';
      case 'created':
        return 'spark';
      default:
        return 'history';
    }
  }

  /** Explanation key for a workflow code on a move to `to` (permission-phrased for reopening). */
  protected reasonKeyFor(
    code: string | null | undefined,
    to: string,
    from: string = this.deviation()?.status ?? to,
  ): string {
    return workflowReasonKey(code, { from, to, canManage: this.canManage() });
  }

  /** The native "Change status" button, so the reason dialog can return focus to it. */
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

  /** A status-menu pick: blocked entries are inert, reason-required ones open the dialog. */
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
      // The generic toast is suppressed for this request; 401/403 belong to the auth layer.
      if (error instanceof HttpErrorResponse && error.status !== 401 && error.status !== 403) {
        this.notifications.error(httpErrorMessageKey(error.status));
      }
      return;
    }
    if (rejection.code === 'reason_required' && !reason) {
      // The menu didn't know a reason was needed (stale data / older API): ask now.
      this.openReason(status);
      return;
    }
    const from = this.deviation()?.status ?? status;
    this.closeReason();
    // Explained inline only (alert + highlighted actions); no toast on top.
    this.workflowError.set({
      ...rejection,
      status,
      reasonKey: this.reasonKeyFor(rejection.code, status, from),
    });
    // The allowed transitions / actions may be stale; refresh them in place.
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
    this.rootCause.set(form.rootCause);
    this.rootCauseMethod.set(form.rootCauseMethod);
    this.standards.set(form.standards);
    this.clauses.set(form.clauses);
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
  }

  /** Edits of the record type fields (the whole data object from the dynamic form). */
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

  /** A workflow transition, decision or withdrawal refreshed the deviation. */
  protected onWorkflowChanged(updated: DeviationDetailModel): void {
    this.applyUpdated(updated);
  }

  /** An AI-suggested action was added as a CAPA action. */
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
    const title = this.title().trim();
    if (!title) {
      this.titleError.set(true);
      return;
    }
    this.titleError.set(false);

    const patch = buildDeviationPatch(dev, {
      title: this.title(),
      description: this.description(),
      severity: this.severity(),
      source: this.source(),
      dueAt: this.dueAt(),
      rootCause: this.rootCause(),
      rootCauseMethod: this.rootCauseMethod(),
      standards: this.standards(),
      clauses: this.clauses(),
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
        this.clearResolvedWorkflowError();
        this.notifications.success('deviations.detail.savedToast');
      },
      error: (error: unknown) => {
        this.savingEdit.set(false);
        this.handleEditError(error);
      },
    });
  }

  private handleEditError(error: unknown): void {
    const recordFieldErrors = recordDataErrors(error);
    if (recordFieldErrors) {
      // Record-typed deviation: F4 validation codes, rendered by the dynamic form.
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
      // Someone closed it meanwhile: leave edit mode and reload, which shows
      // the closed (locked) state.
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
        // Action changes can unblock (or block) transitions such as closing.
        const current = this.deviation();
        if (current) {
          this.deviation.set({ ...current, allowed_transitions: dev.allowed_transitions });
        }
        this.clearResolvedWorkflowError();
      },
    });
  }

  /**
   * Drop the 409 explanation (and its action highlight) once fresh transitions
   * show the attempted status is no longer blocked. Not run on the refresh right
   * after the 409 itself, so the explanation always shows at least once.
   */
  private clearResolvedWorkflowError(): void {
    const error = this.workflowError();
    const dev = this.deviation();
    if (error && dev && !isStillBlocked(dev, error.status)) {
      this.workflowError.set(null);
    }
  }

  /** Re-fetch the deviation (allowed transitions, actions, events) without a loading state. */
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

  /** Replace the deviation, keeping the live actions/events in sync. */
  private applyUpdated(updated: DeviationDetailModel): void {
    this.deviation.set(updated);
    this.actions.set(updated.actions);
    this.events.set(updated.events);
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
        this.deviation.set(dev);
        this.actions.set(dev.actions);
        this.events.set(dev.events);
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

  /** The fields + layout of the record type version a record-typed deviation is pinned to. */
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
        this.owners.set(subjects.users.map((u) => ({ id: u.id, name: u.name })));
        this.departments.set(subjects.departments.map((d) => ({ id: d.id, name: d.name })));
      },
    });
  }
}
