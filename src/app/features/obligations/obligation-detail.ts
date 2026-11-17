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
import { WatchButton } from '../../shared/activity/watch-button';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDayPipe, formatLocalDay } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { RuleSummary } from '../../shared/tasks/rule-summary';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { ObligationsApi } from './data/obligations-api';
import { ENTITY_TYPE, Obligation } from './data/obligation.models';
import {
  NextStep,
  complianceKey,
  daysUntil,
  isRenewable,
  jurisdictionKey,
  nextSteps,
  obligationStatusKey,
  obligationStatusTone,
  obligationTypeKey,
  resultKey,
  safeUrl,
  urlHost,
} from './data/obligation-display';
import { DEFAULT_EVALUATION_RRULE } from './data/obligation-form-model';
import { obligationErrorKey } from './data/obligation-errors';
import { AskPrompt, ObligationAsk } from './obligation-ask';
import { ObligationActions } from './obligation-actions';
import { ObligationChanges } from './obligation-changes';
import { ObligationDuties } from './obligation-duties';
import { ObligationEvaluations } from './obligation-evaluations';

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

/** The assistant questions offered on an obligation. */
const ASK_PROMPTS: readonly AskPrompt[] = [
  { key: 'explain' },
  { key: 'missingEvidence' },
  { key: 'nextStep' },
];

/**
 * An obligation (`/obligations/:id`). The details tab opens with one clear next
 * step (evaluate, plan, follow up, renew …), then what the obligation is and where
 * it comes from, its duties (each with its own owner, clauses, documentation and
 * result), the compliance evaluations with their evidence and follow-up, and change
 * monitoring. The aside shows the requirements it documents, its connections, the
 * evaluation plan and ready-made questions for the assistant. Evaluation, renewal,
 * change and follow-up tasks are in the Tasks tab.
 */
@Component({
  selector: 'app-obligation-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    MarkdownPipe,
    WatchButton,
    AiAssistButton,
    AskAbout,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    RuleSummary,
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
    StatusBadge,
    ObligationActions,
    ObligationAsk,
    ObligationChanges,
    ObligationDuties,
    ObligationEvaluations,
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
          <app-record-detail-layout
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
            backLink="/obligations"
            backLabelKey="obligations.common.backToList"
          >
            <ng-container meta>
              <span class="font-mono font-semibold" data-testid="obligation-code">{{
                o.code
              }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ typeKey(o.obligation_type) | transloco }}</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="statusTone(o.status)"
                [labelKey]="statusKey(o.status)"
                data-testid="obligation-status"
              />
              <app-status-badge
                meaning="compliance"
                [value]="o.compliance_status"
                [labelKey]="complianceKey(o.compliance_status)"
                data-testid="obligation-compliance"
              />
              @if (o.renewal_due) {
                <app-status-badge
                  meaning="lifecycle"
                  value="due"
                  labelKey="obligations.detail.renewalBadge"
                />
              }
            </ng-container>

            <ng-container ngProjectAs="[secondary]">
              @if (canRecord() && o.can_edit) {
                <a
                  [routerLink]="['/obligations', o.id, 'edit']"
                  class="inline-flex h-9 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  data-testid="obligation-edit"
                >
                  {{ 'obligations.common.edit' | transloco }}
                </a>
              }
              <app-watch-button [entityType]="entityType" [entityId]="o.id" />
            </ng-container>
            <ng-container ngProjectAs="[primary]">
              @if (canRecord()) {
                <app-button (click)="recordEvaluation()" data-testid="obligation-evaluate">
                  <app-icon name="checkcircle" [size]="14" />
                  {{ 'obligations.evaluations.record' | transloco }}
                </app-button>
              } @else if (o.can_edit) {
                <a
                  [routerLink]="['/obligations', o.id, 'edit']"
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

            <app-help-strip help scope="obligations" page="detail" lesson="evaluating-compliance" />

            <div class="flex flex-col gap-6">
              @if (steps(); as all) {
                @let first = all[0];
                <section
                  class="rounded-card border p-4"
                  [class]="stripClass(first)"
                  aria-labelledby="cf-ob-next-h"
                  data-testid="next-step"
                  [attr.data-kind]="first.kind"
                >
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <app-icon
                      [name]="first.tone === 'pass' ? 'checkcircle' : 'alert'"
                      [size]="18"
                      class="mt-0.5 flex-none"
                    />
                    <div class="min-w-0 flex-1">
                      <h2 id="cf-ob-next-h" class="text-card font-semibold text-fg">
                        {{ stepTitleKey(first) | transloco: stepParams(first) }}
                      </h2>
                      <p class="mt-0.5 text-ui text-fg-muted">
                        {{ stepBodyKey(first) | transloco: stepParams(first) }}
                      </p>
                      @if (all.length > 1) {
                        <ul class="mt-2 flex flex-col gap-0.5 text-meta text-fg-muted">
                          @for (s of all.slice(1); track s.kind) {
                            <li class="flex items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                class="h-1.5 w-1.5 flex-none rounded-full"
                                [class]="s.tone === 'warn' ? 'bg-warn' : 'bg-info'"
                              ></span>
                              {{ stepTitleKey(s) | transloco: stepParams(s) }}
                            </li>
                          }
                        </ul>
                      }
                    </div>
                    @if (stepAction(first, o); as action) {
                      <app-button
                        class="flex-none"
                        size="sm"
                        [variant]="first.tone === 'pass' ? 'secondary' : 'primary'"
                        [loading]="acting()"
                        (click)="runStep(first)"
                        data-testid="next-step-action"
                      >
                        {{ action | transloco }}
                      </app-button>
                    }
                  </div>
                </section>
              }

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'obligations.detail.about' | transloco }}
                  </h2>
                  <app-ai-assist-button
                    assist="obligations.summarise"
                    labelKey="obligations.summarise.run"
                    [entityType]="entityType"
                    [entityId]="o.id"
                    (text)="aiSummary.set($event)"
                    data-testid="summarise"
                  />
                </div>
                @if (aiSummary()) {
                  <div
                    class="prose-sm mb-4 rounded-tile bg-surface-2 p-3 text-ui text-fg"
                    aria-live="polite"
                    data-testid="ai-summary"
                    [innerHTML]="aiSummary() | appMarkdown"
                  ></div>
                }
                @if (o.description) {
                  <p class="mb-4 text-body whitespace-pre-line text-fg">{{ o.description }}</p>
                }
                <app-field-list [columns]="3">
                  <app-field-item labelKey="obligations.fields.owner" [value]="o.owner?.name" />
                  <app-field-item
                    labelKey="obligations.fields.jurisdiction"
                    [value]="jurisdiction()"
                  />
                  <app-field-item labelKey="obligations.fields.issuer" [value]="o.issuer" />
                  <app-field-item labelKey="obligations.fields.reference" [value]="o.reference" />
                  <app-field-item
                    labelKey="obligations.fields.sourceUrl"
                    [value]="sourceLink() ? null : o.source_url"
                  >
                    @if (sourceLink(); as url) {
                      <a
                        [href]="url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="font-semibold break-all text-accent hover:underline"
                      >
                        {{ sourceHost() }}
                      </a>
                    }
                  </app-field-item>
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
                </app-field-list>
                <div class="mt-5">
                  <h3 class="mb-1 flex items-center gap-1 text-ui font-semibold text-fg-muted">
                    {{ 'obligations.fields.applicability' | transloco }}
                    <app-ask-about
                      [prompt]="'obligations.ask.applicability' | transloco"
                      field="applicability"
                      [fieldLabel]="'obligations.fields.applicability' | transloco"
                      labelKey="obligations.ask.applicabilityLabel"
                    />
                  </h3>
                  <p class="text-body whitespace-pre-line text-fg">
                    {{ o.applicability || ('obligations.detail.noApplicability' | transloco) }}
                  </p>
                </div>
              </app-card>

              <app-card>
                <app-obligation-duties
                  [obligation]="o"
                  [canEdit]="o.can_edit && o.status !== 'retired'"
                  [highlight]="dutyParam()"
                  (changed)="onDutyTask()"
                />
              </app-card>

              <app-card>
                <app-obligation-evaluations
                  [obligation]="o"
                  [attachments]="attachments()"
                  (changed)="onEvaluated($event)"
                  (actionAdded)="bumpActions()"
                />
              </app-card>

              <app-card>
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

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 text-card font-semibold text-fg">
                  {{ 'obligations.detail.schedule' | transloco }}
                </h2>
                @if (o.evaluation_rrule) {
                  <p class="text-body font-semibold text-fg" data-testid="schedule">
                    <app-rule-summary [rrule]="o.evaluation_rrule" />
                  </p>
                  @if (o.next_evaluation; as next) {
                    <p
                      class="mt-1 text-ui"
                      [class.text-warn-ink]="next.overdue"
                      [class.font-semibold]="next.overdue"
                      data-testid="next-evaluation"
                    >
                      {{
                        (next.overdue
                          ? 'obligations.detail.overdueSince'
                          : 'obligations.detail.nextDue'
                        ) | transloco: { date: (next.due_at | localDay) }
                      }}
                    </p>
                  }
                } @else {
                  <p class="text-ui font-semibold text-warn-ink" data-testid="schedule-missing">
                    {{ 'obligations.detail.noSchedule' | transloco }}
                  </p>
                }
                <dl class="mt-3 flex flex-col gap-2 text-meta">
                  <div class="flex justify-between gap-2">
                    <dt class="text-fg-subtle">
                      {{ 'obligations.detail.lastEvaluated' | transloco }}
                    </dt>
                    <dd class="text-right text-fg">
                      {{
                        o.last_evaluated_at
                          ? (o.last_evaluated_at | localDay)
                          : ('obligations.detail.never' | transloco)
                      }}
                    </dd>
                  </div>
                  @if (o.latest_evaluation; as latest) {
                    <div class="flex justify-between gap-2">
                      <dt class="text-fg-subtle">
                        {{ 'obligations.detail.latestResult' | transloco }}
                      </dt>
                      <dd class="text-right text-fg">{{ resultKey(latest.result) | transloco }}</dd>
                    </div>
                  }
                  <div class="flex justify-between gap-2">
                    <dt class="text-fg-subtle">
                      {{ 'obligations.detail.evaluationCount' | transloco }}
                    </dt>
                    <dd class="text-right text-fg">{{ o.evaluation_count }}</dd>
                  </div>
                  <div class="flex justify-between gap-2">
                    <dt class="text-fg-subtle">
                      {{ 'obligations.detail.openChanges' | transloco }}
                    </dt>
                    <dd class="text-right text-fg" data-testid="open-changes">
                      {{ o.open_changes }}
                    </dd>
                  </div>
                </dl>
              </app-card>
              <app-obligation-ask [prompts]="askPrompts" [requirements]="o.clause_refs" />
            </ng-container>

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

  readonly id = input.required<string>();

  private readonly evaluations = viewChild(ObligationEvaluations);

  protected readonly entityType = ENTITY_TYPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = OBLIGATION_FIELD_LABELS;
  protected readonly askPrompts = ASK_PROMPTS;
  protected readonly statusKey = obligationStatusKey;
  protected readonly statusTone = obligationStatusTone;
  protected readonly typeKey = obligationTypeKey;
  protected readonly complianceKey = complianceKey;
  protected readonly resultKey = resultKey;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('obligations.common.loadFailed');
  protected readonly obligation = signal<Obligation | null>(null);
  protected readonly attachments = signal<readonly Attachment[]>([]);
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly actionsVersion = signal(0);
  protected readonly aiSummary = signal('');

  protected readonly steps = computed(() => {
    const o = this.obligation();
    return o ? nextSteps(o) : null;
  });
  protected readonly canRecord = computed(() => {
    const o = this.obligation();
    return !!o && o.can_evaluate && o.status !== 'retired';
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
  protected readonly validUntilText = computed(() => {
    const o = this.obligation();
    if (!o?.valid_until) {
      return this.language.translate('obligations.detail.noEnd');
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

  protected stripClass(step: NextStep): string {
    switch (step.tone) {
      case 'warn':
        return 'border-warn/40 bg-warn-soft text-warn-ink';
      case 'pass':
        return 'border-pass/30 bg-pass-soft text-pass-ink';
      default:
        return 'border-info/30 bg-info-soft text-info-ink';
    }
  }

  protected stepTitleKey(step: NextStep): string {
    return `obligations.next.${step.kind}.title`;
  }

  protected stepBodyKey(step: NextStep): string {
    return `obligations.next.${step.kind}.body`;
  }

  protected stepParams(step: NextStep): Record<string, unknown> {
    const params: Record<string, unknown> = { ...step.params };
    if (typeof params['date'] === 'string' && params['date']) {
      params['date'] = this.day(params['date'] as string);
    }
    return params;
  }

  /** The button of the primary step, or null when it has none for this user. */
  protected stepAction(step: NextStep, o: Obligation): string | null {
    switch (step.kind) {
      case 'overdue':
      case 'firstEvaluation':
        return this.canRecord() ? 'obligations.next.actions.evaluate' : null;
      case 'noFollowUp':
        return this.canRecord() ? 'obligations.next.actions.createDeviation' : null;
      case 'noSchedule':
        return o.can_edit ? 'obligations.next.actions.planYearly' : null;
      case 'draft':
        return o.can_edit ? 'obligations.next.actions.activate' : null;
      case 'renewal':
      case 'expired':
        return o.can_edit ? 'obligations.next.actions.updateValidity' : null;
      case 'changes':
        return 'obligations.next.actions.showChanges';
      default:
        return null;
    }
  }

  protected runStep(step: NextStep): void {
    const o = this.obligation();
    if (!o) {
      return;
    }
    switch (step.kind) {
      case 'overdue':
      case 'firstEvaluation':
        this.recordEvaluation();
        break;
      case 'noFollowUp':
        // The new deviation is attached to the latest failing evaluation on save.
        void this.flows.start('obligation.to_deviation', ENTITY_TYPE, o.id);
        break;
      case 'noSchedule':
        this.patch({ evaluation_rrule: DEFAULT_EVALUATION_RRULE }, 'obligations.notices.planned');
        break;
      case 'draft':
        this.setStatus('active');
        break;
      case 'renewal':
      case 'expired':
        void this.router.navigate(['/obligations', o.id, 'edit']);
        break;
      case 'changes':
        this.scrollTo('obligation-changes');
        break;
    }
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

  private scrollTo(id: string): void {
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
