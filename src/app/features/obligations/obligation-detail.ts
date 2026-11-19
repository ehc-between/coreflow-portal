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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, map } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AttachmentsApi } from '../../core/attachments/attachments-api';
import { isDownloadable } from '../../core/attachments/attachment-utils';
import { Attachment } from '../../core/attachments/attachment.models';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
} from '../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe, formatLocalDay } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { RuleSummary } from '../../shared/tasks/rule-summary';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { AskPanelService } from '../ask/ask-panel.service';
import { ObligationsApi } from './data/obligations-api';
import { ENTITY_TYPE, Obligation } from './data/obligation.models';
import { ObligationTodo, obligationSentence, obligationTodos } from './data/obligation-anatomy';
import {
  daysUntil,
  isRenewable,
  jurisdictionKey,
  obligationStatusKey,
  obligationStatusMeaning,
  obligationTypeKey,
  resultKey,
  safeUrl,
  urlHost,
} from './data/obligation-display';
import { DEFAULT_EVALUATION_RRULE } from './data/obligation-form-model';
import { obligationErrorKey } from './data/obligation-errors';
import { ObligationActions } from './obligation-actions';
import { ObligationChanges } from './obligation-changes';
import { ObligationDuties } from './obligation-duties';
import { ObligationEvaluations } from './obligation-evaluations';
import { CustomerChip } from '../../shared/customers';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> i18n key (for the revisions tab). */
export const OBLIGATION_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'obligations.fields.code',
  title: 'obligations.fields.title',
  obligation_type: 'obligations.fields.obligationType',
  status: 'obligations.fields.status',
  compliance_status: 'obligations.fields.complianceStatus',
  description: 'obligations.fields.description',
  applicability: 'obligations.fields.applicability',
  requirements: 'obligations.fields.requirements',
  duties: 'obligations.fields.requirements',
  frameworks: 'obligations.fields.frameworks',
  clause_refs: 'obligations.fields.clauseRefs',
  jurisdiction: 'obligations.fields.jurisdiction',
  issuer: 'obligations.fields.issuer',
  reference: 'obligations.fields.reference',
  source_url: 'obligations.fields.sourceUrl',
  owner_user_id: 'obligations.fields.owner',
  department_id: 'obligations.fields.department',
  valid_from: 'obligations.fields.validFrom',
  valid_until: 'obligations.fields.validUntil',
  renewal_lead_days: 'obligations.fields.renewalLeadDays',
  evaluation_rrule: 'obligations.fields.evaluationRrule',
  evaluation_start: 'obligations.fields.evaluationStart',
  evaluation_lead_days: 'obligations.fields.evaluationLeadDays',
};

/** Days before `valid_until` from which the validity end is highlighted. */
export const EXPIRY_WARNING_DAYS = 60;

/** The ready-made assistant questions in "Spør KI" (`obligations.ask.<key>`). */
const ASK_PROMPTS: readonly string[] = ['explain', 'missingEvidence', 'nextStep', 'applicability'];

/** Section ids the Oppfølging lines and the lead scroll to. */
const SECTIONS = {
  duties: 'obligation-duties',
  evaluations: 'obligation-evaluations',
  changes: 'obligation-changes',
} as const;

/**
 * An obligation (`/obligations/:id`) on the detail-page anatomy (docs/ux-guide.md §2.7).
 * Header: code · type · status, "Registrer vurdering" (or "Rediger"), "Spør KI" (plain
 * explanation and ready-made questions) and "Mer". "Hovedinformasjon" answers what a
 * reader and an auditor come for: are we compliant (status sentence), what the law
 * requires, how it applies to us, where it comes from (authority, reference, the law
 * text) and the latest evaluation with the next one. The Details tab holds the duties,
 * the evaluation history with evidence and follow-up, change monitoring and the few
 * secondary fields. One "Oppfølging" card lists the open next steps (evaluate, follow
 * up, plan, renew, handle changes), the requirements, the connections and owner /
 * schedule / dates. Evaluation, renewal, change and follow-up tasks are in the Tasks tab.
 */
@Component({
  selector: 'app-obligation-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    AiAssistButton,
    WhyItMatters,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    SupportsRequirements,
    RuleSummary,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    StatusBadge,
    ObligationActions,
    ObligationChanges,
    ObligationDuties,
    ObligationEvaluations,
    CustomerChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-8 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-error-state [bodyKey]="errorKey()" (retry)="reload(true)" />
          <a
            routerLink="/obligations"
            class="mt-4 inline-block text-ui font-semibold text-accent hover:underline"
          >
            {{ 'obligations.common.backToList' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (obligation(); as o) {
          @let sentence = statusSentence();
          <app-record-detail-layout
            [anatomy]="true"
            [entityType]="entityType"
            [entityId]="o.id"
            [title]="o.title"
            [breadcrumbs]="[
              { labelKey: 'modules.names.obligations', link: '/obligations' },
              { label: o.code },
            ]"
            [tabs]="tabs"
            [counts]="{ attachments: attachments().length }"
            [canEdit]="o.can_edit"
            [fieldLabels]="fieldLabels"
            [missing]="missing()"
            backLink="/obligations"
            backLabelKey="obligations.common.backToList"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono" data-testid="obligation-code">{{ o.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ typeKey(o.obligation_type) | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="statusMeaning(o.status)"
                [labelKey]="statusKey(o.status)"
                data-testid="obligation-status"
              />
              @if (o.status !== 'retired' && o.next_evaluation?.overdue) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="obligations.detail.evaluationOverdue"
                />
              }
            </ng-container>

            <ng-container ngProjectAs="[secondary]">
              @if (canRecord() && o.can_edit) {
                <a
                  [routerLink]="editLink()"
                  class="inline-flex h-9 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  data-testid="obligation-edit"
                >
                  {{ 'obligations.common.edit' | transloco }}
                </a>
              }
            </ng-container>
            <ng-container ngProjectAs="[primary]">
              @if (canRecord()) {
                <app-button (click)="recordEvaluation()" data-testid="obligation-evaluate">
                  <app-icon name="checkcircle" [size]="14" />
                  {{ 'obligations.evaluations.record' | transloco }}
                </app-button>
              } @else if (o.can_edit) {
                <a
                  [routerLink]="editLink()"
                  class="inline-flex h-9 items-center rounded-tile bg-accent px-3.5 text-ui font-semibold text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
                  data-testid="obligation-edit"
                >
                  {{ 'obligations.common.edit' | transloco }}
                </a>
              }
            </ng-container>

            <ng-container ngProjectAs="[overflow]">
              @if (o.can_edit && o.status !== 'retired') {
                <button
                  appMenuItem
                  type="button"
                  (click)="setStatus('retired')"
                  data-testid="obligation-retire"
                >
                  {{ 'obligations.detail.retire' | transloco }}
                </button>
              } @else if (o.can_edit) {
                <button appMenuItem type="button" (click)="setStatus('active')">
                  {{ 'obligations.detail.reactivate' | transloco }}
                </button>
              }
              @if (o.can_delete) {
                <button
                  appMenuItem
                  type="button"
                  [danger]="true"
                  (click)="deleting.set(true)"
                  data-testid="obligation-delete"
                >
                  {{ 'obligations.common.delete' | transloco }}
                </button>
              }
            </ng-container>

            <!-- §2.7: every assistant action in the header's "Spør KI" menu. -->
            <button appMenuItem ask type="button" (click)="summarise()" data-testid="summarise">
              <app-icon name="spark" [size]="15" />
              {{ 'obligations.summarise.run' | transloco }}
            </button>
            @for (key of askPrompts; track key) {
              <button
                appMenuItem
                ask
                type="button"
                (click)="askAi(key)"
                [attr.data-testid]="'ask-' + key"
              >
                <app-icon name="spark" [size]="15" />
                {{ 'obligations.ask.menu.' + key | transloco }}
              </button>
            }

            <app-help-strip help scope="obligations" page="detail" lesson="evaluating-compliance" />

            <app-record-lead record-lead [fillLink]="o.can_edit ? editLink() : null">
              <app-record-status-line
                status
                [tone]="sentence.tone"
                data-testid="obligation-compliance"
                [attr.data-kind]="sentence.kind"
              >
                {{ 'obligations.detail.sentence.' + sentence.kind | transloco }}
              </app-record-status-line>

              <app-field-item
                size="lead"
                labelKey="obligations.detail.lead.requires"
                [wide]="true"
                [multiline]="true"
                [value]="o.description"
              />
              <app-field-item
                size="lead"
                labelKey="obligations.detail.lead.appliesToUs"
                [wide]="true"
                [multiline]="true"
                [value]="o.applicability"
              />
              <app-field-item
                size="lead"
                labelKey="obligations.detail.lead.source"
                data-testid="lead-source"
              >
                @if (o.issuer || o.reference || o.source_url || jurisdiction()) {
                  @if (sourceLine(); as line) {
                    <span class="block">{{ line }}</span>
                  }
                  @if (o.reference) {
                    <span class="block font-mono text-ui text-fg-muted">{{ o.reference }}</span>
                  }
                  @if (sourceLink(); as url) {
                    <a
                      [href]="url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="mt-1 inline-flex items-center gap-1 text-ui font-semibold break-all text-accent hover:underline"
                    >
                      {{ 'obligations.detail.readLaw' | transloco: { host: sourceHost() } }}
                      <span aria-hidden="true">↗</span>
                    </a>
                  } @else if (o.source_url) {
                    <span class="block text-ui break-all text-fg-muted">{{ o.source_url }}</span>
                  }
                }
              </app-field-item>
              @if (o.customer) {
                <app-field-item
                  size="lead"
                  labelKey="obligations.fields.customer"
                  data-testid="lead-customer"
                >
                  <app-customer-chip [ref]="o.customer" />
                </app-field-item>
              }
              <app-field-item
                size="lead"
                labelKey="obligations.detail.lead.latestEvaluation"
                [keepEmpty]="o.status === 'active'"
                emptyKey="obligations.detail.notEvaluated"
                data-testid="lead-evaluation"
              >
                @if (o.latest_evaluation; as latest) {
                  <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <app-status-badge
                      meaning="compliance"
                      [value]="latest.result"
                      [labelKey]="resultKey(latest.result)"
                    />
                    <span>{{ latest.evaluated_on | localDay }}</span>
                  </span>
                  @if (latest.evaluated_by?.name; as name) {
                    <span class="mt-0.5 block text-ui text-fg-muted">
                      {{ 'obligations.evaluations.by' | transloco: { name } }}
                    </span>
                  }
                }
                @if (o.status !== 'retired' && o.evaluation_rrule && o.next_evaluation?.due_at) {
                  @let next = o.next_evaluation!;
                  <span
                    class="mt-1 block text-ui"
                    [class.text-warn-ink]="next.overdue"
                    [class.font-semibold]="next.overdue"
                    [class.text-fg-muted]="!next.overdue"
                    data-testid="next-evaluation"
                  >
                    {{
                      (next.overdue
                        ? 'obligations.detail.overdueSince'
                        : 'obligations.detail.nextDue'
                      ) | transloco: { date: (next.due_at | localDay) }
                    }}
                  </span>
                }
                @if (o.evaluation_count > 0) {
                  <button
                    type="button"
                    class="mt-1 inline-flex items-center gap-1 text-ui font-semibold text-accent hover:underline"
                    (click)="scrollTo(sections.evaluations)"
                  >
                    {{
                      (o.evaluation_count === 1
                        ? 'obligations.detail.showEvaluation'
                        : 'obligations.detail.showEvaluations'
                      ) | transloco: { count: o.evaluation_count }
                    }}
                    <span aria-hidden="true">↓</span>
                  </button>
                }
              </app-field-item>
            </app-record-lead>

            <div class="flex flex-col gap-6">
              <app-ai-assist-button
                #summaryAssist
                class="empty:hidden"
                [quiet]="true"
                assist="obligations.summarise"
                labelKey="obligations.summarise.run"
                [entityType]="entityType"
                [entityId]="o.id"
                (text)="aiSummary.set($event)"
              />
              @if (aiSummary()) {
                <app-card>
                  <div class="flex items-start justify-between gap-3" aria-live="polite">
                    <div class="min-w-0">
                      <h2 class="mb-1 text-meta font-bold tracking-wide text-fg-subtle uppercase">
                        {{ 'obligations.summarise.title' | transloco }}
                      </h2>
                      <div
                        class="prose-sm text-ui text-fg"
                        data-testid="ai-summary"
                        [innerHTML]="aiSummary() | appMarkdown"
                      ></div>
                    </div>
                    <button
                      type="button"
                      (click)="aiSummary.set('')"
                      [attr.aria-label]="'obligations.summarise.dismiss' | transloco"
                      class="flex flex-none rounded-lg p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                    >
                      <app-icon name="x" [size]="15" />
                    </button>
                  </div>
                </app-card>
              }

              @if (renewable() || o.valid_from || o.valid_until) {
                <app-card>
                  <app-record-details
                    titleKey="obligations.detail.validity"
                    [columns]="3"
                    [fillLink]="o.can_edit ? editLink() : null"
                  >
                    <app-field-item
                      labelKey="obligations.fields.validFrom"
                      [value]="o.valid_from ? (o.valid_from | localDay) : null"
                    />
                    <app-field-item
                      labelKey="obligations.fields.validUntil"
                      [value]="validUntilText()"
                      data-testid="valid-until"
                    />
                    @if (renewable()) {
                      <app-field-item
                        labelKey="obligations.fields.renewalDueOn"
                        [value]="o.renewal_due_on ? (o.renewal_due_on | localDay) : null"
                      />
                    }
                  </app-record-details>
                </app-card>
              }
              <app-card class="scroll-mt-20">
                <app-obligation-duties
                  [obligation]="o"
                  [canEdit]="o.can_edit && o.status !== 'retired'"
                  [highlight]="dutyParam()"
                  (changed)="onDutyTask()"
                />
              </app-card>

              <app-card class="scroll-mt-20">
                <app-obligation-evaluations
                  [obligation]="o"
                  [attachments]="attachments()"
                  (changed)="onEvaluated($event)"
                  (actionAdded)="bumpActions()"
                />
              </app-card>

              <app-card class="scroll-mt-20">
                <app-obligation-changes
                  [obligationId]="o.id"
                  [canEdit]="o.can_edit"
                  (changed)="reload(false)"
                />
              </app-card>
            </div>

            <div tasks>
              <app-obligation-actions
                [obligationId]="o.id"
                [canEdit]="o.can_edit && o.status !== 'retired'"
                [refresh]="actionsVersion()"
              />
            </div>

            <ng-container aside-requirements>
              <app-supports-requirements
                [entityType]="entityType"
                [entityId]="o.id"
                [canEdit]="o.can_edit"
                [frameworks]="o.frameworks"
              />
            </ng-container>

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="obligations.fields.owner"
                [value]="o.owner?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="obligations.detail.meta.schedule"
                [keepEmpty]="o.status !== 'retired'"
                emptyKey="kit.detail.meta.notPlanned"
                emptyActionKey="kit.detail.meta.plan"
                [emptyLink]="o.can_edit ? editLink() : null"
              >
                @if (o.evaluation_rrule) {
                  <span data-testid="schedule"
                    ><app-rule-summary [rrule]="o.evaluation_rrule"
                  /></span>
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="obligations.detail.lastEvaluated"
                [value]="o.last_evaluated_at ? (o.last_evaluated_at | localDay) : null"
              />
              <app-field-item
                layout="inline"
                labelKey="obligations.detail.meta.updated"
                [value]="o.updated_at | localDate"
              />
            </app-record-meta>

            <ng-container aside-learn>
              <app-why-it-matters scope="obligations" page="detail" />
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'obligations.detail.deleteTitle' | transloco: { code: o.code }"
            [message]="'obligations.detail.deleteMessage' | transloco"
            [confirmLabel]="'obligations.detail.deleteAnyway' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            initialFocus="[data-testid=delete-retire-instead]"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          >
            @if (o.status !== 'retired' && o.can_edit) {
              <div class="mt-3 rounded-tile border border-border bg-surface-2 p-3">
                <p class="text-ui text-fg">{{ 'obligations.detail.retireInstead' | transloco }}</p>
                <app-button
                  class="mt-2"
                  size="sm"
                  [disabled]="acting()"
                  (click)="retireInstead()"
                  data-testid="delete-retire-instead"
                >
                  {{ 'obligations.detail.retireInsteadAction' | transloco }}
                </app-button>
              </div>
            }
          </app-confirm-dialog>
        }
      }
    }
  `,
})
export class ObligationDetail {
  private readonly api = inject(ObligationsApi);
  private readonly attachmentsApi = inject(AttachmentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly flows = inject(CreateFlowService);
  private readonly askPanel = inject(AskPanelService);

  readonly id = input.required<string>();

  private readonly evaluations = viewChild(ObligationEvaluations);
  private readonly summaryAssist = viewChild<AiAssistButton>('summaryAssist');

  protected readonly entityType = ENTITY_TYPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = OBLIGATION_FIELD_LABELS;
  protected readonly askPrompts = ASK_PROMPTS;
  protected readonly sections = SECTIONS;
  protected readonly statusKey = obligationStatusKey;
  protected readonly statusMeaning = obligationStatusMeaning;
  protected readonly typeKey = obligationTypeKey;
  protected readonly resultKey = resultKey;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('obligations.common.loadFailed');
  protected readonly obligation = signal<Obligation | null>(null);
  protected readonly attachments = signal<readonly Attachment[]>([]);
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly actionsVersion = signal(0);
  protected readonly aiSummary = signal('');

  protected readonly canRecord = computed(() => {
    const o = this.obligation();
    return !!o && o.can_evaluate && o.status !== 'retired';
  });
  protected readonly editLink = computed(() => ['/obligations', this.obligation()?.id, 'edit']);
  protected readonly statusSentence = computed(() => {
    const o = this.obligation();
    return o ? obligationSentence(o) : { kind: 'not_evaluated', tone: 'warn' as const };
  });
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const o = this.obligation();
    if (!o) {
      return [];
    }
    return obligationTodos(o, { canRecord: this.canRecord(), canEdit: o.can_edit }).map((t) =>
      this.missingItem(t),
    );
  });
  protected readonly renewable = computed(() => isRenewable(this.obligation()?.obligation_type));
  protected readonly sourceLink = computed(() => safeUrl(this.obligation()?.source_url));
  protected readonly sourceHost = computed(() => {
    const url = this.sourceLink();
    return url ? urlHost(url) : (this.obligation()?.source_url ?? null);
  });
  protected readonly jurisdiction = computed(() => {
    const value = this.obligation()?.jurisdiction;
    const key = jurisdictionKey(value);
    return key ? this.language.translate(key) : (value ?? null);
  });
  /** "Arbeidstilsynet · Norge": who issued it and where it applies. */
  protected readonly sourceLine = computed(() =>
    [this.obligation()?.issuer, this.jurisdiction()].filter(Boolean).join(' · '),
  );
  protected readonly validUntilText = computed(() => {
    const o = this.obligation();
    if (!o?.valid_until) {
      return null;
    }
    const days = daysUntil(o.valid_until);
    const date = this.day(o.valid_until);
    if (days === null) {
      return date;
    }
    const key = days < 0 ? 'obligations.detail.endedAgo' : 'obligations.detail.endsIn';
    return this.language.translate('obligations.detail.validUntilWithDays', {
      date,
      days: this.language.translate(key, { days: Math.abs(days) }),
    });
  });

  /** The open tab (`?tab=`), so the file list refreshes when returning to details. */
  private readonly tab = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('tab'))), {
    initialValue: null,
  });
  /** `?duty=<id>`: the duty's own link (scrolled to and marked). */
  protected readonly dutyParam = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('duty'))),
    { initialValue: null },
  );

  private request = new Subscription();
  private filesRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.filesRequest.unsubscribe();
    });
    providePageContext(() => {
      const o = this.obligation();
      return {
        module: 'obligations',
        entityType: ENTITY_TYPE,
        entityId: this.id(),
        view: 'detail',
        title: o ? `${o.code} ${o.title}` : null,
        requirements: o ? [...(o.clause_refs ?? [])] : undefined,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.aiSummary.set('');
        this.load(orgId, id, true);
      });
    });
    effect(() => {
      const tab = this.tab();
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (!tab || tab === 'details' || tab === 'attachments') {
        untracked(() => this.loadFiles(orgId, id));
      }
    });
  }

  private day(value: string): string {
    return formatLocalDay(value, 'mediumDate', this.language.locale());
  }

  protected reload(initial = false): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), initial);
  }

  /** One "Hva mangler" line: the label, and what clicking it does. */
  private missingItem(todo: ObligationTodo): RecordMissingItem {
    const params: Record<string, unknown> = { ...todo.params };
    if (typeof params['date'] === 'string' && params['date']) {
      params['date'] = this.day(params['date'] as string);
    }
    const base = { key: todo.kind, labelKey: `obligations.detail.todo.${todo.kind}`, params };
    const o = this.obligation();
    switch (todo.kind) {
      case 'overdue':
      case 'firstEvaluation':
        return { ...base, action: () => this.recordEvaluation() };
      case 'noFollowUp':
        // The new deviation is attached to the latest failing evaluation on save.
        return {
          ...base,
          action: () => void this.flows.start('obligation.to_deviation', ENTITY_TYPE, o?.id ?? ''),
        };
      case 'noSchedule':
        return {
          ...base,
          action: () =>
            this.patch(
              { evaluation_rrule: DEFAULT_EVALUATION_RRULE },
              'obligations.notices.planned',
            ),
        };
      case 'draft':
        return { ...base, action: () => this.setStatus('active') };
      case 'changes':
        return { ...base, action: () => this.scrollTo(SECTIONS.changes) };
      default:
        // renewal, expired, owner: the edit page.
        return { ...base, link: this.editLink() };
    }
  }

  protected summarise(): void {
    this.summaryAssist()?.run();
  }

  protected askAi(key: string): void {
    const o = this.obligation();
    this.askPanel.askAbout(this.language.translate(`obligations.ask.${key}`), undefined, {
      requirements: o?.clause_refs ?? null,
    });
  }

  protected recordEvaluation(): void {
    this.evaluations()?.open();
  }

  protected setStatus(status: 'active' | 'retired'): void {
    this.patch(
      { status },
      status === 'retired' ? 'obligations.notices.retired' : 'obligations.notices.activated',
    );
  }

  protected retireInstead(): void {
    this.deleting.set(false);
    this.setStatus('retired');
  }

  protected onEvaluated(updated: Obligation | null): void {
    if (updated) {
      this.obligation.set(updated);
    } else {
      this.reload(false);
    }
    this.bumpActions();
  }

  protected onDutyTask(): void {
    this.reload(false);
    this.bumpActions();
  }

  protected bumpActions(): void {
    this.actionsVersion.update((v) => v + 1);
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const o = this.obligation();
    if (!orgId || !o) {
      return;
    }
    this.acting.set(true);
    this.api.delete(orgId, o.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deleting.set(false);
        this.notifications.success('obligations.notices.deleted', { code: o.code });
        void this.router.navigate(['/obligations']);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  private patch(body: Parameters<ObligationsApi['update']>[2], notice: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const o = this.obligation();
    if (!orgId || !o || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.update(orgId, o.id, body).subscribe({
      next: (updated) => {
        this.acting.set(false);
        this.obligation.set(updated);
        this.bumpActions();
        this.notifications.success(notice, { code: o.code });
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  protected scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }

  private load(orgId: string | null, id: string, initial: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (initial) {
      this.state.set('loading');
    }
    this.request = this.api.get(orgId, id).subscribe({
      next: (obligation) => {
        this.obligation.set(obligation);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        if (initial) {
          this.errorKey.set(obligationErrorKey(error));
          this.state.set('error');
        } else {
          this.notifications.error(obligationErrorKey(error));
        }
      },
    });
  }

  private loadFiles(orgId: string | null, id: string): void {
    this.filesRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.filesRequest = this.attachmentsApi.list(orgId, ENTITY_TYPE, id).subscribe({
      // Only clean files can be read or extracted; scanning / quarantined ones can't.
      next: (items) => this.attachments.set(items.filter(isDownloadable)),
      error: () => this.attachments.set([]),
    });
  }
}
