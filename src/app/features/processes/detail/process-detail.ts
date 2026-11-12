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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeIn } from '../../../core/tasks/task.models';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachMe } from '../../../shared/guidance/teach-me';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { pluralKey } from '../../../shared/i18n/plural';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { AskPanelService } from '../../ask/ask-panel.service';
import { normaliseMap } from '../data/map-model';
import {
  categoryKey,
  categoryTone,
  dateInputToIso,
  nodeTypeKey,
  statusKey,
  statusTone,
} from '../data/process-display';
import { processErrorKey } from '../data/process-errors';
import {
  MapNode,
  PROCESS_ENTITY_TYPE,
  PROCESS_MODULE,
  ProcessDetail,
  ProcessStatus,
  Turtle,
} from '../data/process.models';
import { ProcessesApi } from '../data/processes-api';
import { ProcessMapCanvas } from '../map/process-map-canvas';
import { TurtleDiagram } from '../turtle/turtle-diagram';
import { DescriptionDocumentPanel } from './description-document-panel';
import { InteractionsPanel } from './interactions-panel';

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

/**
 * A process (`/processes/:id`): register facts, the swimlane map (read-only,
 * with a link to the editor), the turtle diagram, the description document and
 * interactions in the details tab; review tasks, related items, the timeline,
 * revisions, comments and attachments in the other tabs. Owners and editors
 * record periodic reviews; managers change the status and delete. Assistant:
 * page context plus "summarise" and "explain" questions.
 */
@Component({
  selector: 'app-process-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AskAbout,
    FieldHelp,
    GuideIntro,
    TeachMe,
    WhyItMatters,
    RecordDetailLayout,
    LocalDayPipe,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    PromptDialog,
    SlideOver,
    ProcessMapCanvas,
    TurtleDiagram,
    DescriptionDocumentPanel,
    InteractionsPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (process(); as p) {
      <app-record-detail-layout
        [entityType]="entityType"
        [entityId]="p.id"
        [tabs]="tabs"
        [canEdit]="p.can_edit"
        [fieldLabels]="fieldLabels"
        backLink="/processes"
        backLabelKey="processes.detail.back"
      >
        <div header>
          <p class="font-mono text-[12px] text-fg-subtle">{{ p.code }}</p>
          <h1
            class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            data-testid="process-title"
          >
            {{ p.title }}
          </h1>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <app-badge [tone]="statusTone(p.status)">{{
              statusKey(p.status) | transloco
            }}</app-badge>
            <app-badge [tone]="categoryTone(p.category)">{{
              categoryKey(p.category) | transloco
            }}</app-badge>
            @if (p.review_overdue) {
              <app-badge tone="fail">{{ 'processes.review.overdue' | transloco }}</app-badge>
            }
          </div>
        </div>

        <ng-container ngProjectAs="[actions]">
          <app-watch-button [entityType]="entityType" [entityId]="p.id" />
          <app-button variant="secondary" size="sm" (click)="summarise()">
            <app-icon name="spark" [size]="14" />
            {{ 'processes.ai.summarise' | transloco }}
          </app-button>
          @if (p.can_edit) {
            <a [routerLink]="['/processes', p.id, 'edit']">
              <app-button variant="secondary" size="sm">
                {{ 'processes.actions.edit' | transloco }}
              </app-button>
            </a>
            @if (p.status !== 'retired') {
              <app-button
                variant="secondary"
                size="sm"
                (click)="reviewOpen.set(true)"
                data-testid="open-review"
              >
                <app-icon name="checkcircle" [size]="14" />
                {{ 'processes.review.record' | transloco }}
              </app-button>
            }
          }
          @if (p.can_manage) {
            @for (target of statusActions(); track target) {
              <app-button
                [variant]="target === 'retired' ? 'ghost' : 'primary'"
                size="sm"
                (click)="pendingStatus.set(target)"
                [attr.data-testid]="'status-' + target"
              >
                {{ 'processes.statusActions.' + target | transloco }}
              </app-button>
            }
            <app-button variant="danger" size="sm" (click)="confirmDelete.set(true)">
              <app-icon name="trash" [size]="14" />
              {{ 'processes.actions.delete' | transloco }}
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="processes" page="detail" />

          <app-card>
            <div class="mb-2 flex items-center justify-between gap-2">
              <h2 class="text-[15px] font-bold text-fg">
                {{ 'processes.detail.overview' | transloco }}
              </h2>
              <app-ask-about [prompt]="'processes.detail.askExplain' | transloco" field="purpose" />
            </div>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
              <div class="sm:col-span-2">
                <dt class="cf-dt">{{ 'processes.fields.purpose' | transloco }}</dt>
                <dd class="whitespace-pre-line text-fg">
                  {{ p.purpose || ('processes.detail.notSet' | transloco) }}
                </dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="cf-dt">{{ 'processes.fields.scope' | transloco }}</dt>
                <dd class="whitespace-pre-line text-fg">
                  {{ p.scope || ('processes.detail.notSet' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="cf-dt">{{ 'processes.fields.owner' | transloco }}</dt>
                <dd class="text-fg">
                  {{ p.owner?.name || ('processes.list.noOwner' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="cf-dt">{{ 'processes.fields.department' | transloco }}</dt>
                <dd class="text-fg">
                  {{ p.department?.name || ('processes.detail.notSet' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="cf-dt">{{ 'processes.fields.parent' | transloco }}</dt>
                <dd>
                  @if (p.parent; as parent) {
                    <a [routerLink]="['/processes', parent.id]" class="text-accent hover:underline">
                      {{ parent.code }} · {{ parent.title }}
                    </a>
                  } @else {
                    <span class="text-fg">{{ 'processes.detail.topLevel' | transloco }}</span>
                  }
                </dd>
              </div>
              <div>
                <dt class="cf-dt">{{ 'processes.detail.children' | transloco }}</dt>
                <dd class="flex flex-col gap-0.5">
                  @for (child of p.children; track child.id) {
                    <a [routerLink]="['/processes', child.id]" class="text-accent hover:underline">
                      {{ child.code }} · {{ child.title }}
                    </a>
                  } @empty {
                    <span class="text-fg-subtle">{{
                      'processes.detail.noChildren' | transloco
                    }}</span>
                  }
                </dd>
              </div>
            </dl>
          </app-card>

          <app-card>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="text-[15px] font-bold text-fg">
                  {{ 'processes.detail.map' | transloco }}
                </h2>
                <p class="text-[12.5px] text-fg-muted">
                  {{
                    'processes.detail.mapSummary'
                      | transloco
                        : {
                            steps: map().nodes.length,
                            lanes: map().lanes.length,
                            version: p.map_version,
                          }
                  }}
                </p>
              </div>
              <a [routerLink]="['/processes', p.id, 'map']">
                <app-button size="sm" [variant]="map().nodes.length ? 'secondary' : 'primary'">
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
                [selectedId]="selectedStep()?.id ?? null"
                maxHeight="420px"
                (nodeSelected)="selectStep($event)"
                (backgroundClicked)="selectedStepId.set(null)"
              />
              @if (selectedStep(); as step) {
                <div
                  class="mt-3 rounded-[10px] bg-surface-2 p-3 text-[13px]"
                  data-testid="step-info"
                >
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
              <p class="text-[13px] text-fg-muted">{{ 'processes.detail.noMap' | transloco }}</p>
            }
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-[15px] font-bold text-fg">
                {{ 'processes.turtle.title' | transloco }}
              </h2>
              <app-teach-me
                topic="processes.turtle"
                [subject]="'processes.turtle.title' | transloco"
              />
            </div>
            <app-field-help scope="processes" page="detail" field="turtle" />
            @if (turtle(); as t) {
              <app-turtle-diagram class="mt-2" [turtle]="t" />
            } @else if (turtleError()) {
              <app-alert tone="error">{{ 'processes.turtle.failed' | transloco }}</app-alert>
            } @else {
              <p class="text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
            }
          </app-card>

          <app-description-document-panel [process]="p" (changed)="onChanged($event)" />
          <app-interactions-panel [process]="p" (changed)="reload()" />
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

        <ng-container ngProjectAs="[aside]">
          <app-card>
            <h2 class="mb-2 text-[14px] font-bold text-fg">
              {{ 'processes.review.title' | transloco }}
            </h2>
            <app-field-help scope="processes" page="detail" field="review" />
            <dl class="mt-2 flex flex-col gap-2 text-[13px]">
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">{{ 'processes.fields.reviewInterval' | transloco }}</dt>
                <dd class="text-fg">
                  @if (p.review_interval_months) {
                    {{
                      pluralKey('processes.review.months', p.review_interval_months)
                        | transloco: { count: p.review_interval_months }
                    }}
                  } @else {
                    —
                  }
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">{{ 'processes.fields.nextReview' | transloco }}</dt>
                <dd [class.text-fail]="p.review_overdue" [class.font-semibold]="p.review_overdue">
                  {{ p.next_review_at ? (p.next_review_at | localDay) : '—' }}
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">{{ 'processes.fields.lastReviewed' | transloco }}</dt>
                <dd class="text-right text-fg">
                  {{ p.last_reviewed_at ? (p.last_reviewed_at | localDay) : '—' }}
                  @if (p.last_reviewed_by?.name) {
                    <span class="block text-[12px] text-fg-subtle">{{
                      p.last_reviewed_by?.name
                    }}</span>
                  }
                </dd>
              </div>
            </dl>
            @if (p.status === 'active' && !p.owner) {
              <p class="mt-2 text-[12px] text-warn">
                {{ 'processes.review.noOwnerHint' | transloco }}
              </p>
            }
          </app-card>
          <app-supports-requirements [entityType]="entityType" [entityId]="p.id" />
        </ng-container>
      </app-record-detail-layout>
    } @else if (loadError(); as err) {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-alert tone="error">{{ err | transloco }}</app-alert>
        <a routerLink="/processes" class="mt-3 inline-block text-[13px] font-semibold text-accent">
          {{ 'processes.detail.back' | transloco }}
        </a>
      </div>
    } @else {
      <p class="mx-auto max-w-[1180px] px-4 pt-6 text-[14px] text-fg-muted sm:px-8">
        {{ 'common.loading' | transloco }}
      </p>
    }

    <app-slide-over
      [open]="reviewOpen()"
      [title]="'processes.review.recordTitle' | transloco"
      [subtitle]="'processes.review.recordSubtitle' | transloco"
      [closeLabel]="'processes.actions.close' | transloco"
      (closed)="reviewOpen.set(false)"
    >
      <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); recordReview()">
        <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
          {{ 'processes.review.notes' | transloco }}
          <textarea
            class="cf-review"
            rows="5"
            maxlength="2000"
            [placeholder]="'processes.review.notesPlaceholder' | transloco"
            [value]="reviewNotes()"
            (input)="reviewNotes.set($any($event.target).value)"
            data-testid="review-notes"
          ></textarea>
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
          {{ 'processes.review.nextDate' | transloco }}
          <input
            class="cf-review"
            type="date"
            [value]="reviewNext()"
            (input)="reviewNext.set($any($event.target).value)"
          />
          <span class="font-normal text-fg-subtle">{{
            'processes.review.nextDateHint' | transloco
          }}</span>
        </label>
        <div>
          <app-button
            type="submit"
            [loading]="busy()"
            [disabled]="busy()"
            data-testid="review-submit"
          >
            {{ 'processes.review.submit' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>

    <app-prompt-dialog
      [open]="pendingStatus() !== null"
      [title]="'processes.statusActions.confirmTitle' | transloco: { status: pendingStatusLabel() }"
      [message]="'processes.statusActions.message.' + (pendingStatus() ?? 'active') | transloco"
      [label]="'processes.fields.changeReason' | transloco"
      [maxLength]="1000"
      [busy]="busy()"
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
  styles: [
    `
      .cf-dt {
        font-size: 12px;
        font-weight: 600;
        color: var(--fg-muted);
        margin-bottom: 2px;
      }
      .cf-review {
        border-radius: 9px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        font-weight: 400;
        padding: 8px 10px;
        outline: none;
      }
      .cf-review:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class ProcessDetailPage {
  private readonly api = inject(ProcessesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly askPanel = inject(AskPanelService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly entityType = PROCESS_ENTITY_TYPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = PROCESS_FIELD_LABELS;
  protected readonly statusKey = statusKey;
  protected readonly statusTone = statusTone;
  protected readonly categoryKey = categoryKey;
  protected readonly categoryTone = categoryTone;
  protected readonly nodeTypeKey = nodeTypeKey;
  protected readonly pluralKey = pluralKey;

  protected readonly process = signal<ProcessDetail | null>(null);
  protected readonly turtle = signal<Turtle | null>(null);
  protected readonly turtleError = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly reviewOpen = signal(false);
  protected readonly reviewNotes = signal('');
  protected readonly reviewNext = signal('');
  protected readonly pendingStatus = signal<ProcessStatus | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly selectedStepId = signal<string | null>(null);

  protected readonly map = computed(() => normaliseMap(this.process()?.map));
  protected readonly selectedStep = computed<MapNode | null>(
    () => this.map().nodes.find((n) => n.id === this.selectedStepId()) ?? null,
  );
  protected readonly statusActions = computed(() => {
    const p = this.process();
    return p ? (STATUS_ACTIONS[p.status] ?? []) : [];
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
    this.api.get(orgId, id).subscribe({
      next: (process) => this.process.set(process),
      error: (error) => this.loadError.set(processErrorKey(error)),
    });
    this.loadTurtle(orgId, id);
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

  protected onChanged(updated: ProcessDetail): void {
    this.process.set(updated);
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.loadTurtle(orgId, updated.id);
    }
  }

  protected selectStep(id: string): void {
    this.selectedStepId.set(this.selectedStepId() === id ? null : id);
  }

  protected summarise(): void {
    this.askPanel.askAbout(this.language.translate('processes.ai.summarisePrompt'));
  }

  protected recordReview(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.process();
    if (!orgId || !p || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .recordReview(orgId, p.id, {
        notes: this.reviewNotes().trim() || null,
        next_review_at: dateInputToIso(this.reviewNext()),
      })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.reviewOpen.set(false);
          this.reviewNotes.set('');
          this.reviewNext.set('');
          this.process.set(updated);
          this.notifications.success('processes.notices.reviewed');
        },
        error: (error) => this.fail(error),
      });
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
