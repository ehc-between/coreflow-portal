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
import { AiAvailability } from '../../../core/ai/ai-availability';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RequirementLink } from '../../../core/standards/standards.models';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { Term } from '../../../shared/guidance/term';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem, OverflowMenu } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContextApi } from '../data/context-api';
import {
  ContextKind,
  ContextRecord,
  ControlledFields,
  ControlledStatus,
  LifecycleAction,
} from '../data/context.models';
import {
  KINDS,
  asKind,
  contextErrorKey,
  isPastDay,
  lifecycleActions,
  statusBadge,
} from '../context-kinds';
import { CONTEXT_NAV, CONTEXT_ROOT_CRUMB } from '../context-nav';
import { injectContextPermissions } from '../context-permissions';
import { CommunicatePanel } from './communicate-panel';
import { RecordBody } from './record-body';

/** Snapshot field -> label key, for the revisions tab. */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'context.fields.title',
  name: 'context.fields.name',
  method: 'context.fields.method',
  framework: 'context.fields.framework',
  frameworks: 'context.fields.frameworks',
  summary: 'context.fields.summary',
  items: 'context.fields.items',
  category: 'context.fields.category',
  party_type: 'context.fields.partyType',
  description: 'context.fields.description',
  needs: 'context.fields.needs',
  expectations: 'context.fields.expectations',
  requirements: 'context.fields.requirements',
  is_compliance_obligation: 'context.fields.isComplianceObligation',
  addressed_status: 'context.fields.addressedStatus',
  how_addressed: 'context.fields.howAddressed',
  monitoring: 'context.fields.monitoring',
  influence: 'context.fields.influence',
  interest: 'context.fields.interest',
  statement: 'context.fields.statement',
  boundaries: 'context.fields.boundaries',
  products_services: 'context.fields.productsServices',
  sites: 'context.fields.sites',
  exclusions: 'context.fields.exclusions',
  process_ids: 'context.fields.processes',
  kind: 'context.fields.kind',
  available_to_interested_parties: 'context.fields.availableToParties',
  area: 'context.fields.area',
  process_id: 'context.fields.process',
  authorities: 'context.fields.authorities',
  assignments: 'context.fields.assignments',
  owner_user_id: 'context.fields.owner',
  review_interval_months: 'context.fields.reviewInterval',
  next_review_at: 'context.fields.nextReview',
  status: 'context.fields.status',
  version_no: 'context.fields.version',
};

/** Glossary key that explains each kind (on its first use, the meta line). */
const TERM_KEYS: Readonly<Record<ContextKind, string>> = {
  analysis: 'context-of-the-organisation',
  party: 'interested-party',
  scope: 'scope',
  policy: 'policy',
  responsibility: 'raci',
};

type PromptAction = Exclude<LifecycleAction, 'submit'>;

/** Prompt dialog behaviour per step (the reason is required only to return). */
const PROMPTS: Readonly<
  Record<PromptAction, { required: boolean; variant: 'primary' | 'danger' }>
> = {
  approve: { required: false, variant: 'primary' },
  return: { required: true, variant: 'primary' },
  review: { required: false, variant: 'primary' },
  retire: { required: false, variant: 'danger' },
};

/** The request body of a prompted lifecycle step. */
export function lifecycleBody(action: PromptAction, text: string): Record<string, string> {
  const value = text.trim();
  switch (action) {
    case 'approve':
      return value ? { comment: value } : {};
    case 'return':
      return { reason: value };
    case 'review':
      return value ? { notes: value } : {};
    case 'retire':
      return value ? { reason: value } : {};
  }
}

/** Every header action a record page can show. */
export type HeaderAction = LifecycleAction | 'edit' | 'communicate';

/** Which header actions go where: one primary, Edit as secondary, the rest in "Mer". */
export interface HeaderActions {
  readonly primary: HeaderAction | null;
  readonly secondary: readonly HeaderAction[];
  readonly overflow: readonly HeaderAction[];
}

/**
 * Place the allowed actions (docs/ux-guide.md §2.1): the next lifecycle step is
 * primary (send for approval, approve, communicate; a review only when it is
 * overdue), else Edit; Edit is otherwise the one secondary action (the layout
 * adds "Lag ny fra denne"); everything else, and Delete, goes in "Mer".
 */
export function placeActions(
  allowed: readonly HeaderAction[],
  reviewOverdue: boolean,
): HeaderActions {
  const has = (action: HeaderAction) => allowed.includes(action);
  let primary: HeaderAction | null =
    (['submit', 'approve', 'communicate'] as const).find((a) => has(a)) ?? null;
  if (!primary && reviewOverdue && has('review')) {
    primary = 'review';
  }
  if (!primary && has('edit')) {
    primary = 'edit';
  }
  const secondary: HeaderAction[] = has('edit') && primary !== 'edit' ? ['edit'] : [];
  const overflow = (['approve', 'return', 'review', 'retire'] as const).filter(
    (a) => has(a) && a !== primary,
  );
  return { primary, secondary, overflow };
}

/**
 * The detail page of any M01 record (`/context/<segment>/:id`; kind from route
 * data) on the shared record layout: header with breadcrumbs, a meta line (code
 * · type · status · version), one primary action and the rest under "Mer";
 * tabs for details, related records, activity, comments, attachments,
 * revisions and tasks; the aside shows the requirements the record documents,
 * its connections, a summary and why it matters.
 */
@Component({
  selector: 'app-context-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    Term,
    WhyItMatters,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    SupportsRequirements,
    EntityTasks,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    OverflowMenu,
    PromptDialog,
    StatusBadge,
    CommunicatePanel,
    RecordBody,
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
            [entityType]="cfg().entityType"
            [entityId]="r.id"
            [title]="title()"
            [breadcrumbs]="breadcrumbs()"
            [tabs]="tabs"
            [canEdit]="r.can_edit"
            [fieldLabels]="fieldLabels"
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
              @if (controlled(); as c) {
                <span>{{ 'context.common.version' | transloco: { version: c.version_no } }}</span>
              }
              @if (reviewOverdue()) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="context.detail.reviewOverdue"
                />
              }
              @if (controlled()?.status === 'retired') {
                <span class="basis-full text-fg-subtle sm:basis-auto">
                  {{ 'context.detail.retiredHint' | transloco }}
                </span>
              }
            </ng-container>

            @if (aiAvailable()) {
              <app-overflow-menu
                secondary
                icon="spark"
                labelKey="context.ai.menu"
                triggerTestId="context-ai-menu"
              >
                <button appMenuItem type="button" (click)="askAi('summarise')">
                  {{ 'context.ai.summarise' | transloco }}
                </button>
                <button appMenuItem type="button" (click)="askAi('improve')">
                  {{ 'context.ai.improve.' + kind() | transloco }}
                </button>
                <button appMenuItem type="button" (click)="askAi('explain')">
                  {{ 'context.ai.explain' | transloco }}
                </button>
              </app-overflow-menu>
            }
            @if (placed().primary; as action) {
              <app-button
                primary
                variant="primary"
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

            <app-module-nav nav [items]="nav" labelKey="modules.names.context" />
            <app-help-strip
              help
              scope="context"
              [page]="cfg().guidance + '-detail'"
              [lesson]="cfg().lesson"
              [subject]="title()"
            />

            <div class="flex flex-col gap-6">
              <app-context-record-body
                [kind]="kind()"
                [record]="r"
                [canWrite]="perms.canWrite()"
                (changed)="record.set($event)"
                (communicate)="communicateOpen.set(true)"
              />
            </div>

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

            <div aside>
              <app-card>
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'context.detail.summaryTitle' | transloco }}
                  </h2>
                  <app-watch-button [entityType]="cfg().entityType" [entityId]="r.id" />
                </div>
                <app-field-list [columns]="1">
                  <app-field-item
                    [labelKey]="
                      kind() === 'responsibility'
                        ? 'context.fields.maintainedBy'
                        : 'context.fields.owner'
                    "
                    [value]="r.owner?.name"
                  />
                  @if (controlled(); as c) {
                    @if (c.document_id) {
                      <app-field-item labelKey="context.policyDocs.documentLabel">
                        <a
                          [routerLink]="['/documents', c.document_id]"
                          class="font-semibold text-accent hover:underline"
                          data-testid="published-document"
                        >
                          {{ 'context.policyDocs.openDocument' | transloco }} →
                        </a>
                        <span class="mt-0.5 block text-meta text-fg-muted">
                          {{ 'context.policyDocs.documentHint' | transloco }}
                        </span>
                      </app-field-item>
                    }
                    @if (c.approved_at) {
                      <app-field-item labelKey="context.detail.approved">
                        {{
                          'context.detail.byOn'
                            | transloco
                              : {
                                  name:
                                    c.approved_by?.name || ('context.common.unknown' | transloco),
                                  date: (c.approved_at | localDay),
                                }
                        }}
                        @if (c.approver_roles?.length) {
                          <span
                            class="mt-0.5 block text-meta text-fg-muted"
                            data-testid="approver-roles"
                          >
                            {{
                              'context.detail.approverRoles'
                                | transloco: { roles: c.approver_roles!.join(', ') }
                            }}
                          </span>
                        }
                      </app-field-item>
                    }
                    @if (c.submitted_at && c.status === 'in_review') {
                      <app-field-item labelKey="context.detail.submitted">
                        {{
                          'context.detail.byOn'
                            | transloco
                              : {
                                  name:
                                    c.submitted_by?.name || ('context.common.unknown' | transloco),
                                  date: (c.submitted_at | localDay),
                                }
                        }}
                      </app-field-item>
                    }
                    @if (c.last_reviewed_at) {
                      <app-field-item
                        labelKey="context.fields.lastReviewed"
                        [value]="c.last_reviewed_at | localDay"
                      />
                    }
                  }
                  <app-field-item labelKey="context.fields.reviewInterval">
                    @if (interval(); as months) {
                      {{ 'context.detail.everyMonths' | transloco: { count: months } }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="context.fields.nextReview">
                    @if (r.next_review_at) {
                      <span
                        [class.text-warn-ink]="reviewOverdue()"
                        [class.font-semibold]="reviewOverdue()"
                      >
                        {{ r.next_review_at | localDay }}
                        @if (reviewOverdue()) {
                          · {{ 'context.detail.reviewOverdue' | transloco }}
                        }
                      </span>
                    }
                  </app-field-item>
                  <app-field-item labelKey="context.fields.updated">
                    {{
                      'context.detail.byOn'
                        | transloco
                          : {
                              name:
                                r.updated_by?.name ||
                                r.created_by?.name ||
                                ('context.common.unknown' | transloco),
                              date: (r.updated_at | localDate),
                            }
                    }}
                  </app-field-item>
                </app-field-list>
              </app-card>
            </div>

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
export class ContextDetail {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly availability = inject(AiAvailability);

  /** Route param and data (component input binding). */
  readonly id = input.required<string>();
  readonly contextKind = input<unknown>(undefined);

  protected readonly kind = computed(() => asKind(this.contextKind()));
  protected readonly cfg = computed(() => KINDS[this.kind()]);
  protected readonly listPath = computed(() => `/context/${this.cfg().segment}`);
  protected readonly termKey = computed(() => TERM_KEYS[this.kind()]);
  protected readonly nav = CONTEXT_NAV;
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

  protected readonly aiAvailable = computed(() => !this.availability.unavailable());
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

  /** The record's lifecycle fields (analyses, scopes and policies only). */
  protected readonly controlled = computed<ControlledFields | null>(() => {
    const r = this.record();
    return r && this.cfg().controlled ? (r as unknown as ControlledFields) : null;
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
        void this.router.navigate([this.listPath(), r.id, 'edit']);
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
      kind === 'summarise'
        ? 'context.ai.prompts.summarise'
        : kind === 'explain'
          ? 'context.ai.prompts.explain'
          : `context.ai.prompts.improve.${this.kind()}`;
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

  private load(orgId: string | null, kind: ContextKind, id: string): void {
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
