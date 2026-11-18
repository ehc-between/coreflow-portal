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
import { Subscription, catchError, of } from 'rxjs';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { KitApi } from '../../../core/kit/kit-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { WorkflowPanel } from '../../../shared/records/workflow-panel';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { changeTypeBadge, levelBadge, stateCategoryBadge } from '../data/asset-display';
import { assetErrorMessage } from '../data/asset-errors';
import { ChangeDetail, UpdateChangeRequest } from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { ChangeStep } from './change-step';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> label key (the change request's controlled fields). */
export const CHANGE_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'assets.fields.code',
  title: 'assets.fields.title',
  description: 'assets.fields.description',
  change_type: 'assets.fields.changeType',
  category: 'assets.fields.changeCategory',
  reason: 'assets.fields.reason',
  impact_assessment: 'assets.fields.impactAssessment',
  risk_level: 'assets.fields.riskLevel',
  risk_assessment: 'assets.fields.riskAssessment',
  implementation_plan: 'assets.fields.implementationPlan',
  rollback_plan: 'assets.fields.rollbackPlan',
  planned_start: 'assets.fields.plannedStart',
  planned_end: 'assets.fields.plannedEnd',
  implemented_at: 'assets.fields.implementedAt',
  review_outcome: 'assets.fields.reviewOutcome',
  review_notes: 'assets.fields.reviewNotes',
  owner_user_id: 'assets.fields.owner',
  department_id: 'assets.fields.department',
};

/** A follow-up the change calls for, as a create-from-here flow. */
export interface ChangeFollowUp {
  readonly key: string;
  readonly labelKey: string;
}

/**
 * The follow-ups a change calls for at its stage (ISO 9001 6.3 / 8.5.6): once it is
 * being implemented or reviewed, update the documents and train the people it affects;
 * a failed or rolled-back change becomes a deviation and possibly a risk.
 */
export function changeFollowUps(c: ChangeDetail): readonly ChangeFollowUp[] {
  const out: ChangeFollowUp[] = [];
  if (['implementing', 'review', 'closed'].includes(c.status)) {
    out.push(
      { key: 'change_request.to_document', labelKey: 'assets.changeDetail.followUp.document' },
      { key: 'change_request.to_training', labelKey: 'assets.changeDetail.followUp.training' },
      { key: 'change_request.to_task', labelKey: 'assets.changeDetail.followUp.task' },
    );
  }
  if (c.review_outcome === 'failed' || c.review_outcome === 'rolled_back') {
    out.unshift(
      { key: 'change_request.to_deviation', labelKey: 'assets.changeDetail.followUp.deviation' },
      { key: 'change_request.to_risk', labelKey: 'assets.changeDetail.followUp.risk' },
    );
  }
  return out;
}

/**
 * A change request (`/assets/changes/:id`): the workflow (state, the steps the caller
 * may take, approvals with segregation of duties), what the next step still needs,
 * the follow-ups the stage calls for (update documents, train people, register a
 * deviation for a failed change), the request, the impact and risk assessment with
 * the implementation and rollback plans, the implementation and post-implementation
 * review, the affected assets and the shared record tabs. The aside shows the
 * requirements the change documents (ISO 27001 A.8.32, ISO 9001 6.3 / 8.5.6) and its
 * connections (processes, documents, suppliers and risks it affects).
 */
@Component({
  selector: 'app-change-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    Button,
    Card,
    ChangeStep,
    ConfirmDialog,
    EntityChip,
    EntityTasks,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    RecordDetailLayout,
    StatusBadge,
    WatchButton,
    WhyItMatters,
    WorkflowPanel,
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
            routerLink="/assets/changes"
            class="mb-3 inline-flex items-center gap-1 text-ui font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'assets.common.backToChanges' | transloco }}
          </a>
          <app-error-state
            titleKey="assets.changeDetail.notFoundTitle"
            bodyKey="assets.changeDetail.notFound"
            (retry)="reload()"
          />
        </div>
      }
      @default {
        @if (change(); as c) {
          <app-record-detail-layout
            entityType="change_request"
            [entityId]="c.id"
            [title]="c.title"
            [breadcrumbs]="[
              { labelKey: 'modules.names.assets', link: '/assets' },
              { labelKey: 'assets.changes.title', link: '/assets/changes' },
              { label: c.code },
            ]"
            [tabs]="tabs"
            [counts]="{ tasks: c.open_tasks }"
            [canEdit]="canWrite() && !c.closed"
            [requirementsPanel]="true"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            backLink="/assets/changes"
            backLabelKey="assets.common.backToChanges"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ c.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'assets.changeCategory.' + c.category | transloco }}</span>
              <app-status-badge
                [meaning]="stateBadge(c.status_category).meaning"
                [value]="stateBadge(c.status_category).value"
                [labelKey]="'assets.changeState.' + c.status"
              />
              @if (c.change_type !== 'normal') {
                <app-status-badge
                  [meaning]="typeBadge(c.change_type).meaning"
                  [value]="typeBadge(c.change_type).value"
                  [labelKey]="'assets.changeTypeShort.' + c.change_type"
                />
              }
              @if (c.risk_level) {
                <app-status-badge
                  [meaning]="riskBadge(c.risk_level).meaning"
                  [value]="riskBadge(c.risk_level).value"
                  labelKey="assets.changes.riskBadge"
                  [labelParams]="{ level: ('assets.criticality.' + c.risk_level | transloco) }"
                />
              }
              @if (c.pending_approval) {
                <app-status-badge
                  meaning="lifecycle"
                  value="pending_approval"
                  labelKey="assets.changes.awaitingApproval"
                />
              }
            </ng-container>

            @if (canWrite() && !c.closed) {
              <a
                secondary
                [routerLink]="['/assets/changes', c.id, 'edit']"
                class="inline-flex h-9 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
              >
                {{ 'assets.common.edit' | transloco }}
              </a>
            }
            <app-watch-button secondary entityType="change_request" [entityId]="c.id" />
            @if (!ai.unavailable()) {
              <button appMenuItem overflow type="button" (click)="askSummary()">
                {{ 'assets.ai.summariseChange' | transloco }}
              </button>
            }
            @if (!ai.unavailable()) {
              <button appMenuItem overflow type="button" (click)="askAssessment()">
                {{ 'assets.ai.reviewAssessment' | transloco }}
              </button>
            }
            @if (canManage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="confirmDelete.set(true)"
              >
                {{ 'assets.common.delete' | transloco }}
              </button>
            }

            <app-help-strip
              help
              scope="assets"
              page="change"
              lesson="change-management"
              [subject]="c.title"
            />

            <div class="flex flex-col gap-5">
              <app-change-step
                [change]="c"
                [canWrite]="canWrite()"
                [busy]="busy()"
                (saved)="saveStep(c, $event)"
              />

              <app-workflow-panel
                entityType="change_request"
                [entityId]="c.id"
                [data]="c.data"
                (transitioned)="reload()"
              />

              @if (followUps().length) {
                <app-card>
                  <div data-testid="change-follow-ups">
                    <h2 class="mb-1 font-display text-card font-bold text-fg">
                      {{ 'assets.changeDetail.followUpTitle' | transloco }}
                    </h2>
                    <p class="mb-3 text-ui text-fg-muted">
                      {{ 'assets.changeDetail.followUpBody' | transloco }}
                    </p>
                    <div class="flex flex-wrap gap-2">
                      @for (f of followUps(); track f.key) {
                        <app-button
                          size="sm"
                          variant="secondary"
                          [attr.data-flow]="f.key"
                          (click)="startFlow(f.key)"
                        >
                          {{ f.labelKey | transloco }}
                        </app-button>
                      }
                    </div>
                  </div>
                </app-card>
              }

              @if (c.locked_fields.length && !c.closed) {
                <p class="rounded-tile bg-surface-2 px-3 py-2 text-meta text-fg-muted" role="note">
                  <app-icon name="lock" [size]="12" />
                  {{ 'assets.changeDetail.locked' | transloco }}
                </p>
              }

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'assets.changeForm.sections.request' | transloco }}
                </h2>
                <app-field-list [columns]="2">
                  @for (key of requestTexts; track key.field) {
                    <app-field-item
                      [labelKey]="'assets.fields.' + key.label"
                      [wide]="true"
                      empty="none"
                    >
                      @if (c[key.field]; as text) {
                        <div class="cf-prose text-body" [innerHTML]="text | appMarkdown"></div>
                      }
                    </app-field-item>
                  }
                  <app-field-item labelKey="assets.fields.changeType">
                    {{ 'assets.changeType.' + c.change_type | transloco }}
                  </app-field-item>
                  <app-field-item
                    labelKey="assets.fields.owner"
                    [value]="c.owner?.name"
                    empty="none"
                  />
                  @if (c.requested_by?.name; as name) {
                    <app-field-item
                      labelKey="assets.changeDetail.requestedByLabel"
                      [value]="name"
                    />
                  }
                  <app-field-item labelKey="assets.changeDetail.planned">
                    @if (c.planned_start || c.planned_end) {
                      {{ c.planned_start ? (c.planned_start | localDay) : '…' }}
                      –
                      {{ c.planned_end ? (c.planned_end | localDay) : '…' }}
                    }
                  </app-field-item>
                </app-field-list>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'assets.changeForm.sections.assessment' | transloco }}
                </h2>
                <app-field-list [columns]="2">
                  <app-field-item labelKey="assets.fields.riskLevel">
                    @if (c.risk_level) {
                      {{ 'assets.criticality.' + c.risk_level | transloco }}
                    }
                  </app-field-item>
                  @for (key of assessmentTexts; track key.field) {
                    <app-field-item
                      [labelKey]="'assets.fields.' + key.label"
                      [wide]="true"
                      empty="none"
                    >
                      @if (c[key.field]; as text) {
                        <div class="cf-prose text-body" [innerHTML]="text | appMarkdown"></div>
                      }
                    </app-field-item>
                  }
                </app-field-list>
              </app-card>

              @if (
                c.implemented_at ||
                c.review_outcome ||
                c.status === 'review' ||
                c.status === 'closed'
              ) {
                <app-card>
                  <h2 class="mb-3 font-display text-card font-bold text-fg">
                    {{ 'assets.changeForm.sections.implementation' | transloco }}
                  </h2>
                  <app-field-list [columns]="2">
                    <app-field-item
                      labelKey="assets.fields.implementedAt"
                      [value]="c.implemented_at | localDate: 'mediumDate'"
                    />
                    <app-field-item labelKey="assets.fields.reviewOutcome">
                      @if (c.review_outcome) {
                        {{ 'assets.reviewOutcome.' + c.review_outcome | transloco }}
                      }
                    </app-field-item>
                    @if (c.review_notes) {
                      <app-field-item labelKey="assets.fields.reviewNotes" [wide]="true">
                        <div
                          class="cf-prose text-body"
                          [innerHTML]="c.review_notes | appMarkdown"
                        ></div>
                      </app-field-item>
                    }
                  </app-field-list>
                </app-card>
              }

              <app-card>
                <h2 class="mb-2 font-display text-card font-bold text-fg">
                  {{ 'assets.fields.affectedAssets' | transloco }}
                </h2>
                @if (c.affected_assets.length) {
                  <ul class="flex flex-wrap gap-x-4 gap-y-1.5">
                    @for (a of c.affected_assets; track a.id) {
                      <li>
                        <app-entity-chip
                          [ref]="{
                            entity_type: 'asset',
                            entity_id: a.id,
                            code: a.code,
                            title: a.name,
                            url: a.url,
                          }"
                        />
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-ui text-fg-subtle">
                    {{ 'assets.changeDetail.noAssets' | transloco }}
                  </p>
                }
                <p class="mt-2 text-meta text-fg-subtle">
                  {{ 'assets.changeDetail.assetsHint' | transloco }}
                </p>
              </app-card>

              <app-why-it-matters scope="assets" page="change" />
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="change_request"
                [entityId]="c.id"
                [canCreate]="canWrite() && !c.closed"
                [entityLabel]="c.code + ' ' + c.title"
              />
            </div>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'assets.changeDetail.deleteTitle' | transloco"
            [message]="
              'assets.changeDetail.deleteMessage' | transloco: { code: c.code, title: c.title }
            "
            [confirmLabel]="'assets.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove(c)"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class ChangeDetailPage {
  private readonly api = inject(AssetsApi);
  private readonly kit = inject(KitApi);
  private readonly standards = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly flows = inject(CreateFlowService);
  private readonly router = inject(Router);
  protected readonly ai = inject(AiAvailability);

  readonly id = input.required<string>();

  private readonly panel = viewChild(WorkflowPanel);

  protected readonly tabs = TABS;
  protected readonly fieldLabels = CHANGE_FIELD_LABELS;
  protected readonly riskBadge = levelBadge;
  protected readonly stateBadge = stateCategoryBadge;
  protected readonly typeBadge = changeTypeBadge;
  protected readonly requestTexts = [
    { field: 'description', label: 'description' },
    { field: 'reason', label: 'reason' },
  ] as const;
  protected readonly assessmentTexts = [
    { field: 'impact_assessment', label: 'impactAssessment' },
    { field: 'risk_assessment', label: 'riskAssessment' },
    { field: 'implementation_plan', label: 'implementationPlan' },
    { field: 'rollback_plan', label: 'rollbackPlan' },
  ] as const;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly change = signal<ChangeDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);
  private readonly flowKeys = signal<ReadonlySet<string>>(new Set());
  private readonly requirementRefs = signal<readonly string[]>([]);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes('assets:write'));
  protected readonly canManage = computed(() => this.permissions().includes('assets:manage'));
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));
  /** Follow-ups for the stage that the caller can actually start. */
  protected readonly followUps = computed(() => {
    const c = this.change();
    const keys = this.flowKeys();
    return c ? changeFollowUps(c).filter((f) => keys.has(f.key)) : [];
  });

  private request = new Subscription();
  private related = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.related.unsubscribe();
    });
    providePageContext(() => {
      const c = this.change();
      return {
        module: 'assets',
        entityType: 'change_request',
        entityId: this.id(),
        view: 'detail',
        title: c ? `${c.code} ${c.title}` : null,
        requirements: this.requirementRefs(),
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.load(orgId, id, true);
        this.loadRelated(orgId, id);
      });
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  protected startFlow(key: string): void {
    const c = this.change();
    if (c) {
      void this.flows.start(key, 'change_request', c.id);
    }
  }

  protected askSummary(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.summariseChange'));
  }

  protected askAssessment(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.reviewAssessment'));
  }

  protected saveStep(c: ChangeDetail, patch: UpdateChangeRequest): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.updateChange(orgId, c.id, patch).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.change.set(updated);
        this.panel()?.reload();
        this.notifications.success('assets.changeStep.saved');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const message = assetErrorMessage(err);
        this.notifications.error(message.key, { ...message.params });
      },
    });
  }

  protected remove(c: ChangeDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteChange(orgId, c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('assets.changeDetail.deleted', { code: c.code });
        void this.router.navigate(['/assets/changes']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        const message = assetErrorMessage(err);
        this.notifications.error(message.key, { ...message.params });
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
    }
    this.request = this.api.getChange(orgId, id).subscribe({
      next: (c) => {
        this.change.set(c);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  private loadRelated(orgId: string | null, id: string): void {
    this.related.unsubscribe();
    this.flowKeys.set(new Set());
    this.requirementRefs.set([]);
    if (!orgId) {
      return;
    }
    this.related = new Subscription();
    this.related.add(
      this.kit
        .createFlows(orgId, 'change_request', { entityId: id })
        .pipe(catchError(() => of({ items: [] })))
        .subscribe((res) =>
          this.flowKeys.set(new Set(res.items.filter((f) => f.enabled).map((f) => f.key))),
        ),
    );
    if (this.permissions().includes('standards:read')) {
      this.related.add(
        this.standards
          .listLinks(orgId, { entity_type: 'change_request', entity_id: id })
          .pipe(catchError(() => of([])))
          .subscribe((links) =>
            this.requirementRefs.set(
              links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
            ),
          ),
      );
    }
  }
}
