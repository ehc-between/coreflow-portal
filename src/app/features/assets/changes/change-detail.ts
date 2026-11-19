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
  StatusLineTone,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { WorkflowPanel } from '../../../shared/records/workflow-panel';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  changeTypeBadge,
  levelBadge,
  missingStepFields,
  stateCategoryBadge,
} from '../data/asset-display';
import { assetErrorMessage } from '../data/asset-errors';
import { CHANGE_STATES, ChangeDetail, UpdateChangeRequest } from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { ChangeStep } from './change-step';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
  'tasks',
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

/** The follow-ups that are a to-do (a failed change), not just an offer. */
const URGENT_FOLLOW_UPS = new Set(['change_request.to_deviation', 'change_request.to_risk']);

/** The status sentence of a change: i18n key under `assets.changeDetail.statusLine`. */
export interface ChangeStatusLine {
  readonly key: string;
  readonly tone: StatusLineTone;
}

/**
 * Where the change stands, in plain words (docs/ux-guide.md §2.7). Waiting for approval
 * wins; a failed or rolled-back change that is closed is a to-do, not a success. A state
 * of a customised workflow falls back to its own label (`other`).
 */
export function changeStatusLine(c: ChangeDetail): ChangeStatusLine {
  const line = (key: string, tone: StatusLineTone): ChangeStatusLine => ({
    key: `assets.changeDetail.statusLine.${key}`,
    tone,
  });
  if (c.pending_approval && !c.closed) {
    return line('pendingApproval', 'warn');
  }
  switch (c.status) {
    case 'draft':
      return line('draft', 'neutral');
    case 'assessment':
      return line('assessment', 'warn');
    case 'approved':
      return line('approved', 'info');
    case 'implementing':
      return line('implementing', 'info');
    case 'review':
      return line('review', 'warn');
    case 'closed':
      return c.review_outcome === 'failed' || c.review_outcome === 'rolled_back'
        ? line('closedFailed', 'warn')
        : line('closed', 'pass');
    case 'rejected':
    case 'cancelled':
      return line(c.status, 'neutral');
    default:
      return line('other', c.closed ? 'neutral' : 'info');
  }
}

/** The handlers the change page offers its "Oppfølging" lines. */
export interface ChangeMissingHandlers {
  /** Scroll to "Det neste steg trenger", or null when the caller cannot fill it in. */
  readonly step: (() => void) | null;
  /** Scroll to the workflow (approve / reject a pending approval). */
  readonly approval: (() => void) | null;
  /** Start a create-from-here flow, or null when it is not available. */
  readonly flow: (key: string) => (() => void) | null;
}

/**
 * What the change still needs ("Oppfølging"): the fields its next step requires, an
 * owner, and for a failed change the deviation and risk to register.
 */
export function changeMissing(
  c: ChangeDetail,
  editLink: readonly unknown[] | null,
  handlers: ChangeMissingHandlers,
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (c.pending_approval && !c.closed && handlers.approval) {
    items.push({
      key: 'approval',
      labelKey: 'assets.changeDetail.missing.approval',
      action: handlers.approval,
    });
  }
  const step = missingStepFields(c);
  if (step.length && handlers.step) {
    items.push({
      key: 'step',
      labelKey:
        step.length === 1
          ? 'assets.changeDetail.missing.stepOne'
          : 'assets.changeDetail.missing.step',
      params: { count: step.length },
      action: handlers.step,
    });
  }
  if (!c.owner && editLink && !c.closed) {
    items.push({ key: 'owner', labelKey: 'assets.changeDetail.missing.owner', link: editLink });
  }
  for (const f of changeFollowUps(c)) {
    const run = URGENT_FOLLOW_UPS.has(f.key) ? handlers.flow(f.key) : null;
    if (run) {
      items.push({ key: f.key, labelKey: f.labelKey, action: run });
    }
  }
  return items;
}

/**
 * A change request (`/assets/changes/:id`) on the detail-page anatomy (docs/ux-guide.md
 * §2.7). Hovedinformasjon: where the change stands in plain words, what changes, why,
 * the risk (level and what it affects) and the assets it touches (linked). The workflow
 * (state, the steps the caller may take, approvals with segregation of duties) sits next
 * to it; "Det neste steg trenger" (the fields the next step requires, editable in place)
 * opens the Details tab, followed by the plans, the implementation and evaluation. The
 * Oppfølging card lists what is missing (with a failed change's deviation and risk), the
 * requirements the change documents (ISO 27001 A.8.32, ISO 9001 6.3 / 8.5.6), its
 * connections, the follow-ups the stage calls for (update documents, train people) and
 * who owns and requested it.
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
    ChangeStep,
    ConfirmDialog,
    EntityChip,
    EntityTasks,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
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
          @let line = statusLine();
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
              @if (c.change_type === 'emergency') {
                <app-status-badge
                  [meaning]="typeBadge(c.change_type).meaning"
                  [value]="typeBadge(c.change_type).value"
                  [labelKey]="'assets.changeTypeShort.' + c.change_type"
                />
              }
            </ng-container>

            @if (canWrite() && !c.closed) {
              <app-button primary data-testid="change-edit" (click)="edit(c)">
                {{ 'assets.common.edit' | transloco }}
              </app-button>
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

            <button appMenuItem ask type="button" (click)="askSummary()">
              <app-icon name="spark" [size]="15" />
              {{ 'assets.ai.summariseChange' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAssessment()">
              <app-icon name="spark" [size]="15" />
              {{ 'assets.ai.reviewAssessment' | transloco }}
            </button>

            <app-help-strip
              help
              scope="assets"
              page="change"
              lesson="change-management"
              [subject]="c.title"
            />

            <app-record-lead record-lead [fillLink]="canWrite() && !c.closed ? editLink() : null">
              <app-record-status-line status [tone]="line.tone" data-testid="change-status-line">
                {{ line.key | transloco: { state: stateLabel() } }}
              </app-record-status-line>
              <app-field-item size="lead" labelKey="assets.changeDetail.lead.what" [wide]="true">
                @if (c.description) {
                  <div class="cf-prose" [innerHTML]="c.description | appMarkdown"></div>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="assets.changeDetail.lead.why" [wide]="true">
                @if (c.reason) {
                  <div class="cf-prose" [innerHTML]="c.reason | appMarkdown"></div>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="assets.changeDetail.lead.risk">
                @if (c.risk_level) {
                  <app-status-badge
                    [meaning]="riskBadge(c.risk_level).meaning"
                    [value]="riskBadge(c.risk_level).value"
                    labelKey="assets.changes.riskBadge"
                    [labelParams]="{ level: ('assets.criticality.' + c.risk_level | transloco) }"
                  />
                }
                @if (c.impact_assessment) {
                  <div
                    class="cf-prose mt-1 text-ui"
                    [innerHTML]="c.impact_assessment | appMarkdown"
                  ></div>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="assets.changeDetail.lead.assets">
                @if (c.affected_assets.length) {
                  <ul class="flex flex-col gap-1.5" data-testid="change-assets">
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
                }
              </app-field-item>
            </app-record-lead>

            <div class="flex flex-col gap-8">
              @if (stepNeeded()) {
                <div id="change-step" class="scroll-mt-20">
                  <app-change-step
                    [change]="c"
                    [canWrite]="canWrite()"
                    [busy]="busy()"
                    (saved)="saveStep(c, $event)"
                  />
                </div>
              }

              @if (c.locked_fields.length && !c.closed) {
                <p class="rounded-tile bg-surface-2 px-3 py-2 text-meta text-fg-muted" role="note">
                  <app-icon name="lock" [size]="12" />
                  {{ 'assets.changeDetail.locked' | transloco }}
                </p>
              }

              <app-record-details
                [columns]="2"
                [fillLink]="canWrite() && !c.closed ? editLink() : null"
              >
                <app-field-item labelKey="assets.fields.changeType">
                  {{ 'assets.changeType.' + c.change_type | transloco }}
                </app-field-item>
                <app-field-item labelKey="assets.changeDetail.planned">
                  @if (c.planned_start || c.planned_end) {
                    {{ c.planned_start ? (c.planned_start | localDay) : '…' }}
                    –
                    {{ c.planned_end ? (c.planned_end | localDay) : '…' }}
                  }
                </app-field-item>
                @for (key of planTexts; track key.field) {
                  <app-field-item
                    [labelKey]="'assets.changeDetail.plain.' + key.label"
                    [wide]="true"
                  >
                    @if (c[key.field]; as text) {
                      <div class="cf-prose text-body" [innerHTML]="text | appMarkdown"></div>
                    }
                  </app-field-item>
                }
                @if (showOutcome()) {
                  <app-field-item
                    labelKey="assets.fields.implementedAt"
                    [value]="c.implemented_at ? (c.implemented_at | localDate: 'mediumDate') : null"
                  />
                  <app-field-item labelKey="assets.fields.reviewOutcome">
                    @if (c.review_outcome) {
                      {{ 'assets.reviewOutcome.' + c.review_outcome | transloco }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="assets.fields.reviewNotes" [wide]="true">
                    @if (c.review_notes) {
                      <div
                        class="cf-prose text-body"
                        [innerHTML]="c.review_notes | appMarkdown"
                      ></div>
                    }
                  </app-field-item>
                }
              </app-record-details>
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="change_request"
                [entityId]="c.id"
                [canCreate]="canWrite() && !c.closed"
                [entityLabel]="c.code + ' ' + c.title"
              />
            </div>

            @if (offers().length) {
              <div follow-up-connections class="mt-4" data-testid="change-follow-ups">
                <h3 class="text-meta font-semibold text-fg-muted">
                  {{ 'assets.changeDetail.followUpTitle' | transloco }}
                </h3>
                <ul class="mt-1.5 flex flex-col gap-1.5">
                  @for (f of offers(); track f.key) {
                    <li>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 text-left text-ui font-semibold text-accent hover:underline"
                        [attr.data-flow]="f.key"
                        (click)="startFlow(f.key)"
                      >
                        {{ f.labelKey | transloco }}
                        <span aria-hidden="true">→</span>
                      </button>
                    </li>
                  }
                </ul>
              </div>
            }

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
                labelKey="assets.changeDetail.created"
                [value]="c.created_at | localDate: 'mediumDate'"
              />
              <app-field-item
                layout="inline"
                labelKey="assets.detail.updated"
                [value]="c.updated_at | localDate"
              />
            </app-record-meta>

            <div aside id="change-workflow" class="mt-4 scroll-mt-20">
              <app-workflow-panel
                entityType="change_request"
                [entityId]="c.id"
                [data]="c.data"
                (transitioned)="reload()"
              />
            </div>

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
  protected readonly typeBadge = changeTypeBadge;
  /** The plans and assessments of "Flere detaljer", with plain labels. */
  protected readonly planTexts = [
    { field: 'implementation_plan', label: 'implementationPlan' },
    { field: 'rollback_plan', label: 'rollbackPlan' },
    { field: 'risk_assessment', label: 'riskAssessment' },
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
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/assets/changes',
    this.id(),
    'edit',
  ]);
  protected readonly statusLine = computed(() => {
    const c = this.change();
    return c ? changeStatusLine(c) : { key: '', tone: 'neutral' as const };
  });
  /** The state's own label (for a state of a customised workflow). */
  protected readonly stateLabel = computed(() => {
    const c = this.change();
    if (!c) {
      return '';
    }
    if ((CHANGE_STATES as readonly string[]).includes(c.status)) {
      return this.language.translate(`assets.changeState.${c.status}`);
    }
    const label = c.status_label;
    return typeof label === 'string'
      ? label
      : (label[this.language.active()] ?? label['en'] ?? c.status);
  });
  /** The next step still needs fields filled in ("Det neste steg trenger" is shown). */
  protected readonly stepNeeded = computed(() => {
    const c = this.change();
    return !!c && missingStepFields(c).length > 0;
  });
  protected readonly showOutcome = computed(() => {
    const c = this.change();
    return (
      !!c &&
      (!!c.implemented_at || !!c.review_outcome || c.status === 'review' || c.status === 'closed')
    );
  });
  /** Follow-ups for the stage that the caller can actually start. */
  protected readonly followUps = computed(() => {
    const c = this.change();
    const keys = this.flowKeys();
    return c ? changeFollowUps(c).filter((f) => keys.has(f.key)) : [];
  });
  /** The follow-ups that are offers (the urgent ones are in the missing list). */
  protected readonly offers = computed(() =>
    this.followUps().filter((f) => !URGENT_FOLLOW_UPS.has(f.key)),
  );
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const c = this.change();
    if (!c || !this.canWrite()) {
      return [];
    }
    const keys = this.flowKeys();
    return changeMissing(c, c.closed ? null : this.editLink(), {
      step: c.closed ? null : () => this.scrollTo('change-step'),
      approval: () => this.scrollTo('change-workflow'),
      flow: (key) => (keys.has(key) ? () => this.startFlow(key) : null),
    });
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

  protected edit(c: ChangeDetail): void {
    void this.router.navigate(['/assets/changes', c.id, 'edit']);
  }

  private scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
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
