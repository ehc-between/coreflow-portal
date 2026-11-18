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
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Term } from '../../../shared/guidance/term';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { normaliseMap } from '../data/map-model';
import {
  categoryKey,
  frameworkKey,
  intervalText,
  nodeTypeKey,
  statusKey,
} from '../data/process-display';
import { processErrorKey } from '../data/process-errors';
import {
  HealthItem,
  LinkedRecord,
  MapNode,
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
import { HealthCard } from './health-card';
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

/**
 * A process (`/processes/:id`). Header: title, code · category · status, one
 * primary action (record the review when active, activate otherwise), Edit and
 * Follow, and "Mer" for summary, status changes and delete. Details tab: how
 * complete the process is (with links to fix what is missing), the basic facts,
 * the map (fitted to the card), the process on one page (turtle diagram) with
 * linked risks, KPI results and every linked record, interactions with
 * processes and interested parties, and the description document. The aside
 * shows the requirements it documents, its connections and the review cycle
 * with the review history. Owners record reviews with a prefilled checklist
 * (`?review=1` opens it, as the home page's "do this now" link does).
 */
@Component({
  selector: 'app-process-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AskAbout,
    FieldHelp,
    Term,
    WhyItMatters,
    RecordDetailLayout,
    LocalDayPipe,
    SupportsRequirements,
    EntityTasks,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    FieldItem,
    FieldList,
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
    HealthCard,
    InteractionsPanel,
    LinkRecords,
    ReviewForm,
    ReviewHistory,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (process(); as p) {
      <app-record-detail-layout
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
        backLink="/processes"
        backLabelKey="processes.detail.back"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="process-code">{{ p.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ categoryKey(p.category) | transloco }}</span>
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

        <ng-container ngProjectAs="[secondary]">
          @if (p.can_edit) {
            <a [routerLink]="['/processes', p.id, 'edit']">
              <app-button variant="secondary">{{
                'processes.actions.edit' | transloco
              }}</app-button>
            </a>
          }
          <app-watch-button [entityType]="entityType" [entityId]="p.id" />
        </ng-container>

        <ng-container ngProjectAs="[overflow]">
          <button appMenuItem type="button" (click)="summarise()" data-testid="summarise">
            {{ 'processes.ai.summarise' | transloco }}
          </button>
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

        <app-help-strip help scope="processes" page="detail" lesson="process-approach" />

        <div class="flex flex-col gap-5">
          @if (p.health; as health) {
            <app-process-health-card
              [health]="health"
              [canEdit]="p.can_edit"
              (fix)="fixHealth($event)"
            />
          }

          <app-card>
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-card font-bold text-fg">
                {{ 'processes.detail.overview' | transloco }}
              </h2>
              <app-ask-about [prompt]="'processes.detail.askExplain' | transloco" field="purpose" />
            </div>
            <app-field-list>
              <app-field-item
                labelKey="processes.fields.purpose"
                [value]="p.purpose"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item
                labelKey="processes.fields.scope"
                [value]="p.scope"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item
                labelKey="processes.fields.owner"
                [value]="p.owner?.name"
                empty="none"
              />
              <app-field-item labelKey="processes.fields.department" [value]="p.department?.name" />
              <app-field-item labelKey="processes.fields.parent">
                @if (p.parent; as parent) {
                  <a [routerLink]="['/processes', parent.id]" class="text-accent hover:underline">
                    <span class="font-mono text-meta">{{ parent.code }}</span> {{ parent.title }}
                  </a>
                } @else {
                  {{ 'processes.detail.topLevel' | transloco }}
                }
              </app-field-item>
              <app-field-item labelKey="processes.detail.children" empty="none">
                @for (child of p.children; track child.id) {
                  <a
                    [routerLink]="['/processes', child.id]"
                    class="block text-accent hover:underline"
                  >
                    <span class="font-mono text-meta">{{ child.code }}</span> {{ child.title }}
                  </a>
                }
              </app-field-item>
              <app-field-item labelKey="processes.fields.frameworks" [wide]="true" empty="none">
                @for (f of p.frameworks ?? []; track f) {
                  <span
                    class="mr-1.5 mb-1 inline-flex rounded-full border border-border px-2.5 py-0.5 text-meta font-semibold text-fg-muted"
                    >{{ frameworkKey(f) | transloco }}</span
                  >
                }
              </app-field-item>
            </app-field-list>
          </app-card>

          <app-card>
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

          <div id="process-description">
            <app-description-document-panel [process]="p" (changed)="onChanged($event)" />
          </div>
          <app-why-it-matters scope="processes" page="detail" />
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

        <ng-container ngProjectAs="[aside]">
          <app-card data-testid="review-card">
            <div class="mb-2 flex items-center gap-1.5">
              <h2 class="text-card font-bold text-fg">
                {{ 'processes.review.title' | transloco }}
              </h2>
              <app-field-help scope="processes" page="detail" field="review" />
            </div>
            <dl class="flex flex-col gap-2 text-ui">
              <div class="flex justify-between gap-3">
                <dt class="text-fg-muted">{{ 'processes.review.interval' | transloco }}</dt>
                <dd class="text-right whitespace-nowrap text-fg">
                  @if (interval(); as i) {
                    {{ i.key | transloco: i.params }}
                  } @else {
                    {{ 'common.empty.notSet' | transloco }}
                  }
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-fg-muted">{{ 'processes.fields.nextReview' | transloco }}</dt>
                <dd
                  class="text-right whitespace-nowrap"
                  [class]="p.review_overdue ? 'font-semibold text-warn-ink' : 'text-fg'"
                >
                  @if (p.next_review_at) {
                    {{ p.next_review_at | localDay }}
                    @if (p.review_overdue) {
                      · {{ 'common.status.overdue' | transloco }}
                    }
                  } @else {
                    {{ 'common.empty.notSet' | transloco }}
                  }
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-fg-muted">{{ 'processes.fields.lastReviewed' | transloco }}</dt>
                <dd class="text-right">
                  @if (p.last_reviewed_at) {
                    <span class="text-fg">{{ p.last_reviewed_at | localDay }}</span>
                    @if (p.last_reviewed_by?.name) {
                      <span class="block text-meta text-fg-subtle">{{
                        p.last_reviewed_by?.name
                      }}</span>
                    }
                  } @else {
                    <span
                      [class]="
                        p.status === 'active' ? 'font-semibold text-warn-ink' : 'text-fg-subtle'
                      "
                      data-testid="never-reviewed"
                      >{{ 'processes.review.never' | transloco }}</span
                    >
                  }
                </dd>
              </div>
              @if (p.last_review; as last) {
                <div class="flex items-center justify-between gap-3">
                  <dt class="text-fg-muted">{{ 'processes.review.lastOutcome' | transloco }}</dt>
                  <dd>
                    <app-status-badge
                      meaning="compliance"
                      [value]="outcome(last.outcome)"
                      [labelKey]="'processes.review.outcome.' + last.outcome"
                    />
                  </dd>
                </div>
              }
            </dl>
            @if (p.status === 'active' && !p.owner) {
              <p class="mt-2 text-meta text-warn-ink">
                {{ 'processes.review.noOwnerHint' | transloco }}
              </p>
            }
            <div class="mt-3 flex flex-wrap gap-2">
              @if (p.can_edit && p.status !== 'retired' && primaryAction() !== 'review') {
                <app-button size="sm" variant="secondary" (click)="reviewOpen.set(true)">
                  {{ 'processes.review.record' | transloco }}
                </app-button>
              }
              @if ((p.review_count ?? 0) > 0) {
                <button
                  type="button"
                  class="min-h-8 text-ui font-semibold text-accent hover:underline"
                  (click)="historyOpen.set(true)"
                  data-testid="open-history"
                >
                  {{ 'processes.reviewHistory.openCount' | transloco: { count: p.review_count } }}
                </button>
              }
            </div>
          </app-card>
        </ng-container>
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
  protected readonly categoryKey = categoryKey;
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
