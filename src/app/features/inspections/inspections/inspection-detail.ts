import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { formatPercent } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
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
import {
  LocalDatePipe,
  LocalDayPipe,
  LocalNumberPipe,
  LocalPercentPipe,
  formatLocalDay,
} from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AskPanelService } from '../../ask/ask-panel.service';
import { ClauseRefs } from '../components/clause-refs';
import { DeviationLink } from '../components/deviation-link';
import { groupBySection } from '../data/answer-model';
import {
  StatusSentence,
  inspectionMissing,
  inspectionStatusSentence,
} from '../data/inspection-anatomy';
import {
  INSPECTIONS_SETTINGS_LINK,
  findingStatusKey,
  inspectionStatusKey,
  saveBlob,
  severityKey,
} from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { InspectionReferences } from '../data/inspection-references';
import {
  ASSIST_SUMMARISE_RESULTS,
  Finding,
  INSPECTIONS_MODULE,
  INSPECTION_ENTITY_TYPE,
  InspectionDetail,
  InspectionResponse,
  Lang,
  Question,
  Signature,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';
import { TextAssist } from '../data/text-assist';
import { FindingForm } from '../findings/finding-form';
import { FindingPanel } from '../findings/finding-panel';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> i18n key (revisions tab). */
export const INSPECTION_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'inspections.fields.code',
  title: 'inspections.fields.title',
  status: 'inspections.fields.status',
  result: 'inspections.fields.result',
  location: 'inspections.fields.location',
  notes: 'inspections.fields.notes',
  summary: 'inspections.fields.summary',
  inspector_user_id: 'inspections.fields.inspector',
  owner_user_id: 'inspections.fields.owner',
  department_id: 'inspections.fields.department',
  due_at: 'inspections.fields.dueAt',
  started_at: 'inspections.fields.startedAt',
  completed_at: 'inspections.fields.completedAt',
  score_pct: 'inspections.fields.score',
  responses: 'inspections.fields.responses',
  signature: 'inspections.fields.signature',
  cancel_reason: 'inspections.fields.cancelReason',
  subject_type: 'inspections.subject.label',
  subject_id: 'inspections.subject.label',
};

/**
 * An inspection (`/inspections/:id`; `?finding=<id>` or `/findings/<id>` opens a
 * finding), on the detail-page anatomy (docs/ux-guide.md §2.7). The header is
 * code · type · status with one primary action (start, continue, or the report once
 * completed) and the assistant in "Spør KI". "Hovedinformasjon" says how it went in
 * one sentence (result, score and pass mark, or how far it is) and shows the
 * checklist, what and where it checks, and who does it (or did it). The Details tab
 * lists the findings (each with its deviation as a link), every answer by section and
 * the other fields with the empty ones hidden. The "Oppfølging" card lists what is
 * still open, the requirements it documents, its connections and the metadata.
 */
@Component({
  selector: 'app-inspection-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    LocalPercentPipe,
    MarkdownPipe,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ProgressBar,
    PromptDialog,
    SlideOver,
    StatusBadge,
    ClauseRefs,
    DeviationLink,
    FindingForm,
    FindingPanel,
  ],
  providers: [TextAssist],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (inspection(); as ins) {
      <app-record-detail-layout
        [anatomy]="true"
        [entityType]="entityType"
        [entityId]="ins.id"
        [title]="ins.title"
        [breadcrumbs]="[
          { labelKey: 'modules.names.inspections', link: '/inspections' },
          { label: ins.title },
        ]"
        [settingsLink]="settingsLink"
        [tabs]="tabs"
        [requirementsPanel]="true"
        [canEdit]="ins.permissions.can_edit || ins.permissions.can_perform"
        [fieldLabels]="fieldLabels"
        [missing]="missing()"
        backLink="/inspections"
        backLabelKey="inspections.list.back"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="inspection-code">{{ ins.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'inspections.detail.typeLabel' | transloco }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            meaning="lifecycle"
            [value]="ins.status"
            [labelKey]="statusKey(ins.status)"
          />
          @if (ins.is_overdue) {
            <app-status-badge meaning="lifecycle" value="overdue" />
          }
          <span class="sr-only" data-testid="inspection-title">{{ ins.title }}</span>
        </ng-container>

        @if (primaryAction(); as action) {
          <ng-container ngProjectAs="[primary]">
            @if (action === 'report') {
              <app-button [loading]="downloading()" (click)="downloadReport()" data-testid="report">
                <app-icon name="download" [size]="15" />
                {{ 'inspections.detail.report' | transloco }}
              </app-button>
            } @else {
              <a [routerLink]="['/inspections', ins.id, 'run']">
                <app-button data-testid="run-inspection">
                  <app-icon name="checkcircle" [size]="15" />
                  {{
                    (action === 'start'
                      ? 'inspections.detail.start'
                      : 'inspections.detail.continue'
                    ) | transloco
                  }}
                </app-button>
              </a>
            }
          </ng-container>
        }

        @if (editLink(); as link) {
          <a secondary [routerLink]="link">
            <app-button variant="secondary" data-testid="edit-inspection">
              {{ 'inspections.actions.edit' | transloco }}
            </app-button>
          </a>
        }

        <ng-container ngProjectAs="[overflow]">
          @if (primaryAction() !== 'report' && ins.status !== 'planned') {
            <button appMenuItem type="button" (click)="downloadReport()">
              {{ 'inspections.detail.report' | transloco }}
            </button>
          }
          @if (isOpen() && ins.permissions.can_edit) {
            <button appMenuItem type="button" (click)="cancelOpen.set(true)" data-testid="cancel">
              {{ 'inspections.detail.cancel' | transloco }}
            </button>
          }
          @if (ins.permissions.can_manage) {
            <button
              appMenuItem
              type="button"
              [danger]="true"
              (click)="confirmDelete.set(true)"
              data-testid="delete"
            >
              {{ 'inspections.actions.delete' | transloco }}
            </button>
          }
        </ng-container>

        @if (hasResults()) {
          <ng-container ngProjectAs="[ask]">
            <button
              appMenuItem
              type="button"
              [disabled]="assist.running()"
              (click)="summarise()"
              data-testid="summarise"
            >
              <app-icon name="spark" [size]="15" />
              {{ 'inspections.ai.summarise' | transloco }}
            </button>
            <button appMenuItem type="button" (click)="askResults()" data-testid="ask-results">
              <app-icon name="spark" [size]="15" />
              {{ 'inspections.detail.askResults' | transloco }}
            </button>
          </ng-container>
        }

        <app-help-strip help scope="inspections" page="detail" lesson="inspection-basics" />

        <app-record-lead record-lead [fillLink]="editLink()">
          @let line = statusLine();
          <app-record-status-line status [tone]="line.tone" data-testid="result-badge">
            {{ line.key | transloco: line.params }}
          </app-record-status-line>
          @if (ins.status === 'in_progress') {
            <div class="sm:col-span-full">
              <app-progress-bar
                [value]="ins.question_count ? (100 * ins.answered_count) / ins.question_count : 0"
                [label]="'inspections.run.progressLabel' | transloco"
              />
            </div>
          }
          @if (ins.status === 'completed') {
            <p class="-mt-2 text-meta text-fg-muted sm:col-span-full" data-testid="score-rule">
              @if (ins.score_possible) {
                {{
                  'inspections.detail.points'
                    | transloco
                      : {
                          earned: (ins.score_earned | localNumber: '1.0-1'),
                          possible: (ins.score_possible | localNumber: '1.0-1'),
                        }
                }}.
              }
              {{
                ins.pass_threshold === null
                  ? ('inspections.detail.ruleAnyFail' | transloco)
                  : ('inspections.detail.ruleThreshold'
                    | transloco: { value: (ins.pass_threshold | localPercent) })
              }}
            </p>
          }
          <app-field-item size="lead" labelKey="inspections.detail.lead.checklist">
            @if (ins.template; as t) {
              <a
                [routerLink]="['/settings/modules/inspections/templates', t.id]"
                class="font-semibold text-accent hover:underline"
                data-testid="template-link"
                >{{ t.title }}</a
              >
              <span class="text-ui text-fg-muted">
                · {{ 'inspections.templates.versionShort' | transloco: { version: t.version } }}
              </span>
            }
          </app-field-item>
          <app-field-item size="lead" labelKey="inspections.detail.lead.what">
            @if (ins.subject; as subject) {
              <span class="block"><app-entity-chip [ref]="subject" [statusText]="true" /></span>
            }
            @if (ins.location) {
              <span class="flex items-center gap-1.5">
                <app-icon name="pin" [size]="15" class="text-fg-subtle" />{{ ins.location }}
              </span>
            }
          </app-field-item>
          @if (ins.status === 'completed') {
            <app-field-item
              size="lead"
              labelKey="inspections.detail.lead.doneBy"
              [value]="doneBy()"
            />
            @if (ins.summary) {
              <app-field-item
                size="lead"
                labelKey="inspections.detail.lead.summary"
                [value]="ins.summary"
                [wide]="true"
                [multiline]="true"
              />
            }
          } @else {
            <app-field-item
              size="lead"
              labelKey="inspections.fields.inspector"
              [value]="ins.inspector?.name"
            />
            <app-field-item
              size="lead"
              labelKey="inspections.fields.dueAt"
              [value]="ins.due_at ? (ins.due_at | localDay) : null"
            />
          }
        </app-record-lead>

        <div class="flex flex-col gap-6">
          @if (assist.text() || assist.running()) {
            <app-card>
              <div class="mb-1 flex items-start justify-between gap-2">
                <h2 class="flex items-center gap-1.5 text-card font-bold text-fg">
                  <app-icon name="spark" [size]="14" />
                  {{ 'inspections.ai.summaryTitle' | transloco }}
                </h2>
                <app-button variant="ghost" size="sm" (click)="assist.clear()">
                  {{ 'inspections.actions.close' | transloco }}
                </app-button>
              </div>
              @if (assist.text()) {
                <div
                  class="text-body text-fg"
                  data-testid="summary-text"
                  [innerHTML]="assist.text() | appMarkdown"
                ></div>
              } @else {
                <p class="text-ui text-fg-muted">{{ 'inspections.ai.running' | transloco }}</p>
              }
            </app-card>
          }

          @if (showFindings()) {
            <app-card>
              <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-card font-bold text-fg">
                  {{ 'inspections.detail.findings' | transloco: { count: ins.findings.length } }}
                </h2>
                @if (canRaise()) {
                  <app-button
                    size="sm"
                    variant="secondary"
                    (click)="findingFormOpen.set(true)"
                    data-testid="add-finding"
                  >
                    <app-icon name="plus" [size]="14" />
                    {{ 'inspections.findings.add' | transloco }}
                  </app-button>
                }
              </div>
              <p class="mb-2 text-meta text-fg-muted">
                {{ 'inspections.detail.findingsHint' | transloco }}
              </p>
              <ul class="flex flex-col divide-y divide-border" data-testid="finding-list">
                @for (f of ins.findings; track f.id) {
                  <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                    <button
                      type="button"
                      class="group flex min-w-0 flex-1 basis-[240px] items-center gap-2 text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      (click)="openFinding(f.id)"
                      [attr.data-testid]="'finding-row-' + f.code"
                    >
                      <app-icon name="flag" [size]="14" class="flex-none text-fg-subtle" />
                      <span class="flex-none font-mono text-meta text-fg-muted">{{ f.code }}</span>
                      <span
                        class="min-w-0 truncate text-body font-semibold text-fg group-hover:text-accent group-hover:underline"
                        >{{ f.title }}</span
                      >
                    </button>
                    <span class="flex flex-wrap items-center gap-1.5">
                      <app-status-badge
                        meaning="severity"
                        [value]="f.severity"
                        [labelKey]="severityKey(f.severity)"
                      />
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="f.status"
                        [labelKey]="findingStatusKey(f.status)"
                      />
                      @if (f.is_overdue) {
                        <app-status-badge meaning="lifecycle" value="overdue" />
                      }
                      @if (f.deviation; as dev) {
                        <app-deviation-link [deviation]="dev" />
                      }
                    </span>
                  </li>
                } @empty {
                  <li class="py-2 text-ui text-fg-muted">
                    {{ 'inspections.detail.noFindings' | transloco }}
                  </li>
                }
              </ul>
            </app-card>
          }

          <app-card>
            <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="text-card font-bold text-fg">
                {{ 'inspections.detail.answers' | transloco }}
              </h2>
              @if (ins.status !== 'planned') {
                <span class="text-meta text-fg-muted" data-testid="answers-summary">
                  {{
                    (ins.failed_count > 0
                      ? 'inspections.detail.answersSummary'
                      : 'inspections.detail.answersSummaryOk'
                    )
                      | transloco
                        : {
                            answered: ins.answered_count,
                            total: ins.question_count,
                            failed: ins.failed_count,
                          }
                  }}
                </span>
              }
            </div>
            @if (ins.status === 'planned') {
              <p class="mb-3 text-ui text-fg-muted">
                {{ 'inspections.detail.notStarted' | transloco }}
              </p>
            }
            @for (group of sections(); track $index) {
              <section class="mb-4 last:mb-0">
                @if (group.title) {
                  <h3 class="mb-2 text-meta font-bold tracking-wide text-fg-subtle uppercase">
                    {{ group.title }}
                  </h3>
                }
                <ol class="flex flex-col divide-y divide-border">
                  @for (q of group.items; track q.id) {
                    @let r = responseOf(q.id);
                    @let f = findingFor(q.id);
                    <li class="flex flex-col gap-1 py-2.5" [attr.data-testid]="'response-' + q.id">
                      <div class="flex flex-wrap items-start gap-2">
                        <span class="font-mono text-meta text-fg-subtle"
                          >{{ numberOf(q.id) }}.</span
                        >
                        <span class="min-w-0 flex-1 basis-[220px] text-body text-fg">{{
                          q.text
                        }}</span>
                        <span class="flex flex-wrap items-center gap-1.5 text-ui">
                          @if (!r) {
                            <span class="text-fg-subtle">{{
                              'inspections.detail.unanswered' | transloco
                            }}</span>
                          } @else if (r.is_na) {
                            <app-status-badge
                              meaning="lifecycle"
                              value="not_applicable"
                              labelKey="inspections.answers.na"
                            />
                          } @else {
                            <span
                              class="font-semibold"
                              [class.text-fail-ink]="r.failed"
                              [class.text-fg]="!r.failed"
                            >
                              {{ answerLabel(q, r) }}
                            </span>
                            @if (r.failed) {
                              <app-status-badge
                                meaning="lifecycle"
                                value="failed"
                                labelKey="inspections.run.failed"
                              />
                            }
                          }
                        </span>
                      </div>
                      @if (r?.note || r?.attachment_ids?.length || q.clause_refs.length || f) {
                        <div class="flex flex-col gap-1 pl-6">
                          @if (r?.note) {
                            <p class="text-ui whitespace-pre-line text-fg-muted">{{ r?.note }}</p>
                          }
                          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta">
                            @if (q.type !== 'photo' && r?.attachment_ids?.length; as photos) {
                              <button
                                type="button"
                                class="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                                (click)="showAttachments()"
                              >
                                <app-icon name="upload" [size]="12" />
                                {{ 'inspections.detail.photos' | transloco: { count: photos } }}
                              </button>
                            }
                            @if (f) {
                              <button
                                type="button"
                                class="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                                (click)="openFinding(f.id)"
                              >
                                <app-icon name="flag" [size]="12" />
                                {{ 'inspections.detail.findingLink' | transloco: { code: f.code } }}
                              </button>
                            }
                            <app-clause-refs [refs]="q.clause_refs" />
                          </div>
                        </div>
                      }
                    </li>
                  }
                </ol>
              </section>
            }
          </app-card>

          <app-record-details [columns]="2" [fillLink]="editLink()">
            @if (ins.status === 'completed') {
              <app-field-item
                labelKey="inspections.fields.inspector"
                [value]="ins.inspector?.name"
              />
              <app-field-item
                labelKey="inspections.fields.dueAt"
                [value]="ins.due_at ? (ins.due_at | localDay) : null"
              />
            }
            <app-field-item labelKey="inspections.fields.department" [value]="departmentName()" />
            <app-field-item
              labelKey="inspections.fields.startedAt"
              [value]="ins.started_at ? (ins.started_at | localDate) : null"
            />
            <app-field-item labelKey="inspections.detail.passMark">
              {{
                ins.pass_threshold === null
                  ? ('inspections.detail.noPassMark' | transloco)
                  : (ins.pass_threshold | localPercent)
              }}
            </app-field-item>
            @if (ins.auto_deviation) {
              <app-field-item
                labelKey="inspections.findings.deviation"
                [value]="
                  'inspections.detail.autoDeviation'
                    | transloco
                      : {
                          severity: (severityKey(ins.deviation_min_severity ?? 'high') | transloco),
                        }
                "
              />
            }
            @if (ins.schedule_id) {
              <app-field-item
                labelKey="inspections.detail.recurring"
                [value]="'inspections.detail.scheduled' | transloco"
              />
            }
            @if (ins.signature; as sig) {
              <app-field-item labelKey="inspections.fields.signature" [wide]="true">
                @if (sig.image) {
                  <img
                    [src]="sig.image"
                    [alt]="'inspections.signature.imageAlt' | transloco: { name: sig.name }"
                    class="mb-1 h-16 rounded-tile border border-border bg-white"
                  />
                }
                <span class="block">
                  {{ 'inspections.detail.signedBy' | transloco: { name: sig.name } }}
                  @if (sig.signed_at) {
                    <span class="text-fg-muted"> · {{ sig.signed_at | localDate }}</span>
                  }
                </span>
              </app-field-item>
            }
            <app-field-item
              labelKey="inspections.fields.notes"
              [value]="ins.notes"
              [wide]="true"
              [multiline]="true"
            />
          </app-record-details>
        </div>

        <app-record-meta follow-up-meta>
          <app-field-item
            layout="inline"
            labelKey="inspections.fields.owner"
            [value]="ins.owner?.name"
          />
          <app-field-item
            layout="inline"
            labelKey="inspections.detail.meta.createdBy"
            [value]="ins.created_by?.name"
          />
          <app-field-item
            layout="inline"
            labelKey="inspections.fields.updatedAt"
            [value]="ins.updated_at | localDate"
          />
        </app-record-meta>

        <div aside-learn>
          <app-why-it-matters scope="inspections" page="detail" />
        </div>
      </app-record-detail-layout>

      <app-slide-over
        [open]="!!openFindingId()"
        [title]="selectedFinding()?.code ?? ('inspections.findings.panelTitle' | transloco)"
        [closeLabel]="'inspections.actions.close' | transloco"
        [width]="600"
        (closed)="closeFinding()"
      >
        @if (selectedFinding(); as f) {
          <app-finding-panel
            [finding]="f"
            [permissions]="ins.permissions"
            [question]="questionOf(f.question_id)"
            (changed)="onFindingChanged($event)"
            (deleted)="onFindingDeleted($event)"
          />
        } @else if (openFindingId()) {
          <p class="text-ui text-fg-muted">{{ 'inspections.findings.notFound' | transloco }}</p>
        }
      </app-slide-over>

      <app-slide-over
        [open]="findingFormOpen()"
        [title]="'inspections.findings.addTitle' | transloco"
        [closeLabel]="'inspections.actions.close' | transloco"
        [width]="560"
        (closed)="findingFormOpen.set(false)"
      >
        @if (findingFormOpen()) {
          <app-finding-form
            [inspection]="ins"
            (saved)="onFindingRaised($event)"
            (cancelled)="findingFormOpen.set(false)"
          />
        }
      </app-slide-over>

      <app-prompt-dialog
        [open]="cancelOpen()"
        [title]="'inspections.detail.cancelTitle' | transloco"
        [message]="'inspections.detail.cancelMessage' | transloco"
        [label]="'inspections.fields.cancelReason' | transloco"
        [confirmLabel]="'inspections.detail.cancel' | transloco"
        [cancelLabel]="'inspections.actions.back' | transloco"
        confirmVariant="danger"
        [busy]="busy()"
        (confirmed)="cancelInspection($event)"
        (cancelled)="cancelOpen.set(false)"
      />
      <app-confirm-dialog
        [open]="confirmDelete()"
        [title]="'inspections.detail.deleteTitle' | transloco"
        [message]="'inspections.detail.deleteMessage' | transloco: { code: ins.code }"
        [confirmLabel]="'inspections.actions.delete' | transloco"
        [cancelLabel]="'inspections.actions.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="confirmDelete.set(false)"
      />
    } @else if (notFound()) {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-empty-state
          icon="search"
          titleKey="inspections.detail.notFoundTitle"
          bodyKey="inspections.detail.notFound"
          ctaKey="inspections.list.back"
          ctaLink="/inspections"
        />
      </div>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
    }
  `,
})
export class InspectionDetailPage {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);
  private readonly references = inject(InspectionReferences);
  private readonly language = inject(LanguageService);
  private readonly askPanel = inject(AskPanelService);
  private readonly ai = inject(AiAvailability);
  protected readonly assist = inject(TextAssist);

  readonly id = input.required<string>();
  /** `?finding=<id>` or the `/findings/<id>` path opens it in the side panel. */
  readonly finding = input<string | undefined>(undefined);

  protected readonly entityType = INSPECTION_ENTITY_TYPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = INSPECTION_FIELD_LABELS;
  protected readonly settingsLink = INSPECTIONS_SETTINGS_LINK;
  protected readonly statusKey = inspectionStatusKey;
  protected readonly severityKey = severityKey;
  protected readonly findingStatusKey = findingStatusKey;

  protected readonly inspection = signal<InspectionDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly downloading = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly findingFormOpen = signal(false);
  protected readonly openFindingId = signal<string | null>(null);

  protected readonly isOpen = computed(() => {
    const s = this.inspection()?.status;
    return s === 'planned' || s === 'in_progress';
  });

  /** There are answers to summarise or ask about ("Spør KI"). */
  protected readonly hasResults = computed(() => {
    const s = this.inspection()?.status;
    return !this.ai.unavailable() && (s === 'in_progress' || s === 'completed');
  });

  /** The plan can still be changed: the edit page ("Rediger", "Fyll ut"). */
  protected readonly editLink = computed<readonly unknown[] | null>(() => {
    const ins = this.inspection();
    return ins && this.isOpen() && ins.permissions.can_edit
      ? ['/inspections', ins.id, 'edit']
      : null;
  });

  /** The one primary action: start / continue for the inspector, else the report. */
  protected readonly primaryAction = computed<'start' | 'continue' | 'report' | null>(() => {
    const ins = this.inspection();
    if (!ins) {
      return null;
    }
    if (this.isOpen() && ins.permissions.can_perform) {
      return ins.status === 'planned' ? 'start' : 'continue';
    }
    return ins.status === 'completed' ? 'report' : null;
  });

  protected readonly canRaise = computed(() => {
    const ins = this.inspection();
    return (
      !!ins &&
      (ins.status === 'in_progress' || ins.status === 'completed') &&
      (ins.permissions.can_perform || ins.permissions.can_edit) &&
      (this.selectedOrg.currentOrg()?.permissions.includes('inspections:write') ?? false)
    );
  });

  /** Findings make sense once the inspection is under way (or when there are some). */
  protected readonly showFindings = computed(() => {
    const ins = this.inspection();
    return (
      !!ins &&
      (ins.findings.length > 0 || ins.status === 'in_progress' || ins.status === 'completed')
    );
  });

  /** "Ikke godkjent – 63 % av poengene, grensen er 80 %." */
  protected readonly statusLine = computed<StatusSentence>(() => {
    const ins = this.inspection();
    const locale = this.language.locale();
    if (!ins) {
      return { key: 'inspections.detail.status.planned', tone: 'neutral' };
    }
    return inspectionStatusSentence(ins, {
      percent: (v) => formatPercent(v / 100, locale, '1.0-0'),
      day: (v) => formatLocalDay(v, 'mediumDate', locale),
    });
  });

  /** "Emma Kristiansen, 15. nov. 2026". */
  protected readonly doneBy = computed(() => {
    const ins = this.inspection();
    if (!ins?.completed_at) {
      return null;
    }
    const name = ins.completed_by?.name ?? ins.inspector?.name;
    const date = formatLocalDay(ins.completed_at, 'mediumDate', this.language.locale());
    return name ? this.language.translate('inspections.detail.doneBy', { name, date }) : date;
  });

  /** The "Oppfølging" card's to-dos. */
  protected readonly missing = computed<RecordMissingItem[]>(() => {
    const ins = this.inspection();
    if (!ins) {
      return [];
    }
    return inspectionMissing(ins, {
      editLink: this.editLink(),
      runLink:
        this.isOpen() && ins.permissions.can_perform ? ['/inspections', ins.id, 'run'] : null,
      openFinding: (id) => this.openFinding(id),
    });
  });

  protected readonly sections = computed(() => groupBySection(this.inspection()?.questions ?? []));
  private readonly numbers = computed(
    () => new Map((this.inspection()?.questions ?? []).map((q, i) => [q.id, i + 1] as const)),
  );
  private readonly responses = computed(
    () => new Map((this.inspection()?.responses ?? []).map((r) => [r.question_id, r] as const)),
  );
  private readonly findingsByQuestion = computed(
    () =>
      new Map(
        (this.inspection()?.findings ?? [])
          .filter((f) => !!f.question_id)
          .map((f) => [f.question_id as string, f] as const),
      ),
  );

  protected readonly selectedFinding = computed<Finding | null>(() => {
    const id = this.openFindingId();
    return id ? (this.inspection()?.findings.find((f) => f.id === id) ?? null) : null;
  });

  protected readonly departmentName = computed(() =>
    this.references.departmentName(this.inspection()?.department_id),
  );

  constructor() {
    providePageContext(() => {
      const ins = this.inspection();
      const finding = this.selectedFinding();
      return {
        module: INSPECTIONS_MODULE,
        entityType: finding ? 'inspection_finding' : INSPECTION_ENTITY_TYPE,
        entityId: finding?.id ?? this.openFindingId() ?? this.id(),
        view: 'detail',
        title: finding ? `${finding.code} ${finding.title}` : (ins?.title ?? null),
        requirements: finding ? (finding.question_clause_refs ?? []) : (ins?.clause_refs ?? []),
      };
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() => this.load(orgId, id));
      }
    });

    effect(() => {
      const fid = this.finding();
      untracked(() => this.openFindingId.set(fid || null));
    });

    this.references.ensurePeople();
  }

  private load(orgId: string, id: string): void {
    this.api.get(orgId, id).subscribe({
      next: (ins) => {
        this.notFound.set(false);
        this.inspection.set(ins);
      },
      error: () => this.notFound.set(true),
    });
  }

  private reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ins = this.inspection();
    if (orgId && ins) {
      this.load(orgId, ins.id);
    }
  }

  protected numberOf(id: string): number {
    return this.numbers().get(id) ?? 0;
  }

  protected responseOf(id: string): InspectionResponse | undefined {
    return this.responses().get(id);
  }

  protected findingFor(questionId: string): Finding | undefined {
    return this.findingsByQuestion().get(questionId);
  }

  protected questionOf(id: string | null): Question | null {
    return id ? (this.inspection()?.questions.find((q) => q.id === id) ?? null) : null;
  }

  /** A short display of an answer (translated yes/no, score, number with unit, ...). */
  protected answerLabel(q: Question, r: InspectionResponse): string {
    const number = (n: unknown) =>
      typeof n === 'number' ? new Intl.NumberFormat(this.language.locale()).format(n) : String(n);
    switch (q.type) {
      case 'photo':
        return this.language.translate('inspections.detail.photos', {
          count: r.attachment_ids.length,
        });
      case 'signature':
        return (r.value as Signature | null)?.name ?? '';
      case 'score':
        return `${number(r.value)} / ${number(q.scale_max)}`;
      case 'number':
        return `${number(r.value)}${q.unit ? ' ' + q.unit : ''}`;
      case 'yes_no':
        return this.yesNo(String(r.value));
      default:
        return String(r.value ?? '');
    }
  }

  private yesNo(value: string): string {
    return value === 'yes' || value === 'no'
      ? this.language.translate(`inspections.answers.${value}`)
      : value;
  }

  /** "Spør KI" → "Oppsummer resultatene": the summary shows at the top of Details. */
  protected summarise(): void {
    const ins = this.inspection();
    if (ins) {
      this.assist.run(ASSIST_SUMMARISE_RESULTS, { inspection_id: ins.id }, this.entityType, ins.id);
    }
  }

  protected askResults(): void {
    const ins = this.inspection();
    if (!ins) {
      return;
    }
    this.askPanel.askAbout(
      this.language.translate('inspections.detail.askExplain', { code: ins.code }),
      { field: this.language.translate('inspections.detail.answers') },
      { requirements: ins.clause_refs ?? [] },
    );
  }

  protected showAttachments(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: 'attachments' },
      queryParamsHandling: 'merge',
    });
  }

  protected downloadReport(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ins = this.inspection();
    if (!orgId || !ins || this.downloading()) {
      return;
    }
    const lang: Lang = this.language.active() === 'nb' ? 'nb' : 'en';
    this.downloading.set(true);
    this.api.reportPdf(orgId, ins.id, lang).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        saveBlob(blob, `${ins.code}.pdf`);
      },
      error: (e: unknown) => {
        this.downloading.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }

  protected openFinding(id: string): void {
    this.openFindingId.set(id);
    void this.router.navigate(['/inspections', this.id()], {
      queryParams: { finding: id },
      replaceUrl: true,
    });
  }

  protected closeFinding(): void {
    this.openFindingId.set(null);
    void this.router.navigate(['/inspections', this.id()], {
      queryParams: { finding: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onFindingChanged(f: Finding): void {
    this.inspection.update((ins) =>
      ins ? { ...ins, findings: ins.findings.map((x) => (x.id === f.id ? f : x)) } : ins,
    );
    this.reload();
  }

  protected onFindingDeleted(id: string): void {
    this.closeFinding();
    this.inspection.update((ins) =>
      ins ? { ...ins, findings: ins.findings.filter((x) => x.id !== id) } : ins,
    );
    this.reload();
  }

  protected onFindingRaised(f: Finding): void {
    this.findingFormOpen.set(false);
    this.inspection.update((ins) => (ins ? { ...ins, findings: [...ins.findings, f] } : ins));
    this.reload();
  }

  protected cancelInspection(reason: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ins = this.inspection();
    if (!orgId || !ins) {
      return;
    }
    this.busy.set(true);
    this.api.cancel(orgId, ins.id, reason).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.cancelOpen.set(false);
        this.inspection.set(updated);
        this.notifications.success('inspections.notices.cancelled', { code: updated.code });
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ins = this.inspection();
    if (!orgId || !ins) {
      return;
    }
    this.busy.set(true);
    this.api.delete(orgId, ins.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('inspections.notices.deleted', { code: ins.code });
        void this.router.navigate(['/inspections']);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }
}
