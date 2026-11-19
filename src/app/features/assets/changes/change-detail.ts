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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { KitApi } from '../../../core/kit/kit-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
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
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { WorkflowPanel } from '../../../shared/records/workflow-panel';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { LinkedRecords } from '../../context/ui/linked-records';
import {
  BadgeSpec,
  levelBadge,
  localizedLabel,
  missingStepFields,
  stateCategoryBadge,
} from '../data/asset-display';
import { assetErrorMessage } from '../data/asset-errors';
import { ChangeDetail, ReviewOutcome, UpdateChangeRequest } from '../data/asset.models';
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

/** The evaluation result as a badge: worked green, partly amber, failed or rolled back red. */
export function outcomeBadge(value: ReviewOutcome): BadgeSpec {
  switch (value) {
    case 'successful':
      return { meaning: 'lifecycle', value: 'passed' };
    case 'partially_successful':
      return { meaning: 'lifecycle', value: 'due' };
    default:
      return { meaning: 'lifecycle', value: 'failed' };
  }
}

/** Workflow states with their own plain-language meaning. */
const MEANING_STATES = new Set([
  'draft',
  'assessment',
  'approved',
  'implementing',
  'review',
  'rejected',
  'cancelled',
]);

/**
 * The status sentence of a change (docs/ux-guide.md §2.7): the meaning key after the
 * dash and the tone. Closed changes say whether they worked; waiting for approval is
 * open work (amber); stopped changes are neutral.
 */
export function changeLeadStatus(c: ChangeDetail): {
  readonly tone: StatusLineTone;
  readonly meaningKey: string;
} {
  const base = 'assets.changeDetail.lead.meaning.';
  if (c.status === 'closed' || (c.closed && c.review_outcome)) {
    const outcome = c.review_outcome ?? 'none';
    return {
      tone: outcome === 'successful' ? 'pass' : outcome === 'none' ? 'neutral' : 'warn',
      meaningKey: base + 'closed.' + outcome,
    };
  }
  if (c.status === 'rejected' || c.status === 'cancelled' || c.closed) {
    return {
      tone: 'neutral',
      meaningKey: base + (MEANING_STATES.has(c.status) ? c.status : 'other'),
    };
  }
  if (c.pending_approval) {
    return { tone: 'warn', meaningKey: base + 'pending' };
  }
  return { tone: 'info', meaningKey: base + (MEANING_STATES.has(c.status) ? c.status : 'other') };
}

/** What a change still needs ("Oppfølging"): the next step's fields, an owner, a way back, follow-ups. */
export function changeMissing(
  c: ChangeDetail,
  editLink: readonly unknown[] | null,
  followUps: readonly ChangeFollowUp[],
  showStep: () => void,
  startFlow: (key: string) => void,
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  const step = editLink ? missingStepFields(c).length : 0;
  if (step > 0) {
    items.push({
      key: 'step',
      labelKey: 'assets.changeDetail.missing.step',
      params: { count: step },
      action: showStep,
    });
  }
  if (editLink && !c.owner) {
    items.push({ key: 'owner', labelKey: 'assets.changeDetail.missing.owner', link: editLink });
  }
  if (
    editLink &&
    !c.rollback_plan?.trim() &&
    (c.risk_level === 'high' || c.risk_level === 'critical') &&
    !c.locked_fields.includes('rollback_plan')
  ) {
    items.push({
      key: 'rollback',
      labelKey: 'assets.changeDetail.missing.rollback',
      link: editLink,
    });
  }
  for (const f of followUps) {
    items.push({ key: f.key, labelKey: f.labelKey, action: () => startFlow(f.key) });
  }
  return items;
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
    Card,
    ChangeStep,
    ConfirmDialog,
    EntityTasks,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    LinkedRecords,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    StatusBadge,
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
            [anatomy]="true"
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
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ c.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'assets.changeCategory.' + c.category | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                [meaning]="stateBadge(c.status_category).meaning"
                [value]="stateBadge(c.status_category).value"
                [labelKey]="'assets.changeState.' + c.status"
              />
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
                primary
                [routerLink]="editLink()"
                class="inline-flex h-9 items-center gap-1.5 rounded-tile bg-accent px-3.5 text-ui font-semibold text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
                data-testid="change-edit"
              >
                {{ 'assets.common.edit' | transloco }}
              </a>
            }
            <button appMenuItem ask type="button" (click)="askSummary()">
              <app-icon name="spark" [size]="15" />
              {{ 'assets.ai.summariseChange' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAssessment()">
              <app-icon name="spark" [size]="15" />
              {{ 'assets.ai.reviewAssessment' | transloco }}
            </button>
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

            <app-record-lead record-lead [fillLink]="canWrite() && !c.closed ? editLink() : null">
              <app-record-status-line status [tone]="lead().tone">
                <span data-testid="change-status-sentence">{{ lead().sentence }}</span>
              </app-record-status-line>
              <app-field-item size="lead" labelKey="assets.changeDetail.lead.what">
                @if (c.description; as text) {
                  <div class="cf-prose" [innerHTML]="text | appMarkdown"></div>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="assets.changeDetail.lead.why">
                @if (c.reason; as text) {
                  <div class="cf-prose" [innerHTML]="text | appMarkdown"></div>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="assets.changeDetail.lead.risk">
                @if (c.risk_level) {
                  <app-status-badge
                    [meaning]="riskBadge(c.risk_level).meaning"
                    [value]="riskBadge(c.risk_level).value"
                    [labelKey]="'assets.criticality.' + c.risk_level"
                  />
                  <span class="mt-1 block text-meta text-fg-muted">{{
                    'assets.changeType.' + c.change_type | transloco
                  }}</span>
                }
              </app-field-item>
              @if (c.review_outcome) {
                <app-field-item size="lead" labelKey="assets.changeDetail.lead.outcome">
                  <app-status-badge
                    [meaning]="outcomeBadge(c.review_outcome).meaning"
                    [value]="outcomeBadge(c.review_outcome).value"
                    [labelKey]="'assets.reviewOutcome.' + c.review_outcome"
                  />
                  @if (c.implemented_at) {
                    <span class="mt-1 block text-meta text-fg-muted">{{
                      'assets.changeDetail.lead.implementedOn'
                        | transloco: { date: (c.implemented_at | localDay) }
                    }}</span>
                  }
                </app-field-item>
              } @else {
                <app-field-item size="lead" labelKey="assets.changeDetail.lead.when">
                  @if (c.planned_start || c.planned_end) {
                    {{ c.planned_start ? (c.planned_start | localDay) : '…' }}
                    –
                    {{ c.planned_end ? (c.planned_end | localDay) : '…' }}
                  }
                </app-field-item>
              }
            </app-record-lead>

            <div class="flex flex-col gap-5">
              <div id="change-next-step" class="empty:hidden">
                <app-change-step
                  [change]="c"
                  [canWrite]="canWrite()"
                  [busy]="busy()"
                  (saved)="saveStep(c, $event)"
                />
              </div>

              <app-workflow-panel
                entityType="change_request"
                [entityId]="c.id"
                [data]="c.data"
                (transitioned)="reload()"
              />

              @if (c.locked_fields.length && !c.closed) {
                <p class="rounded-tile bg-surface-2 px-3 py-2 text-meta text-fg-muted" role="note">
                  <app-icon name="lock" [size]="12" />
                  {{ 'assets.changeDetail.locked' | transloco }}
                </p>
              }

              <app-card>
                <app-record-details
                  [columns]="2"
                  [fillLink]="canWrite() && !c.closed ? editLink() : null"
                >
                  @for (key of detailTexts; track key.field) {
                    <app-field-item
                      [labelKey]="'assets.changeDetail.fields.' + key.label"
                      [wide]="true"
                    >
                      @if (c[key.field]; as text) {
                        <div class="cf-prose text-body" [innerHTML]="text | appMarkdown"></div>
                      }
                    </app-field-item>
                  }
                  @if (c.review_outcome) {
                    <app-field-item labelKey="assets.changeDetail.lead.when">
                      @if (c.planned_start || c.planned_end) {
                        {{ c.planned_start ? (c.planned_start | localDay) : '…' }}
                        –
                        {{ c.planned_end ? (c.planned_end | localDay) : '…' }}
                      }
                    </app-field-item>
                  } @else {
                    <app-field-item
                      labelKey="assets.fields.implementedAt"
                      [value]="c.implemented_at ? (c.implemented_at | localDay) : null"
                    />
                  }
                  <app-field-item labelKey="assets.fields.reviewNotes" [wide]="true">
                    @if (c.review_notes; as text) {
                      <div class="cf-prose text-body" [innerHTML]="text | appMarkdown"></div>
                    }
                  </app-field-item>
                </app-record-details>
              </app-card>

              <app-card data-testid="change-assets">
                <h2 class="font-display text-card font-bold text-fg">
                  {{ 'assets.fields.affectedAssets' | transloco }}
                </h2>
                <p class="mt-1 mb-3 text-meta text-fg-muted">
                  {{ 'assets.changeDetail.assetsHint' | transloco }}
                </p>
                @if (assetRefs().length) {
                  <app-context-linked-records [refs]="assetRefs()" />
                } @else {
                  <p class="text-ui text-fg-subtle">
                    {{ 'assets.changeDetail.noAssets' | transloco }}
                  </p>
                }
              </app-card>
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="change_request"
                [entityId]="c.id"
                [canCreate]="canWrite() && !c.closed"
                [entityLabel]="c.code + ' ' + c.title"
              />
            </div>

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="assets.fields.owner"
                [value]="c.owner?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="assets.changeDetail.requestedByLabel"
                [value]="c.requested_by?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="assets.changeDetail.lead.updated"
                [value]="c.updated_at | localDate"
              />
            </app-record-meta>

            <div aside-learn>
              <app-why-it-matters scope="assets" page="change" />
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

  readonly id = input.required<string>();

  private readonly panel = viewChild(WorkflowPanel);

  protected readonly tabs = TABS;
  protected readonly fieldLabels = CHANGE_FIELD_LABELS;
  protected readonly riskBadge = levelBadge;
  protected readonly stateBadge = stateCategoryBadge;
  protected readonly outcomeBadge = outcomeBadge;
  /** The assessment and plans, under "Hovedinformasjon" (plain labels). */
  protected readonly detailTexts = [
    { field: 'impact_assessment', label: 'impact' },
    { field: 'risk_assessment', label: 'risk' },
    { field: 'implementation_plan', label: 'plan' },
    { field: 'rollback_plan', label: 'rollback' },
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

  protected readonly editLink = computed(() => ['/assets/changes', this.id(), 'edit']);
  /** "Godkjent – klar til å gjennomføres." */
  protected readonly lead = computed(() => {
    const c = this.change();
    if (!c) {
      return { tone: 'neutral' as StatusLineTone, sentence: '' };
    }
    const status = changeLeadStatus(c);
    const key = 'assets.changeState.' + c.status;
    const translated = this.language.translate(key);
    const word =
      translated && translated !== key
        ? translated
        : localizedLabel(c.status_label, this.language.active()) || c.status;
    return {
      tone: status.tone,
      sentence: this.language.translate('assets.changeDetail.lead.sentence', {
        status: word,
        meaning: this.language.translate(status.meaningKey),
      }),
    };
  });
  protected readonly missing = computed(() => {
    const c = this.change();
    return c
      ? changeMissing(
          c,
          this.canWrite() && !c.closed ? this.editLink() : null,
          this.followUps(),
          () =>
            document
              .getElementById('change-next-step')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
          (key) => this.startFlow(key),
        )
      : [];
  });
  /** The affected assets as connection rows. */
  protected readonly assetRefs = computed(() =>
    (this.change()?.affected_assets ?? []).map((a) => ({
      entity_type: 'asset',
      entity_id: a.id,
      code: a.code,
      title: a.name,
      url: a.url,
    })),
  );

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
