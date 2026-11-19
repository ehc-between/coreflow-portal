import { HttpErrorResponse } from '@angular/common/http';
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { KitApi } from '../../../core/kit/kit-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { AssigneeIn } from '../../../core/tasks/task.models';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Term } from '../../../shared/guidance/term';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip, EntityChipRef } from '../../../shared/kit/entity-chip';
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
  StatusLineTone,
} from '../../../shared/kit/record-sections';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { normaliseMap } from '../data/map-model';
import { frameworkKey, intervalText, nodeTypeKey, statusKey } from '../data/process-display';
import { processErrorKey } from '../data/process-errors';
import {
  DocumentRef,
  HealthItem,
  LinkedRecord,
  MapNode,
  ProcessRef,
  PROCESS_ENTITY_TYPE,
  PROCESS_MODULE,
  ProcessDetail,
  ProcessStatus,
  Turtle,
  TurtleLeg,
} from '../data/process.models';
import { AskPanelService } from '../../ask/ask-panel.service';
import { ProcessesApi } from '../data/processes-api';
import { ProcessMapCanvas } from '../map/process-map-canvas';
import { TurtleDiagram, TurtleFlow } from '../turtle/turtle-diagram';
import { DescriptionDocumentPanel } from './description-document-panel';
import { InteractionsPanel } from './interactions-panel';
import { LinkRecords } from './link-records';
import { ReviewForm } from './review-form';
import { ReviewHistory, outcomeValue } from './review-history';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'revisions',
  'comments',
  'attachments',
];

/** Revision snapshot field -> i18n key (revisions tab). */
export const PROCESS_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'processes.fields.code',
  title: 'processes.fields.title',
  purpose: 'processes.fields.purpose',
  scope: 'processes.fields.scope',
  category: 'processes.fields.category',
  status: 'processes.fields.status',
  owner_user_id: 'processes.fields.owner',
  department_id: 'processes.fields.department',
  parent_id: 'processes.fields.parent',
  inputs: 'processes.fields.inputs',
  outputs: 'processes.fields.outputs',
  resources: 'processes.fields.resources',
  competence: 'processes.fields.competence',
  methods: 'processes.fields.methods',
  kpis: 'processes.fields.kpis',
  risks: 'processes.fields.risks',
  frameworks: 'processes.fields.frameworks',
  map: 'processes.fields.map',
  description_document_id: 'processes.fields.descriptionDocument',
  review_interval_months: 'processes.fields.reviewInterval',
  next_review_at: 'processes.fields.nextReview',
  last_reviewed_at: 'processes.fields.lastReviewed',
};

/** Status moves offered from each status (the server accepts any change). */
export const STATUS_ACTIONS: Readonly<Record<ProcessStatus, readonly ProcessStatus[]>> = {
  draft: ['active', 'retired'],
  active: ['draft', 'retired'],
  retired: ['active'],
};

/** The section a missing building block is fixed in (element ids on this page). */
const FIX_ANCHORS: Readonly<Record<string, string>> = {
  documents: 'process-description',
  turtle: 'process-turtle',
  requirements: 'process-requirements',
};

/** Building blocks that are fixed on the edit page (the rest have their own place). */
const EDIT_FIXES = new Set(['owner', 'purpose', 'scope']);

/**
 * The status sentence of a process: the lifecycle state, a dash, and what it
 * means (overdue review, or how many of the building blocks are in place).
 */
export function processStatusLine(p: ProcessDetail): {
  key: string;
  tone: StatusLineTone;
  params: Record<string, unknown>;
} {
  if (p.status === 'retired') {
    return { key: 'processes.detail.statusLine.retired', tone: 'neutral', params: {} };
  }
  if (p.status === 'draft') {
    return { key: 'processes.detail.statusLine.draft', tone: 'warn', params: {} };
  }
  if (p.review_overdue) {
    return { key: 'processes.detail.statusLine.overdue', tone: 'warn', params: {} };
  }
  const h = p.health;
  if (h && h.done < h.total) {
    return {
      key: 'processes.detail.statusLine.partial',
      tone: 'warn',
      params: { done: h.done, total: h.total },
    };
  }
  return { key: 'processes.detail.statusLine.active', tone: 'pass', params: {} };
}

/**
 * What a process still needs ("Oppfølging", docs/ux-guide.md §2.7): its missing
 * building blocks, each a link (edit page) or an action (map, link dialog,
 * review form). A missing requirement is left to the card's requirements part.
 */
export function processMissing(
  p: ProcessDetail,
  editLink: readonly unknown[],
  fix: (item: HealthItem) => void,
): RecordMissingItem[] {
  const items = (p.health?.items ?? []).filter((i) => !i.ok && i.key !== 'requirements');
  const ordered = [
    ...items.filter((i) => i.key === 'review'),
    ...items.filter((i) => i.key !== 'review'),
  ];
  return ordered.map((item) => {
    const labelKey =
      item.key === 'review' && p.review_overdue
        ? 'processes.detail.missing.reviewOverdue'
        : `processes.detail.missing.${item.key}`;
    return EDIT_FIXES.has(item.key) || item.fix === 'edit'
      ? { key: item.key, labelKey, link: editLink }
      : { key: item.key, labelKey, action: () => fix(item) };
  });
}

/**
 * A process (`/processes/:id`), built on the detail-page anatomy
 * (docs/ux-guide.md §2.7). Header: title, code · kind of process · status, one
 * primary action (record the review when active, activate otherwise), Edit,
 * "Spør KI" (summary, explain) and "Mer" (status changes, review history,
 * delete). "Hovedinformasjon": a status sentence, what the process is for,
 * where it starts and stops, who owns it and its description document. Details
 * tab: the other facts (part of / sub-processes as links), the process on one
 * page (turtle diagram) with every linked record, the map and the description
 * document panel. The "Oppfølging" card lists the missing building blocks, the
 * requirements it documents, its connections and the review cycle. Owners
 * record reviews with a prefilled checklist (`?review=1` opens it, as the home
 * page's "do this now" link does).
 */
@Component({
  selector: 'app-process-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    Term,
    WhyItMatters,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    EntityChip,
    LocalDayPipe,
    SupportsRequirements,
    EntityTasks,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PromptDialog,
    SlideOver,
    StatusBadge,
    ProcessMapCanvas,
    TurtleDiagram,
    DescriptionDocumentPanel,
    InteractionsPanel,
    LinkRecords,
    ReviewForm,
    ReviewHistory,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (process(); as p) {
      <app-record-detail-layout
        [anatomy]="true"
        [entityType]="entityType"
        [entityId]="p.id"
        [title]="p.title"
        [breadcrumbs]="[
          { labelKey: 'modules.names.processes', link: '/processes' },
          { label: p.title },
        ]"
        [tabs]="tabs"
        [canEdit]="p.can_edit"
        [fieldLabels]="fieldLabels"
        [missing]="missing()"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="process-code">{{ p.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'processes.detail.categoryOne.' + p.category | transloco }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            meaning="lifecycle"
            [value]="p.status"
            [labelKey]="statusKey(p.status)"
          />
          @if (p.review_overdue) {
            <app-status-badge
              meaning="lifecycle"
              value="overdue"
              labelKey="processes.review.overdue"
            />
          }
          <span class="sr-only" data-testid="process-title">{{ p.title }}</span>
        </ng-container>

        @if (primaryAction(); as action) {
          <ng-container ngProjectAs="[primary]">
            @if (action === 'review') {
              <app-button (click)="reviewOpen.set(true)" data-testid="open-review">
                <app-icon name="checkcircle" [size]="15" />
                {{ 'processes.review.record' | transloco }}
              </app-button>
            } @else {
              <app-button (click)="pendingStatus.set('active')" data-testid="status-active">
                {{ 'processes.statusActions.active' | transloco }}
              </app-button>
            }
          </ng-container>
        }

        @if (p.can_edit) {
          <ng-container ngProjectAs="[secondary]">
            <a [routerLink]="editLink()" data-testid="edit">
              <app-button variant="secondary">{{
                'processes.actions.edit' | transloco
              }}</app-button>
            </a>
          </ng-container>
        }

        <ng-container ngProjectAs="[overflow]">
          @if (p.can_edit && p.status !== 'retired' && primaryAction() !== 'review') {
            <button
              appMenuItem
              type="button"
              (click)="reviewOpen.set(true)"
              data-testid="open-review"
            >
              {{ 'processes.review.record' | transloco }}
            </button>
          }
          @if ((p.review_count ?? 0) > 0) {
            <button appMenuItem type="button" (click)="historyOpen.set(true)">
              {{ 'processes.reviewHistory.open' | transloco }}
            </button>
          }
          @if (p.can_manage) {
            @for (target of overflowStatuses(); track target) {
              <button
                appMenuItem
                type="button"
                (click)="pendingStatus.set(target)"
                [attr.data-testid]="'status-' + target"
              >
                {{ 'processes.statusActions.' + target | transloco }}
              </button>
            }
            <button
              appMenuItem
              type="button"
              [danger]="true"
              (click)="confirmDelete.set(true)"
              data-testid="delete"
            >
              {{ 'processes.actions.delete' | transloco }}
            </button>
          }
        </ng-container>

        <button appMenuItem ask type="button" (click)="summarise()" data-testid="summarise">
          <app-icon name="spark" [size]="15" />
          {{ 'processes.ai.summarise' | transloco }}
        </button>
        <button appMenuItem ask type="button" (click)="explain()" data-testid="explain">
          <app-icon name="spark" [size]="15" />
          {{ 'processes.detail.explain' | transloco }}
        </button>

        <app-help-strip help scope="processes" page="detail" lesson="process-approach" />

        <app-record-lead record-lead [fillLink]="p.can_edit ? editLink() : null">
          <app-record-status-line status [tone]="statusLine().tone">
            {{ statusLine().key | transloco: statusLine().params }}
          </app-record-status-line>
          <app-field-item
            size="lead"
            labelKey="processes.detail.lead.purpose"
            [value]="p.purpose"
            [multiline]="true"
          />
          <app-field-item
            size="lead"
            labelKey="processes.detail.lead.scope"
            [value]="p.scope"
            [multiline]="true"
          />
          <app-field-item
            size="lead"
            labelKey="processes.detail.lead.owner"
            [value]="p.owner?.name"
          />
          <app-field-item
            size="lead"
            labelKey="processes.detail.lead.document"
            [keepEmpty]="true"
            emptyKey="processes.detail.lead.noDocument"
          >
            @if (p.description_document; as doc) {
              @if (doc.accessible) {
                <span class="flex flex-wrap items-center gap-2" data-testid="lead-document">
                  <app-entity-chip [ref]="documentRef(doc)" [showType]="false" />
                  @if (doc.status) {
                    <app-status-badge
                      meaning="lifecycle"
                      [value]="doc.status"
                      [labelKey]="'processes.document.status.' + doc.status"
                    />
                  }
                </span>
              } @else {
                <span class="text-ui text-fg-muted">{{
                  'processes.document.restricted' | transloco
                }}</span>
              }
            }
          </app-field-item>
        </app-record-lead>

        <div class="flex flex-col gap-6">
          <app-record-details [columns]="2" [fillLink]="p.can_edit ? editLink() : null">
            <!-- Not fields to fill in: shown only when the process has them. -->
            @if (p.parent; as parent) {
              <app-field-item labelKey="processes.detail.partOf">
                <app-entity-chip [ref]="processRef(parent)" [showType]="false" />
              </app-field-item>
            }
            @if (p.children.length > 0) {
              <app-field-item labelKey="processes.detail.children">
                @for (child of p.children; track child.id) {
                  <app-entity-chip class="block" [ref]="processRef(child)" [showType]="false" />
                }
              </app-field-item>
            }
            <app-field-item labelKey="processes.fields.department" [value]="p.department?.name" />
            <app-field-item labelKey="processes.detail.frameworks">
              @for (f of p.frameworks ?? []; track f) {
                <span
                  class="mr-1.5 mb-1 inline-flex rounded-full border border-border px-2.5 py-0.5 text-meta font-semibold text-fg-muted"
                  >{{ frameworkKey(f) | transloco }}</span
                >
              }
            </app-field-item>
          </app-record-details>

          <app-card id="process-turtle">
            <div class="mb-1 flex flex-wrap items-start justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <h2 class="text-card font-bold text-fg">
                  {{ 'processes.turtle.titleLead' | transloco }}
                  <span class="font-normal text-fg-muted"
                    >(<app-term key="turtle" scope="processes">{{
                      'processes.turtle.titleTerm' | transloco
                    }}</app-term
                    >)</span
                  >
                </h2>
                <app-field-help scope="processes" page="detail" field="turtle" />
              </div>
              <app-button
                variant="secondary"
                size="sm"
                (click)="interactionsOpen.set(true)"
                data-testid="open-interactions"
              >
                {{
                  (p.can_edit ? 'processes.interactions.edit' : 'processes.interactions.view')
                    | transloco: { count: interactionCount() }
                }}
              </app-button>
            </div>
            <p class="mb-3 text-meta text-fg-muted">{{ 'processes.turtle.intro' | transloco }}</p>
            @if (turtle(); as t) {
              <app-turtle-diagram
                [turtle]="t"
                [canEdit]="p.can_edit"
                [canCreate]="flowKeys()"
                (link)="linkLeg.set($event)"
                (unlink)="unlink($event)"
                (createFlow)="startFlow($event)"
              />
            } @else if (turtleError()) {
              <app-error-state bodyKey="processes.turtle.failed" (retry)="reloadTurtle()" />
            } @else {
              <app-loading-state [rows]="3" />
            }
          </app-card>

          <app-card id="process-map">
            <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 class="text-card font-bold text-fg">
                  {{ 'processes.detail.map' | transloco }}
                </h2>
                <p class="text-meta text-fg-muted">
                  @if (map().nodes.length) {
                    {{
                      'processes.detail.mapSummary'
                        | transloco
                          : {
                              steps: map().nodes.length,
                              lanes: map().lanes.length,
                              version: p.map_version,
                            }
                    }}
                  } @else {
                    {{ 'processes.detail.noMapShort' | transloco }}
                  }
                </p>
              </div>
              <a [routerLink]="['/processes', p.id, 'map']">
                <app-button
                  size="sm"
                  [variant]="map().nodes.length || !p.can_edit ? 'secondary' : 'primary'"
                >
                  {{
                    (p.can_edit
                      ? map().nodes.length
                        ? 'processes.detail.editMap'
                        : 'processes.detail.drawMap'
                      : 'processes.detail.viewMap'
                    ) | transloco
                  }}
                </app-button>
              </a>
            </div>
            @if (map().nodes.length > 0) {
              <app-process-map-canvas
                [map]="map()"
                [fit]="true"
                [selectedId]="selectedStep()?.id ?? null"
                (nodeSelected)="selectStep($event)"
                (backgroundClicked)="selectedStepId.set(null)"
              />
              <p class="mt-1.5 text-meta text-fg-subtle">
                {{ 'processes.detail.mapHint' | transloco }}
              </p>
              @if (selectedStep(); as step) {
                <div class="mt-3 rounded-tile bg-surface-2 p-3 text-ui" data-testid="step-info">
                  <p class="font-semibold text-fg">
                    {{ step.label || (nodeTypeKey(step.type) | transloco) }}
                    <span class="font-normal text-fg-muted">
                      · {{ nodeTypeKey(step.type) | transloco }}
                    </span>
                  </p>
                  @if (step.description) {
                    <p class="mt-1 whitespace-pre-line text-fg-muted">{{ step.description }}</p>
                  }
                  <div class="mt-1.5 flex flex-wrap gap-3">
                    @if (step.document_id) {
                      <a
                        [routerLink]="['/documents', step.document_id]"
                        class="font-semibold text-accent"
                      >
                        {{ 'processes.map.step.openProcedure' | transloco }}
                      </a>
                    }
                    @if (step.process_id) {
                      <a
                        [routerLink]="['/processes', step.process_id]"
                        class="font-semibold text-accent"
                      >
                        {{ 'processes.map.step.openSubprocess' | transloco }}
                      </a>
                    }
                  </div>
                </div>
              }
            } @else {
              <p class="text-ui text-fg-muted">{{ 'processes.detail.noMap' | transloco }}</p>
            }
          </app-card>

          <div id="process-description">
            <app-description-document-panel [process]="p" (changed)="onChanged($event)" />
          </div>
        </div>

        <div tasks>
          <app-entity-tasks
            [entityType]="entityType"
            [entityId]="p.id"
            [canCreate]="p.can_edit"
            [defaultAssignee]="defaultAssignee()"
            [entityLabel]="p.code + ' ' + p.title"
          />
        </div>

        <div aside-requirements id="process-requirements">
          <app-supports-requirements
            [entityType]="entityType"
            [entityId]="p.id"
            [canEdit]="p.can_edit"
            [frameworks]="p.frameworks?.length ? p.frameworks : null"
          />
        </div>

        <app-record-meta follow-up-meta data-testid="review-card">
          <app-field-item layout="inline" labelKey="processes.review.interval">
            @if (interval(); as i) {
              {{ i.key | transloco: i.params }}
            }
          </app-field-item>
          <app-field-item
            layout="inline"
            labelKey="processes.fields.nextReview"
            [keepEmpty]="true"
            emptyKey="kit.detail.meta.notPlanned"
            emptyActionKey="kit.detail.meta.plan"
            [emptyLink]="p.can_edit ? editLink() : null"
          >
            @if (p.next_review_at) {
              <span [class.text-warn-ink]="p.review_overdue">{{
                p.next_review_at | localDay
              }}</span>
            }
          </app-field-item>
          <app-field-item
            layout="inline"
            labelKey="processes.fields.lastReviewed"
            [keepEmpty]="true"
          >
            @if (p.last_reviewed_at) {
              {{ p.last_reviewed_at | localDay }}
              @if (p.last_reviewed_by?.name) {
                <span class="block font-normal text-fg-subtle">{{ p.last_reviewed_by?.name }}</span>
              }
            } @else {
              <span
                [class]="p.status === 'active' ? 'text-warn-ink' : 'font-normal text-fg-subtle'"
                data-testid="never-reviewed"
                >{{ 'processes.review.never' | transloco }}</span
              >
            }
          </app-field-item>
          <app-field-item layout="inline" labelKey="processes.review.lastOutcome">
            @if (p.last_review; as last) {
              <app-status-badge
                meaning="compliance"
                [value]="outcome(last.outcome)"
                [labelKey]="'processes.review.outcome.' + last.outcome"
              />
            }
          </app-field-item>
          <app-field-item
            layout="inline"
            labelKey="processes.detail.updated"
            [value]="p.updated_at | localDay"
          />
          @if ((p.review_count ?? 0) > 0) {
            <button
              type="button"
              class="mt-1 self-start text-meta font-semibold text-accent hover:underline"
              (click)="historyOpen.set(true)"
              data-testid="open-history"
            >
              {{ 'processes.reviewHistory.openCount' | transloco: { count: p.review_count } }}
            </button>
          }
        </app-record-meta>

        <div aside-learn>
          <app-why-it-matters scope="processes" page="detail" />
        </div>
      </app-record-detail-layout>

      <app-slide-over
        [open]="interactionsOpen()"
        [title]="'processes.interactions.title' | transloco"
        [closeLabel]="'processes.actions.close' | transloco"
        [width]="560"
        (closed)="interactionsOpen.set(false)"
      >
        @if (interactionsOpen()) {
          <app-interactions-panel [process]="p" (changed)="reload()" />
        }
      </app-slide-over>

      <app-process-review-form
        [open]="reviewOpen()"
        [process]="p"
        [lang]="language.active()"
        (saved)="onReviewed($event)"
        (closed)="reviewOpen.set(false)"
      />
      <app-process-review-history
        [open]="historyOpen()"
        [processId]="p.id"
        (closed)="historyOpen.set(false)"
      />
      <app-process-link-records
        [leg]="linkLeg()"
        [processId]="p.id"
        [exclude]="linkedIds()"
        (linked)="onLinked()"
        (closed)="linkLeg.set(null)"
      />
    } @else if (notFound()) {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-empty-state
          icon="search"
          titleKey="processes.detail.notFoundTitle"
          bodyKey="processes.detail.notFoundBody"
          ctaKey="processes.detail.back"
          ctaLink="/processes"
        />
      </div>
    } @else if (loadError()) {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-error-state (retry)="reload()" />
      </div>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-loading-state [rows]="5" />
      </div>
    }

    <app-prompt-dialog
      [open]="pendingStatus() !== null"
      [title]="'processes.statusActions.confirmTitle' | transloco: { status: pendingStatusLabel() }"
      [message]="'processes.statusActions.message.' + (pendingStatus() ?? 'active') | transloco"
      [label]="'processes.fields.changeReason' | transloco"
      [maxLength]="1000"
      [busy]="busy()"
      confirmVariant="primary"
      [confirmLabel]="'processes.statusActions.confirm' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      (confirmed)="changeStatus($event)"
      (cancelled)="pendingStatus.set(null)"
    />

    <app-confirm-dialog
      [open]="confirmDelete()"
      [title]="'processes.delete.title' | transloco"
      [message]="'processes.delete.message' | transloco: { code: process()?.code ?? '' }"
      [confirmLabel]="'processes.actions.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="confirmDelete.set(false)"
    />
  `,
})
export class ProcessDetailPage {
  private readonly api = inject(ProcessesApi);
  private readonly kit = inject(KitApi);
  private readonly standards = inject(StandardsApi);
  private readonly flows = inject(CreateFlowService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly askPanel = inject(AskPanelService);

  readonly id = input.required<string>();

  protected readonly entityType = PROCESS_ENTITY_TYPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = PROCESS_FIELD_LABELS;
  protected readonly statusKey = statusKey;
  protected readonly frameworkKey = frameworkKey;
  protected readonly nodeTypeKey = nodeTypeKey;

  protected readonly process = signal<ProcessDetail | null>(null);
  protected readonly turtle = signal<Turtle | null>(null);
  protected readonly turtleError = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly reviewOpen = signal(false);
  protected readonly historyOpen = signal(false);
  protected readonly interactionsOpen = signal(false);
  protected readonly linkLeg = signal<TurtleLeg | null>(null);
  protected readonly pendingStatus = signal<ProcessStatus | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly selectedStepId = signal<string | null>(null);
  protected readonly flowKeys = signal<readonly string[]>([]);
  private readonly confirmedRefs = signal<readonly string[]>([]);
  /** `?review=1` (from the home page): open the review form once loaded. */
  private openReviewOnLoad = this.route.snapshot.queryParamMap.get('review') === '1';

  protected readonly map = computed(() => normaliseMap(this.process()?.map));
  protected readonly selectedStep = computed<MapNode | null>(
    () => this.map().nodes.find((n) => n.id === this.selectedStepId()) ?? null,
  );

  /** One primary action: record the review on an active process, activate otherwise. */
  protected readonly primaryAction = computed<'review' | 'activate' | null>(() => {
    const p = this.process();
    if (!p) {
      return null;
    }
    if (p.status === 'active') {
      return p.can_edit ? 'review' : null;
    }
    return p.can_manage ? 'activate' : null;
  });

  /** Status changes in "Mer" (the primary button already offers "Aktiver"). */
  protected readonly overflowStatuses = computed(() => {
    const p = this.process();
    const targets = p ? (STATUS_ACTIONS[p.status] ?? []) : [];
    return targets.filter((t) => !(t === 'active' && this.primaryAction() === 'activate'));
  });

  protected readonly interval = computed(() => {
    const months = this.process()?.review_interval_months;
    return months ? intervalText(months) : null;
  });

  protected readonly interactionCount = computed(() => {
    const p = this.process();
    return p ? p.interactions.length + (p.party_interactions?.length ?? 0) : 0;
  });

  protected readonly linkedIds = computed(() => {
    const t = this.turtle();
    const leg = this.linkLeg();
    if (!t || !leg) {
      return [];
    }
    const items = leg === 'risks' ? t.linked_risks : (t.linked?.[leg] ?? []);
    return items.map((i) => i.entity_id);
  });

  protected readonly pendingStatusLabel = computed(() => {
    const status = this.pendingStatus();
    return status ? this.language.translate(statusKey(status)) : '';
  });
  protected readonly defaultAssignee = computed<AssigneeIn | null>(() => {
    const owner = this.process()?.owner;
    return owner ? { type: 'user', value: owner.id } : null;
  });

  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/processes',
    this.id(),
    'edit',
  ]);

  /** The sentence at the top of "Hovedinformasjon" (docs/ux-guide.md §2.7). */
  protected readonly statusLine = computed(() => {
    const p = this.process();
    return p ? processStatusLine(p) : { key: '', tone: 'neutral' as StatusLineTone, params: {} };
  });

  /** "Oppfølging": the missing building blocks, each with where it is fixed. */
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const p = this.process();
    if (!p || !p.can_edit) {
      return [];
    }
    return processMissing(p, this.editLink(), (item) => this.fixHealth(item));
  });

  constructor() {
    providePageContext(() => {
      const p = this.process();
      return {
        module: PROCESS_MODULE,
        entityType: PROCESS_ENTITY_TYPE,
        entityId: this.id(),
        view: 'detail',
        title: p ? `${p.code} ${p.title}` : null,
        requirements: this.confirmedRefs().length ? this.confirmedRefs() : null,
      };
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (!orgId || !id) {
        return;
      }
      untracked(() => {
        this.process.set(null);
        this.turtle.set(null);
        this.selectedStepId.set(null);
        this.load(orgId, id);
      });
    });
  }

  private load(orgId: string, id: string): void {
    this.loadError.set(null);
    this.notFound.set(false);
    this.api.get(orgId, id).subscribe({
      next: (process) => {
        this.process.set(process);
        if (this.openReviewOnLoad && process.can_edit && process.status !== 'retired') {
          this.openReviewOnLoad = false;
          this.reviewOpen.set(true);
        }
        this.loadTurtle(orgId, id);
        this.loadExtras(orgId, id);
      },
      error: (error) => {
        if (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 422)) {
          this.notFound.set(true);
        } else {
          this.loadError.set(processErrorKey(error));
        }
      },
    });
  }

  /** Create-from-here flows and the confirmed requirement refs (for the assistant). */
  private loadExtras(orgId: string, id: string): void {
    this.kit.createFlows(orgId, PROCESS_ENTITY_TYPE, { entityId: id }).subscribe({
      next: (list) => this.flowKeys.set(list.items.map((f) => f.key)),
      error: () => this.flowKeys.set([]),
    });
    this.standards.listLinks(orgId, { entity_type: PROCESS_ENTITY_TYPE, entity_id: id }).subscribe({
      next: (links) =>
        this.confirmedRefs.set(
          links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
        ),
      error: () => this.confirmedRefs.set([]),
    });
  }

  private loadTurtle(orgId: string, id: string): void {
    this.turtleError.set(false);
    this.api.turtle(orgId, id).subscribe({
      next: (turtle) => this.turtle.set(turtle),
      error: () => this.turtleError.set(true),
    });
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.load(orgId, this.id());
    }
  }

  protected reloadTurtle(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.loadTurtle(orgId, this.id());
    }
  }

  protected onChanged(updated: ProcessDetail): void {
    this.process.set(updated);
    this.reloadTurtle();
  }

  protected onReviewed(updated: ProcessDetail): void {
    this.reviewOpen.set(false);
    this.process.set(updated);
  }

  protected onLinked(): void {
    this.linkLeg.set(null);
    this.reload();
  }

  protected outcome(value: string): string {
    return outcomeValue(value);
  }

  protected selectStep(id: string): void {
    this.selectedStepId.set(this.selectedStepId() === id ? null : id);
  }

  protected summarise(): void {
    this.askPanel.askAbout(this.language.translate('processes.ai.summarisePrompt'));
  }

  protected explain(): void {
    this.askPanel.askAbout(this.language.translate('processes.detail.askExplain'));
  }

  protected processRef(p: ProcessRef): EntityChipRef {
    return {
      entity_type: PROCESS_ENTITY_TYPE,
      entity_id: p.id,
      title: p.title,
      code: p.code,
      status: p.status,
      module: PROCESS_MODULE,
      url: `/processes/${p.id}`,
    };
  }

  protected documentRef(doc: DocumentRef): EntityChipRef {
    return {
      entity_type: 'document',
      entity_id: doc.id,
      title: doc.title ?? '',
      code: doc.doc_code,
      url: doc.url ?? `/documents/${doc.id}`,
    };
  }

  protected startFlow(key: TurtleFlow): void {
    void this.flows.start(key, PROCESS_ENTITY_TYPE, this.id());
  }

  protected unlink(item: LinkedRecord): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !item.link_id || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.kit.deleteLink(orgId, item.link_id).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('processes.notices.unlinked', { title: item.title });
        this.reload();
      },
      error: (error) => this.fail(error),
    });
  }

  /** "Fiks" on a missing building block: go to where it is filled in. */
  protected fixHealth(item: HealthItem): void {
    const p = this.process();
    if (!p) {
      return;
    }
    switch (item.fix) {
      case 'edit':
        void this.router.navigate(['/processes', p.id, 'edit']);
        return;
      case 'map':
        void this.router.navigate(['/processes', p.id, 'map']);
        return;
      case 'review':
        this.reviewOpen.set(true);
        return;
      case 'turtle':
        if (item.key === 'risks') {
          this.linkLeg.set('risks');
          return;
        }
        if (item.key === 'kpis') {
          this.linkLeg.set('kpis');
          return;
        }
        break;
    }
    const anchor = FIX_ANCHORS[item.fix];
    const el = anchor ? document.getElementById(anchor) : null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected changeStatus(reason: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.process();
    const status = this.pendingStatus();
    if (!orgId || !p || !status || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.changeStatus(orgId, p.id, status, reason.trim() || null).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.pendingStatus.set(null);
        this.process.set(updated);
        this.notifications.success('processes.notices.statusChanged', {
          status: this.language.translate(statusKey(updated.status)),
        });
      },
      error: (error) => {
        this.pendingStatus.set(null);
        this.fail(error);
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.process();
    if (!orgId || !p || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.delete(orgId, p.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('processes.notices.deleted', { code: p.code });
        void this.router.navigate(['/processes']);
      },
      error: (error) => {
        this.confirmDelete.set(false);
        this.fail(error);
      },
    });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.notifications.error(processErrorKey(error));
  }
}
