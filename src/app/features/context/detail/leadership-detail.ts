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
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { GuidanceService } from '../../../core/guidance/guidance.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RequirementLink } from '../../../core/standards/standards.models';
import { AskPanelService } from '../../ask/ask-panel.service';
import { Term } from '../../../shared/guidance/term';
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
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContextApi } from '../data/context-api';
import {
  ContextRecord,
  ControlledFields,
  ControlledStatus,
  LifecycleAction,
  Policy,
  Responsibility,
  ScopeExclusion,
  ScopeStatement,
} from '../data/context.models';
import {
  KINDS,
  asKind,
  contextErrorKey,
  isPastDay,
  lifecycleActions,
  statusBadge,
  withoutTitleHeading,
} from '../context-kinds';
import { CONTEXT_ROOT_CRUMB } from '../context-nav';
import { injectContextPermissions } from '../context-permissions';
import { LinkedRecords } from '../ui/linked-records';
import { RaciChips } from '../ui/raci-chips';
import { CommunicatePanel } from './communicate-panel';
import { FIELD_LABELS, HeaderAction, lifecycleBody, placeActions } from './context-detail';
import {
  CONTROLLED_TONE,
  LeadershipKind,
  leadershipMissing,
  raciStatus,
} from './leadership-missing';
import { PolicyPanels } from './policy-panels';
import { exclusionFramework, exclusionNumber } from './record-body';

type PromptAction = Exclude<LifecycleAction, 'submit'>;

/** Glossary key that explains each kind (the meta line). */
const TERM_KEYS: Readonly<Record<LeadershipKind, string>> = {
  scope: 'scope',
  policy: 'policy',
  responsibility: 'raci',
};

/** Prompt dialog behaviour per step (the reason is required only to return). */
const PROMPTS: Readonly<
  Record<PromptAction, { required: boolean; variant: 'primary' | 'danger' }>
> = {
  approve: { required: false, variant: 'primary' },
  return: { required: true, variant: 'primary' },
  review: { required: false, variant: 'primary' },
  retire: { required: false, variant: 'danger' },
};

/**
 * The detail page of a scope, a policy or a responsibility (RACI)
 * (`/context/{scopes,policies,responsibilities}/:id`) on the detail-page anatomy
 * (docs/ux-guide.md §2.7): one calm meta line; "Hovedinformasjon" with what the
 * record says (scope: what it covers, products and services, boundaries and the
 * requirements that do not apply; policy: the policy text and who has read it;
 * RACI: who does what and what the duty is); the other fields with the empty
 * ones hidden; one "Oppfølging" card with what is missing, the requirements, the
 * connections and a compact metadata block (owner, approval, version, review).
 */
@Component({
  selector: 'app-context-leadership-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    Term,
    WhyItMatters,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    SupportsRequirements,
    EntityTasks,
    Button,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PromptDialog,
    StatusBadge,
    LinkedRecords,
    RaciChips,
    CommunicatePanel,
    PolicyPanels,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-error-state
            titleKey="context.detail.notFoundTitle"
            bodyKey="context.detail.notFound"
            (retry)="reload()"
          />
        </div>
      }
      @case ('ready') {
        @if (record(); as r) {
          @let status = statusOf(r);
          <app-record-detail-layout
            [anatomy]="true"
            [entityType]="cfg().entityType"
            [entityId]="r.id"
            [title]="title()"
            [breadcrumbs]="breadcrumbs()"
            [tabs]="tabs"
            [canEdit]="r.can_edit"
            [fieldLabels]="fieldLabels"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ r.code }}</span>
              <span aria-hidden="true">·</span>
              <app-term [key]="termKey()" scope="context">{{
                'context.kinds.' + kind() + '.one' | transloco
              }}</app-term>
              <span aria-hidden="true">·</span>
              <app-status-badge
                [meaning]="status.meaning"
                [value]="status.value"
                [labelKey]="status.labelKey"
              />
              @if (reviewOverdue()) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="context.detail.reviewOverdue"
                />
              }
            </ng-container>

            @if (placed().primary; as action) {
              <app-button
                primary
                [loading]="busy() === action"
                [disabled]="!!busy()"
                (click)="run(action)"
                [attr.data-testid]="'context-' + action"
              >
                @if (action === 'communicate') {
                  <app-icon name="send" [size]="14" />
                }
                {{ actionLabel(action) | transloco }}
              </app-button>
            }
            @for (action of placed().secondary; track action) {
              <app-button
                secondary
                variant="secondary"
                [disabled]="!!busy()"
                (click)="run(action)"
                [attr.data-testid]="'context-' + action"
              >
                {{ actionLabel(action) | transloco }}
              </app-button>
            }
            @for (action of placed().overflow; track action) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="action === 'retire'"
                [disabled]="!!busy()"
                (click)="run(action)"
                [attr.data-testid]="'context-' + action"
              >
                {{ actionLabel(action) | transloco }}
              </button>
            }
            @if (perms.canManage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                [disabled]="!!busy()"
                (click)="deleteOpen.set(true)"
                data-testid="context-delete"
              >
                {{ 'context.actions.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAi('summarise')">
              <app-icon name="spark" [size]="15" />
              {{ 'context.ai.summarise' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('improve')">
              <app-icon name="spark" [size]="15" />
              {{ 'context.ai.improve.' + kind() | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('explain')">
              <app-icon name="spark" [size]="15" />
              {{ 'context.ai.explain' | transloco }}
            </button>

            <app-help-strip
              help
              scope="context"
              [page]="cfg().guidance + '-detail'"
              [lesson]="cfg().lesson"
              [subject]="title()"
            />

            <!-- One root node per @if, so each part reaches its slot of the layout. -->
            @if (scope(); as s) {
              <app-record-lead record-lead [fillLink]="fillLink()" [columns]="1">
                <app-record-status-line status [tone]="statusTone()">
                  {{
                    'context.leadDetail.status.scope.' + s.status
                      | transloco: { framework: frameworkName(s.framework) }
                  }}
                </app-record-status-line>
                <app-field-item size="lead" labelKey="context.leadDetail.scope.statement">
                  @if (statementOf(s)) {
                    <div
                      class="cf-prose text-fg"
                      style="font-size: inherit; line-height: inherit"
                      [innerHTML]="statementOf(s) | appMarkdown"
                    ></div>
                  }
                </app-field-item>
                <app-field-item
                  size="lead"
                  labelKey="context.leadDetail.scope.productsServices"
                  [value]="s.products_services"
                  [multiline]="true"
                />
                <app-field-item
                  size="lead"
                  labelKey="context.leadDetail.scope.boundaries"
                  [value]="s.boundaries"
                  [multiline]="true"
                />
                <app-field-item
                  size="lead"
                  labelKey="context.leadDetail.scope.exclusions"
                  [keepEmpty]="true"
                >
                  @if (s.exclusions.length) {
                    <ul class="mt-1 flex flex-col gap-2" data-testid="scope-exclusions">
                      @for (exclusion of s.exclusions; track exclusion.clause) {
                        <li class="rounded-tile border border-border bg-surface-2/40 p-3">
                          <span class="text-ui font-semibold text-fg">{{
                            exclusionLabel(exclusion, s.framework)
                          }}</span>
                          <p class="mt-0.5 text-ui whitespace-pre-line text-fg-muted">
                            {{ exclusion.justification }}
                          </p>
                        </li>
                      }
                    </ul>
                    <p class="mt-1.5 text-meta text-fg-muted">
                      {{ 'context.scope.exclusionsHint' | transloco }}
                    </p>
                  } @else {
                    <span class="text-ui text-fg-muted">{{
                      'context.leadDetail.scope.noExclusions' | transloco
                    }}</span>
                  }
                </app-field-item>
              </app-record-lead>
            }
            @if (scope(); as s) {
              <app-record-details [columns]="2" [fillLink]="fillLink()">
                <app-field-item
                  labelKey="context.leadDetail.scope.framework"
                  [value]="frameworkName(s.framework)"
                />
                <app-field-item labelKey="context.fields.sites" [value]="s.sites.join(', ')" />
                <app-field-item labelKey="context.fields.processes" [wide]="true">
                  @if (s.processes?.length) {
                    <app-context-linked-records class="mt-1" [refs]="s.processes!" />
                  }
                </app-field-item>
              </app-record-details>
            }
            @if (policy(); as p) {
              <app-record-lead record-lead [fillLink]="fillLink()" [columns]="1">
                <app-record-status-line status [tone]="statusTone()">
                  {{ 'context.leadDetail.status.policy.' + p.status | transloco }}
                </app-record-status-line>
                <app-field-item size="lead" labelKey="context.leadDetail.policy.statement">
                  @if (statementOf(p)) {
                    <div
                      class="cf-prose text-fg"
                      style="font-size: inherit; line-height: inherit"
                      [innerHTML]="statementOf(p) | appMarkdown"
                    ></div>
                  }
                </app-field-item>
                @if (p.status === 'approved') {
                  <app-field-item
                    size="lead"
                    labelKey="context.leadDetail.policy.acknowledged"
                    [keepEmpty]="true"
                  >
                    <app-context-policy-panels
                      part="acknowledgements"
                      [plain]="true"
                      [policy]="p"
                      [canEdit]="p.can_edit"
                      [canWrite]="perms.canWrite()"
                      (communicate)="communicateOpen.set(true)"
                    />
                  </app-field-item>
                }
              </app-record-lead>
            }
            @if (policy(); as p) {
              <app-record-details [columns]="3" [fillLink]="fillLink()">
                <app-field-item
                  labelKey="context.leadDetail.policy.kind"
                  [value]="'context.policyKinds.' + p.kind | transloco"
                />
                <app-field-item
                  labelKey="context.leadDetail.policy.frameworks"
                  [value]="frameworkNames(p.frameworks)"
                />
                <app-field-item
                  labelKey="context.leadDetail.policy.available"
                  [value]="
                    (p.available_to_interested_parties
                      ? 'context.policy.available'
                      : 'context.policy.internalOnly'
                    ) | transloco
                  "
                />
                <div after class="mt-6">
                  <h3 class="mb-3 font-display text-card font-bold text-fg">
                    {{ 'context.leadDetail.policy.links' | transloco }}
                  </h3>
                  <app-context-policy-panels
                    part="links"
                    [policy]="p"
                    [canEdit]="p.can_edit"
                    [canWrite]="perms.canWrite()"
                    (changed)="record.set($event)"
                  />
                </div>
              </app-record-details>
            }
            @if (raci(); as a) {
              <app-record-lead record-lead [fillLink]="fillLink()">
                <app-record-status-line status [tone]="raciState().tone">
                  {{ raciState().key | transloco }}
                </app-record-status-line>
                <app-field-item
                  size="lead"
                  labelKey="context.leadDetail.raci.assignments"
                  [wide]="true"
                  [keepEmpty]="true"
                >
                  <app-context-raci-chips class="mt-1 block" [assignments]="a.assignments" />
                  @if (beginner()) {
                    <p class="mt-2 text-meta font-normal text-fg-muted">
                      <app-term key="raci" scope="context">{{
                        'context.raci.termLabel' | transloco
                      }}</app-term
                      >:
                      {{ 'context.raci.legend' | transloco }}
                    </p>
                  }
                </app-field-item>
                <app-field-item
                  size="lead"
                  labelKey="context.leadDetail.raci.description"
                  [value]="a.description"
                  [multiline]="true"
                />
                <app-field-item
                  size="lead"
                  labelKey="context.leadDetail.raci.authorities"
                  [value]="a.authorities"
                  [multiline]="true"
                />
              </app-record-lead>
            }
            @if (raci(); as a) {
              <app-record-details [columns]="2" [fillLink]="fillLink()">
                <app-field-item labelKey="context.leadDetail.raci.process">
                  @if (a.process) {
                    <app-context-linked-records class="mt-1" [refs]="[a.process]" />
                  }
                </app-field-item>
                <app-field-item labelKey="context.leadDetail.raci.area" [value]="a.area" />
                <app-field-item
                  labelKey="context.leadDetail.policy.frameworks"
                  [value]="frameworkNames(a.frameworks)"
                />
              </app-record-details>
            }

            <div tasks>
              <app-entity-tasks
                [entityType]="cfg().entityType"
                [entityId]="r.id"
                [canCreate]="canCreateTasks()"
                [entityLabel]="r.code + ' ' + title()"
              />
            </div>

            <app-supports-requirements
              aside-requirements
              [entityType]="cfg().entityType"
              [entityId]="r.id"
              [canEdit]="r.can_edit"
              [frameworks]="frameworks()"
              (linksChange)="onLinks($event)"
            />

            @if (publishedDocument(); as documentId) {
              <a
                follow-up-connections
                [routerLink]="['/documents', documentId]"
                class="mt-3 flex items-center gap-2.5 rounded-tile border border-border bg-surface py-1.5 pr-2 pl-2.5 text-ui hover:border-border-strong"
                data-testid="published-document"
              >
                <span
                  class="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface-2 text-fg-muted"
                  aria-hidden="true"
                >
                  <app-icon name="documents" [size]="15" />
                </span>
                <span class="flex min-w-0 flex-col">
                  <span class="text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase">
                    {{ 'context.policyDocs.documentLabel' | transloco }}
                  </span>
                  <span class="font-medium text-accent hover:underline">
                    {{ 'context.policyDocs.openDocument' | transloco }} →
                  </span>
                </span>
              </a>
            }

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                [labelKey]="
                  kind() === 'responsibility'
                    ? 'context.fields.maintainedBy'
                    : 'context.fields.owner'
                "
                [value]="r.owner?.name"
              />
              @if (controlled(); as c) {
                <app-field-item layout="inline" labelKey="context.detail.approved">
                  @if (c.approved_at) {
                    <span
                      [title]="
                        c.approver_roles?.length
                          ? ('context.detail.approverRoles'
                            | transloco: { roles: c.approver_roles!.join(', ') })
                          : ''
                      "
                      data-testid="approved-by"
                    >
                      {{
                        'context.detail.byOn'
                          | transloco
                            : {
                                name: c.approved_by?.name || ('context.common.unknown' | transloco),
                                date: (c.approved_at | localDay),
                              }
                      }}
                    </span>
                  }
                </app-field-item>
                @if (c.submitted_at && c.status === 'in_review') {
                  <app-field-item layout="inline" labelKey="context.detail.submitted">
                    {{
                      'context.detail.byOn'
                        | transloco
                          : {
                              name: c.submitted_by?.name || ('context.common.unknown' | transloco),
                              date: (c.submitted_at | localDay),
                            }
                    }}
                  </app-field-item>
                }
                <app-field-item
                  layout="inline"
                  labelKey="context.fields.version"
                  [value]="c.version_no"
                />
                <app-field-item
                  layout="inline"
                  labelKey="context.fields.lastReviewed"
                  [value]="c.last_reviewed_at | localDay"
                />
              }
              <app-field-item layout="inline" labelKey="context.fields.reviewInterval">
                @if (interval(); as months) {
                  {{ 'context.detail.everyMonths' | transloco: { count: months } }}
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="context.fields.nextReview"
                [keepEmpty]="true"
                emptyKey="kit.detail.meta.notPlanned"
                emptyActionKey="kit.detail.meta.plan"
                [emptyLink]="fillLink()"
              >
                @if (r.next_review_at) {
                  <span [class.text-warn-ink]="reviewOverdue()">{{
                    r.next_review_at | localDay
                  }}</span>
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="context.fields.updated"
                [value]="r.updated_at | localDate"
              />
            </app-record-meta>

            <div aside-learn>
              <app-why-it-matters scope="context" [page]="cfg().guidance + '-detail'" />
            </div>
          </app-record-detail-layout>

          <app-prompt-dialog
            [open]="!!prompt()"
            [title]="'context.lifecycle.' + (prompt() ?? 'approve') + '.title' | transloco"
            [message]="
              'context.lifecycle.' + (prompt() ?? 'approve') + '.message'
                | transloco: { title: title() }
            "
            [label]="'context.lifecycle.' + (prompt() ?? 'approve') + '.label' | transloco"
            [required]="promptRequired()"
            [confirmVariant]="promptVariant()"
            [confirmLabel]="'context.actions.' + (prompt() ?? 'approve') | transloco"
            [cancelLabel]="'context.common.cancel' | transloco"
            [busy]="!!busy()"
            (confirmed)="confirmPrompt($event)"
            (cancelled)="prompt.set(null)"
          />
          <app-confirm-dialog
            [open]="deleteOpen()"
            [title]="'context.delete.title' | transloco: { type: kindLabel() }"
            [message]="'context.delete.message' | transloco: { title: title() }"
            [confirmLabel]="'context.actions.delete' | transloco"
            [cancelLabel]="'context.common.cancel' | transloco"
            [busy]="busy() === 'delete'"
            (confirmed)="remove()"
            (cancelled)="deleteOpen.set(false)"
          />
          @if (kind() === 'policy') {
            <app-context-communicate-panel
              [open]="communicateOpen()"
              [policyId]="r.id"
              [policyTitle]="r.code + ' · ' + title()"
              (closed)="communicateOpen.set(false)"
              (sent)="onCommunicated()"
            />
          }
        }
      }
    }
  `,
})
export class LeadershipDetail {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  protected readonly beginner = inject(GuidanceService).isBeginner;

  /** Route param and data (component input binding). */
  readonly id = input.required<string>();
  readonly contextKind = input<unknown>(undefined);

  protected readonly kind = computed<LeadershipKind>(() => {
    const kind = asKind(this.contextKind());
    return kind === 'policy' || kind === 'responsibility' ? kind : 'scope';
  });
  protected readonly cfg = computed(() => KINDS[this.kind()]);
  protected readonly listPath = computed(() => `/context/${this.cfg().segment}`);
  protected readonly termKey = computed(() => TERM_KEYS[this.kind()]);
  protected readonly perms = injectContextPermissions();
  protected readonly fieldLabels = FIELD_LABELS;
  protected readonly tabs: readonly RecordTab[] = [
    'details',
    'related',
    'activity',
    'comments',
    'attachments',
    'revisions',
    'tasks',
  ];

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly record = signal<ContextRecord | null>(null);
  protected readonly busy = signal<HeaderAction | 'delete' | null>(null);
  protected readonly prompt = signal<PromptAction | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly communicateOpen = signal(false);
  /** Confirmed requirement refs of the record (for the assistant's page context). */
  private readonly confirmedRefs = signal<readonly string[]>([]);

  protected readonly scope = computed(() =>
    this.kind() === 'scope' ? (this.record() as ScopeStatement | null) : null,
  );
  protected readonly policy = computed(() =>
    this.kind() === 'policy' ? (this.record() as Policy | null) : null,
  );
  protected readonly raci = computed(() =>
    this.kind() === 'responsibility' ? (this.record() as Responsibility | null) : null,
  );

  protected readonly title = computed(() => {
    const r = this.record();
    return r ? ('name' in r ? r.name : r.title) : '';
  });
  protected readonly kindLabel = computed(() =>
    this.language.translate(`context.kinds.${this.kind()}.one`),
  );
  protected readonly breadcrumbs = computed(() => [
    CONTEXT_ROOT_CRUMB,
    { labelKey: `context.kinds.${this.kind()}.plural`, link: this.listPath() },
    { label: this.title() },
  ]);
  protected readonly editLink = computed<readonly unknown[]>(() => [
    this.listPath(),
    this.id(),
    'edit',
  ]);
  /** "Fyll ut" / "Planlegg": only when the user may edit the record. */
  protected readonly fillLink = computed(() => {
    const r = this.record();
    return r?.can_edit && r.status !== 'retired' ? this.editLink() : null;
  });

  /** The record's lifecycle fields (scopes and policies). */
  protected readonly controlled = computed<ControlledFields | null>(() => {
    const r = this.record();
    return r && this.cfg().controlled ? (r as unknown as ControlledFields) : null;
  });

  /**
   * The controlled document the record is published as, unless it is already in
   * the policy's own document list (then it would show twice).
   */
  protected readonly publishedDocument = computed(() => {
    const id = this.controlled()?.document_id;
    const policy = this.policy();
    return id && !policy?.documents.some((doc) => doc.entity_id === id) ? id : null;
  });

  protected readonly statusTone = computed<StatusLineTone>(
    () => CONTROLLED_TONE[(this.controlled()?.status ?? 'draft') as ControlledStatus] ?? 'neutral',
  );
  protected readonly raciState = computed(() => {
    const r = this.raci();
    return r ? raciStatus(r) : { key: '', tone: 'neutral' as StatusLineTone };
  });

  /** Framework tags of the record (narrow "Legg til krav"). */
  protected readonly frameworks = computed<readonly string[] | null>(() => {
    const r = this.record() as { frameworks?: readonly string[]; framework?: string | null } | null;
    if (!r) {
      return null;
    }
    if (r.frameworks?.length) {
      return r.frameworks;
    }
    return r.framework ? [r.framework] : null;
  });

  protected readonly interval = computed(
    () =>
      (this.record() as { review_interval_months?: number | null } | null)
        ?.review_interval_months ?? null,
  );

  protected readonly reviewOverdue = computed(() => {
    const r = this.record() as (ContextRecord & { review_overdue?: boolean }) | null;
    if (!r) {
      return false;
    }
    return r.review_overdue ?? isPastDay(r.next_review_at);
  });

  /** Every header action the caller may use on this record now. */
  protected readonly allowed = computed<readonly HeaderAction[]>(() => {
    const r = this.record();
    if (!r) {
      return [];
    }
    const out: HeaderAction[] = [];
    const c = this.controlled();
    if (c) {
      for (const action of lifecycleActions(c.status as ControlledStatus)) {
        const ok =
          action === 'submit'
            ? r.can_edit
            : action === 'retire'
              ? this.perms.canManage()
              : c.can_approve || (action === 'review' && this.perms.canApprove());
        if (ok) {
          out.push(action);
        }
      }
      if (this.kind() === 'policy' && c.status === 'approved' && this.perms.canWrite()) {
        out.push('communicate');
      }
    } else if (r.status === 'active' && this.perms.canWrite()) {
      out.push('review');
    }
    if (r.can_edit && r.status !== 'retired') {
      out.push('edit');
    }
    return out;
  });

  protected readonly placed = computed(() => placeActions(this.allowed(), this.reviewOverdue()));

  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const r = this.record();
    if (!r || !r.can_edit || r.status === 'retired' || r.status === 'archived') {
      return [];
    }
    const allowed = this.allowed();
    return leadershipMissing(this.kind(), r as ScopeStatement | Policy | Responsibility, {
      editLink: this.editLink(),
      reviewOverdue: this.reviewOverdue(),
      review: allowed.includes('review') ? () => this.run('review') : null,
      communicate: allowed.includes('communicate') ? () => this.communicateOpen.set(true) : null,
    });
  });

  protected readonly canCreateTasks = computed(
    () => !!this.selectedOrg.currentOrg()?.permissions.includes('tasks:write'),
  );
  protected readonly promptRequired = computed(() => {
    const p = this.prompt();
    return p ? PROMPTS[p].required : false;
  });
  protected readonly promptVariant = computed(() => {
    const p = this.prompt();
    return p ? PROMPTS[p].variant : 'primary';
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'context',
      entityType: this.cfg().entityType,
      entityId: this.id(),
      view: 'detail',
      title: this.title() || null,
      requirements: this.confirmedRefs().length ? this.confirmedRefs() : null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const kind = this.kind();
      untracked(() => this.load(orgId, kind, id));
    });
  }

  protected statusOf(r: ContextRecord) {
    return statusBadge(r.status);
  }

  protected actionLabel(action: HeaderAction): string {
    if (action === 'review' && !this.cfg().controlled) {
      return 'context.actions.reviewSimple';
    }
    return `context.actions.${action}`;
  }

  protected frameworkName(key: string | null | undefined): string {
    return key ? this.language.translate(`context.frameworks.${key}`) : '';
  }

  protected frameworkNames(keys: readonly string[] | null | undefined): string {
    return (keys ?? []).map((key) => this.frameworkName(key)).join(', ');
  }

  /** The statement without a heading that repeats the title. */
  protected statementOf(r: Policy | ScopeStatement): string {
    return withoutTitleHeading(r.statement, r.title).trim();
  }

  /** "ISO 9001 · 8.3" for an excluded requirement. */
  protected exclusionLabel(exclusion: ScopeExclusion, scopeFramework: string): string {
    const framework = exclusionFramework(exclusion, scopeFramework);
    const name = this.language.translate(`context.frameworks.${framework}`);
    const number = exclusionNumber(exclusion);
    const known = name && name !== `context.frameworks.${framework}`;
    return known ? `${name} · ${number}` : number;
  }

  protected onLinks(links: readonly RequirementLink[]): void {
    this.confirmedRefs.set(
      links.filter((link) => link.status === 'confirmed').map((link) => link.requirement_ref),
    );
  }

  protected run(action: HeaderAction): void {
    const r = this.record();
    if (!r || this.busy()) {
      return;
    }
    switch (action) {
      case 'edit':
        void this.router.navigate(this.editLink());
        return;
      case 'communicate':
        this.communicateOpen.set(true);
        return;
      case 'submit':
        this.transition('submit', {});
        return;
      default:
        this.prompt.set(action);
    }
  }

  protected confirmPrompt(text: string): void {
    const action = this.prompt();
    if (!action) {
      return;
    }
    this.transition(action, lifecycleBody(action, text));
  }

  protected onCommunicated(): void {
    this.communicateOpen.set(false);
    this.reload();
  }

  protected askAi(kind: 'summarise' | 'improve' | 'explain'): void {
    const r = this.record();
    if (!r) {
      return;
    }
    const key =
      kind === 'improve'
        ? `context.ai.prompts.improve.${this.kind()}`
        : `context.ai.prompts.${kind}`;
    this.ask.askAbout(
      this.language.translate(key, { code: r.code, title: this.title(), type: this.kindLabel() }),
      undefined,
      { requirements: this.confirmedRefs() },
    );
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.kind(), this.id());
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r) {
      return;
    }
    this.busy.set('delete');
    this.api.delete(orgId, this.kind(), r.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.deleteOpen.set(false);
        this.notifications.success('context.notices.deleted', { code: r.code });
        void this.router.navigateByUrl(this.listPath());
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.deleteOpen.set(false);
        this.notifications.error(contextErrorKey(error));
      },
    });
  }

  private transition(action: LifecycleAction, body: Record<string, string>): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r || this.busy()) {
      return;
    }
    this.busy.set(action);
    this.api.transition(orgId, this.kind(), r.id, action, body).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.prompt.set(null);
        this.record.set(updated);
        this.notifications.success(`context.notices.${action}`, { code: updated.code });
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.prompt.set(null);
        this.notifications.error(contextErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, kind: LeadershipKind, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (this.record()?.id !== id) {
      this.state.set('loading');
    }
    this.request = this.api.get(orgId, kind, id).subscribe({
      next: (record) => {
        this.record.set(record);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
