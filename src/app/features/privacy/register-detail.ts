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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, of } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { AskPanelService } from '../ask/ask-panel.service';
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
import {
  LocalDatePipe,
  LocalDayPipe,
  formatLocalDate,
  formatLocalDay,
} from '../../shared/locale/locale-pipes';
import { locationName } from '../../shared/locale/countries';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { Breadcrumb } from '../../shared/ui/page-header/page-header';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PrivacyApi } from './data/privacy-api';
import {
  ConsentRecord,
  DataBreach,
  DataSubjectRequest,
  Dpia,
  DpiaRisk,
  LegalBasisAssessment,
  PERM_APPROVE,
  PERM_MANAGE,
  PrivacyGap,
  PrivacyRecord,
  Processor,
  RetentionSchedule,
  TransferAssessment,
} from './data/privacy.models';
import { countryStatusKey, statusKey, statusToneValue } from './data/privacy-display';
import { privacyError } from './data/privacy-errors';
import { PrivacyRefsService } from './data/privacy-refs.service';
import {
  PRIVACY_CRUMB,
  PRIVACY_SETTINGS_LINK,
  REGISTERS,
  RegisterKey,
  fieldLabelKey,
  registerCrumb,
  revisionFieldLabels,
} from './data/privacy-registers';
import { LEAD_FIELDS, isPastDay, privacyMissing, statusSentence } from './detail-lead';
import {
  BreachPanel,
  DecisionPanel,
  DsrPanel,
  breachAuthorityKey,
  breachSubjectsKey,
} from './detail-panels';
import { NoticePanel } from '../../shared/notices/notice-panel';
import { OutputsPanel } from '../../shared/outputs/outputs-panel';
import { DsrHandling } from './dsr-handling';
import { gapParams } from './privacy-gaps';
import { privacyNavItems, privacyPermissions } from './privacy-nav';
import { ProcessorDpaCoverage } from './processor-dpa-coverage';
import { PrivacyRecordFields } from './record-fields';
import { RetentionRuns } from './retention-runs';
import { RopaLinked } from './ropa-panels';

/** Statuses that need an outcome on a data subject request. */
const OUTCOME_STATUSES = ['completed', 'rejected'];

/** One forward step of a record's workflow: the status it moves to, and its button. */
export interface NextStep {
  readonly status: string;
  readonly labelKey: string;
}

/**
 * The next step of a record, offered as the page's primary button (the full status
 * list sits in the "Mer ⋯" menu). Null when the next step is not a status change
 * (decisions, notifications, withdrawals have their own buttons).
 */
export function nextStep(register: RegisterKey, record: PrivacyRecord): NextStep | null {
  const s = record.status;
  const step = (status: string, label: string): NextStep => ({
    status,
    labelKey: `privacy.next.${label}`,
  });
  switch (register) {
    case 'ropa':
      return s === 'draft' ? step('active', 'activateRopa') : null;
    case 'dpia': {
      const d = record as Dpia;
      if (s === 'screening') {
        return d.screening_result === 'not_required'
          ? step('not_required', 'dpiaNotRequired')
          : step('in_progress', 'startDpia');
      }
      return s === 'in_progress' ? step('awaiting_decision', 'sendForDecision') : null;
    }
    case 'lba':
      return s === 'draft' ? step('awaiting_decision', 'sendForDecision') : null;
    case 'dsr': {
      const r = record as DataSubjectRequest;
      if (r.closed_at || ['completed', 'rejected', 'withdrawn'].includes(s)) {
        return null;
      }
      return r.responded_at ? step('completed', 'closeRequest') : null;
    }
    case 'breach': {
      const b = record as DataBreach;
      if (s === 'open') {
        return step('assessing', 'startAssessment');
      }
      const decided =
        b.authority_notification_required !== null && b.subjects_notification_required !== null;
      return s !== 'closed' && decided ? step('closed', 'closeBreach') : null;
    }
    case 'processor':
      return s === 'onboarding' ? step('active', 'activateProcessor') : null;
    case 'transfer':
      return s === 'draft' ? step('active', 'activateTransfer') : null;
    case 'retention':
      return s === 'draft' ? step('active', 'activateRetention') : null;
    default:
      return null;
  }
}

/** Registers whose records have their own documents (U14). */
const RECORD_OUTPUT_REGISTERS: ReadonlySet<string> = new Set(['dpia', 'transfer', 'lba', 'dsr']);

/** The breach's follow-up records (create-from-here), in the order they are usually made. */
const BREACH_FLOWS = [
  { key: 'data_breach.to_deviation', permission: 'deviations:write', icon: 'alert' },
  { key: 'data_breach.to_risk', permission: 'risk:write', icon: 'risk' },
  { key: 'data_breach.to_task', permission: 'tasks:write', icon: 'check' },
] as const;

/** The breach's notification fields, summed up in "Hovedinformasjon". */
const BREACH_DECISION_FIELDS = [
  'authority_notification_required',
  'authority_decision_reason',
  'authority_notified_at',
  'authority_reference',
  'subjects_notification_required',
  'subjects_decision_reason',
  'subjects_exemption',
  'subjects_notified_at',
];

/**
 * A privacy record (`/privacy/<segment>/:id`) of any register on the detail-page
 * anatomy (docs/ux-guide.md §2.7): header with code · register · status, the next
 * workflow step as the primary action, every status in "Mer ⋯" and the assistant in
 * "Spør KI"; "Hovedinformasjon" with a status sentence and the 2-4 fields that
 * matter for the register; the register's own panels (request deadline and handling,
 * breach clock and notices, DPIA decision, DPA coverage, deletion runs, what supports
 * a processing activity); the other fields with empty ones hidden; and one
 * "Oppfølging" card with what is missing, requirements, connections and metadata.
 */
@Component({
  selector: 'app-privacy-register-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WhyItMatters,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    LocalDayPipe,
    EntityTasks,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    PromptDialog,
    StatusBadge,
    BreachPanel,
    NoticePanel,
    OutputsPanel,
    DecisionPanel,
    DsrPanel,
    DsrHandling,
    PrivacyRecordFields,
    ProcessorDpaCoverage,
    RetentionRuns,
    RopaLinked,
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
          <app-error-state [bodyKey]="loadError()" (retry)="reload()" />
          <a
            [routerLink]="['/privacy', def().segment]"
            class="mt-4 inline-block text-ui font-semibold text-accent"
          >
            {{ 'privacy.common.backToList' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (record(); as r) {
          <app-record-detail-layout
            [anatomy]="true"
            [entityType]="def().entityType"
            [entityId]="r.id"
            [title]="r.title"
            [breadcrumbs]="breadcrumbs()"
            [settingsLink]="canManage() ? settingsLink : null"
            [tabs]="tabs()"
            [canEdit]="canWrite()"
            [requirementsPanel]="true"
            [fieldLabels]="fieldLabels()"
            [missing]="missing()"
          >
            <span
              meta
              class="flex flex-wrap items-center gap-x-2 gap-y-1"
              data-testid="privacy-meta"
            >
              <span class="font-mono font-semibold">{{ r.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'privacy.registers.' + def().key + '.name' | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="toneValue(r.status)"
                [labelKey]="statusKey(r.status)"
                data-testid="privacy-status"
              />
              @if (reviewOverdue()) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="privacy.common.reviewOverdueBadge"
                />
              }
            </span>

            @if (canWrite() && next(); as step) {
              <app-button
                primary
                [loading]="busy()"
                (click)="applyStatus(step.status)"
                data-testid="privacy-next-step"
              >
                {{ step.labelKey | transloco }}
              </app-button>
            }
            @if (editLink() && next()) {
              <a
                secondary
                [routerLink]="editLink()"
                class="inline-flex h-9 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                data-testid="privacy-edit"
              >
                {{ 'privacy.common.edit' | transloco }}
              </a>
            }
            @if (editLink() && !next()) {
              <a
                primary
                [routerLink]="editLink()"
                class="inline-flex h-9 items-center rounded-tile bg-accent px-3.5 text-ui font-semibold text-white hover:bg-accent-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
                data-testid="privacy-edit"
              >
                {{ 'privacy.common.edit' | transloco }}
              </a>
            }

            <ng-container ngProjectAs="[overflow]">
              @for (s of canWrite() ? statusOptions() : []; track s) {
                <button
                  appMenuItem
                  type="button"
                  (click)="applyStatus(s)"
                  [attr.data-testid]="'status-to-' + s"
                >
                  {{
                    'privacy.detail.setStatus' | transloco: { status: (statusKey(s) | transloco) }
                  }}
                </button>
              }
            </ng-container>
            @if (canDelete()) {
              <button
                overflow
                appMenuItem
                type="button"
                [danger]="true"
                (click)="deleting.set(true)"
                data-testid="privacy-delete"
              >
                {{ 'privacy.common.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAbout()" data-testid="privacy-ask">
              <app-icon name="spark" [size]="15" />
              {{ 'privacy.ask.button' | transloco }}
            </button>
            @if (def().key === 'breach' && canWrite()) {
              <button
                appMenuItem
                ask
                type="button"
                (click)="breachPanel()?.draftAssessment()"
                data-testid="privacy-ai-breach"
              >
                <app-icon name="spark" [size]="15" />
                {{ 'privacy.ai.draftBreach' | transloco }}
              </button>
            }
            @if (def().key === 'dsr' && dsrHandling()?.canDraft()) {
              <button
                appMenuItem
                ask
                type="button"
                (click)="dsrHandling()?.draftReply()"
                data-testid="privacy-ai-reply"
              >
                <app-icon name="spark" [size]="15" />
                {{ 'privacy.ai.draftReply' | transloco }}
              </button>
            }

            <app-module-nav nav labelKey="modules.names.privacy" [items]="nav()" />
            <app-help-strip help scope="privacy" page="detail" [lesson]="def().lesson" />

            <app-record-lead record-lead [fillLink]="editLink()">
              <div status class="mb-5 flex flex-col gap-2 *:mb-0">
                @if (sentence(); as st) {
                  <app-record-status-line [tone]="st.tone">
                    {{ st.key | transloco: st.params }}
                  </app-record-status-line>
                }
                @if (priorConsultation()) {
                  <app-record-status-line tone="warn">
                    {{ 'privacy.lead.priorConsultation' | transloco }}
                  </app-record-status-line>
                }
                @if (statusHint(); as hint) {
                  <p class="text-ui text-fg-muted" data-testid="status-hint">
                    {{ hint | transloco }}
                  </p>
                }
                @if (countryStatus(); as cs) {
                  <p
                    class="flex flex-wrap items-center gap-2 text-ui text-fg"
                    data-testid="country-status"
                  >
                    <app-status-badge
                      [meaning]="cs.status === 'third_country' ? 'lifecycle' : 'compliance'"
                      [value]="
                        cs.status === 'third_country'
                          ? 'due'
                          : cs.status === 'unknown'
                            ? 'unknown'
                            : 'met'
                      "
                      [labelKey]="countryStatusKey(cs.status)"
                    />
                    <span class="text-fg-muted">
                      {{
                        'privacy.countryStatus.explain.' + cs.status
                          | transloco: { country: cs.name }
                      }}
                    </span>
                  </p>
                }
              </div>
              <app-privacy-record-fields
                mode="lead"
                [register]="def()"
                [record]="r"
                [lead]="lead()"
              />
              @if (def().key === 'breach') {
                <app-field-item
                  size="lead"
                  labelKey="privacy.lead.breach.authority"
                  [value]="breachAuthority()"
                  [multiline]="true"
                  data-testid="authority-decision"
                />
                <app-field-item
                  size="lead"
                  labelKey="privacy.lead.breach.subjects"
                  [value]="breachSubjects()"
                  [multiline]="true"
                  data-testid="subjects-decision"
                />
              }
            </app-record-lead>

            <div class="flex flex-col gap-6">
              @if (actionError(); as e) {
                <app-alert tone="error" data-testid="action-error">
                  {{ e.key | transloco: { fields: e.fields } }}
                </app-alert>
              }

              @switch (def().key) {
                @case ('ropa') {
                  <app-privacy-ropa-linked [ropaId]="r.id" />
                }
                @case ('dsr') {
                  @if (!asDsr().closed_at) {
                    <app-privacy-dsr-panel
                      [request]="asDsr()"
                      [canWrite]="canWrite()"
                      (changed)="record.set($event)"
                    />
                  }
                  <app-privacy-dsr-handling
                    #dsrHandling
                    [request]="asDsr()"
                    [canWrite]="canWrite()"
                    (changed)="record.set($event)"
                  />
                }
                @case ('breach') {
                  <app-privacy-breach-panel
                    #breachPanel
                    [breach]="asBreach()"
                    [canWrite]="canWrite()"
                  />
                  <app-notice-panel
                    [path]="'privacy/breaches/' + asBreach().id + '/notices'"
                    [entityId]="asBreach().id"
                    [version]="asBreach().updated_at"
                    [canSave]="canWrite()"
                  />
                  @if (breachFlows().length) {
                    <app-card>
                      <h2 class="mb-1 font-display text-card font-bold text-fg">
                        {{ 'privacy.breach.followUpTitle' | transloco }}
                      </h2>
                      <p class="mb-3 text-ui text-fg-muted">
                        {{ 'privacy.breach.followUpIntro' | transloco }}
                      </p>
                      <div class="flex flex-wrap gap-2" data-testid="breach-follow-up">
                        @for (f of breachFlows(); track f.key) {
                          <app-button
                            variant="secondary"
                            size="sm"
                            [disabled]="flows.starting() !== null"
                            (click)="startFlow(f.key)"
                            [attr.data-testid]="'flow-' + f.key"
                          >
                            <app-icon [name]="f.icon" [size]="14" />
                            {{ 'kit.flows.' + f.key | transloco }}
                          </app-button>
                        }
                      </div>
                    </app-card>
                  }
                }
                @case ('dpia') {
                  @if (showDecision()) {
                    <app-privacy-decision-panel
                      register="dpia"
                      [record]="asDpia()"
                      [canApprove]="canApprove()"
                      (changed)="record.set($event)"
                    />
                  }
                }
                @case ('lba') {
                  @if (showDecision()) {
                    <app-privacy-decision-panel
                      register="lba"
                      [record]="asLba()"
                      [canApprove]="canApprove()"
                      (changed)="record.set($event)"
                    />
                  }
                }
                @case ('processor') {
                  <app-privacy-processor-dpa-coverage [processorId]="r.id" />
                }
                @case ('retention') {
                  <app-privacy-retention-runs
                    [schedule]="asRetention()"
                    [canWrite]="canWrite()"
                    [openForm]="executeOnArrival"
                    (logged)="reload()"
                  />
                }
              }

              @if (risks().length) {
                <app-card>
                  <h2 class="mb-3 font-display text-card font-bold text-fg">
                    {{ 'privacy.fields.risks' | transloco }}
                  </h2>
                  <ul class="flex flex-col gap-2" data-testid="dpia-risks">
                    @for (risk of risks(); track $index) {
                      <li class="rounded-tile border border-border p-3 text-ui">
                        <p class="text-fg">{{ risk.description }}</p>
                        <p class="mt-1 flex flex-wrap gap-2 text-fg-muted">
                          <span>{{
                            'privacy.dpia.levelSummary'
                              | transloco
                                : {
                                    likelihood:
                                      ('privacy.options.level.' + risk.likelihood | transloco),
                                    severity:
                                      ('privacy.options.level.' + risk.severity | transloco),
                                  }
                          }}</span>
                          @if (risk.residual) {
                            <span>{{
                              'privacy.dpia.residualSummary'
                                | transloco
                                  : {
                                      level: ('privacy.options.level.' + risk.residual | transloco),
                                    }
                            }}</span>
                          }
                        </p>
                        @if (risk.mitigation) {
                          <p class="mt-1 text-fg-muted">{{ risk.mitigation }}</p>
                        }
                        @if (canStart('risk:write')) {
                          <button
                            type="button"
                            class="mt-2 inline-flex items-center gap-1 text-meta font-semibold text-accent hover:underline disabled:opacity-60"
                            [disabled]="flows.starting() !== null"
                            (click)="startFlow('dpia.to_risk')"
                            data-testid="dpia-risk-to-register"
                          >
                            <app-icon name="risk" [size]="13" />
                            {{ 'privacy.dpia.toRiskRegister' | transloco }}
                          </button>
                        }
                      </li>
                    }
                  </ul>
                  @if (canStart('tasks:write')) {
                    <app-button
                      class="mt-3 inline-block"
                      variant="secondary"
                      size="sm"
                      [disabled]="flows.starting() !== null"
                      (click)="startFlow('dpia.to_task')"
                      data-testid="dpia-measures-task"
                    >
                      {{ 'privacy.dpia.measuresToTask' | transloco }}
                    </app-button>
                  }
                </app-card>
              }

              <app-card>
                <app-record-details [columns]="1" [fillLink]="editLink()">
                  <app-privacy-record-fields
                    [register]="def()"
                    [record]="r"
                    [lead]="lead()"
                    [skip]="skipFields()"
                  />
                </app-record-details>
              </app-card>

              @if (hasRecordOutputs()) {
                <app-card data-testid="record-outputs">
                  <h2 class="mb-1 font-display text-card font-bold text-fg">
                    {{ 'privacy.detail.outputs.title' | transloco }}
                  </h2>
                  <p class="mb-3 text-ui text-fg-muted">
                    {{ 'privacy.detail.outputs.hint' | transloco }}
                  </p>
                  <app-outputs-panel
                    module="privacy"
                    [entityType]="def().entityType"
                    [entityId]="r.id"
                  />
                </app-card>
              }

              @if (def().key === 'consent' && canWrite() && r.status === 'active') {
                <app-card>
                  <p class="mb-2 text-ui text-fg-muted">
                    {{ 'privacy.consent.withdrawHint' | transloco }}
                  </p>
                  <app-button
                    variant="secondary"
                    size="sm"
                    (click)="withdrawing.set(true)"
                    data-testid="consent-withdraw"
                  >
                    {{ 'privacy.consent.withdraw' | transloco }}
                  </app-button>
                </app-card>
              }
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="def().entityType"
                [entityId]="r.id"
                [canCreate]="canWrite()"
                [entityLabel]="r.code"
              />
            </div>

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="privacy.lead.meta.owner"
                [value]="ownerName()"
              />
              @if (hasReview()) {
                <app-field-item
                  layout="inline"
                  labelKey="privacy.fields.review_due_at"
                  [keepEmpty]="true"
                  emptyKey="kit.detail.meta.notPlanned"
                  emptyActionKey="kit.detail.meta.plan"
                  [emptyLink]="editLink()"
                >
                  @if (reviewDue(); as due) {
                    <span [class.text-warn-ink]="reviewOverdue()">{{ due | localDay }}</span>
                  }
                </app-field-item>
              }
              <app-field-item
                layout="inline"
                labelKey="privacy.lead.meta.updated"
                [value]="r.updated_at | localDate"
              />
            </app-record-meta>

            <div aside-learn>
              <app-why-it-matters scope="privacy" [page]="def().key" />
            </div>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'privacy.detail.deleteTitle' | transloco: { code: r.code }"
            [message]="'privacy.detail.deleteMessage' | transloco"
            [confirmLabel]="'privacy.common.delete' | transloco"
            [cancelLabel]="'privacy.common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
          <app-prompt-dialog
            [open]="askOutcome()"
            [title]="'privacy.dsr.outcomeTitle' | transloco"
            [message]="'privacy.dsr.outcomeMessage' | transloco"
            [label]="'privacy.fields.outcome' | transloco"
            [confirmLabel]="'privacy.detail.applyStatus' | transloco"
            [cancelLabel]="'privacy.common.cancel' | transloco"
            [required]="true"
            [maxLength]="10000"
            [busy]="busy()"
            (confirmed)="patchStatus($event)"
            (cancelled)="askOutcome.set(false)"
          />
          <app-confirm-dialog
            [open]="withdrawing()"
            [title]="'privacy.consent.withdrawTitle' | transloco"
            [message]="'privacy.consent.withdrawMessage' | transloco"
            [confirmLabel]="'privacy.consent.withdraw' | transloco"
            [cancelLabel]="'privacy.common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="withdraw()"
            (cancelled)="withdrawing.set(false)"
          />
        }
      }
    }
  `,
})
export class PrivacyRegisterDetail {
  private readonly api = inject(PrivacyApi);
  private readonly standards = inject(StandardsApi);
  private readonly refs = inject(PrivacyRefsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly askPanel = inject(AskPanelService);
  private readonly perms = privacyPermissions();
  protected readonly flows = inject(CreateFlowService);

  readonly register = input.required<RegisterKey>();
  readonly id = input.required<string>();

  protected readonly def = computed(() => REGISTERS[this.register()]);
  protected readonly nav = privacyNavItems(this.perms);
  protected readonly settingsLink = PRIVACY_SETTINGS_LINK;
  protected readonly statusKey = statusKey;
  protected readonly toneValue = statusToneValue;
  protected readonly countryStatusKey = countryStatusKey;
  /** `?execute=1`: open the deletion-run form of a retention rule. */
  protected readonly executeOnArrival =
    inject(ActivatedRoute).snapshot.queryParamMap.get('execute') === '1';

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly loadError = signal('privacy.common.loadFailed');
  protected readonly record = signal<PrivacyRecord | null>(null);
  protected readonly gaps = signal<readonly PrivacyGap[]>([]);
  private readonly requirementRefs = signal<readonly string[]>([]);
  protected readonly busy = signal(false);
  protected readonly deleting = signal(false);
  protected readonly withdrawing = signal(false);
  protected readonly askOutcome = signal(false);
  private readonly pendingStatus = signal('');
  protected readonly actionError = signal<{ key: string; fields: string } | null>(null);

  protected readonly canWrite = computed(() => this.perms().has(this.def().writePermission));
  protected readonly canApprove = computed(() => this.perms().has(PERM_APPROVE));
  protected readonly canManage = computed(() => this.perms().has(PERM_MANAGE));
  protected readonly canDelete = computed(
    () =>
      this.perms().has(PERM_MANAGE) &&
      this.def().deletePermissions.every((p) => this.perms().has(p)),
  );
  /** Decided DPIAs / assessments are changed by moving them back to draft, not edited in place. */
  protected readonly editable = computed(() => {
    const status = this.record()?.status;
    return !(
      (this.def().key === 'dpia' || this.def().key === 'lba') &&
      (status === 'approved' || status === 'rejected')
    );
  });

  protected readonly breadcrumbs = computed<readonly Breadcrumb[]>(() => [
    PRIVACY_CRUMB,
    registerCrumb(this.def()),
  ]);
  protected readonly tabs = computed<readonly RecordTab[]>(() => [
    'details',
    'tasks',
    'related',
    'activity',
    'comments',
    'attachments',
    ...(this.def().revisions ? (['revisions'] as const) : []),
  ]);
  protected readonly fieldLabels = computed(() => revisionFieldLabels(this.def()));

  protected readonly next = computed(() => {
    const r = this.record();
    return r ? nextStep(this.def().key, r) : null;
  });

  /** Every other status the user may set (in "Mer ⋯"), minus the primary next step. */
  protected readonly statusOptions = computed(() => {
    const r = this.record();
    if (!r) {
      return [];
    }
    const next = this.next()?.status;
    return this.def().settableStatuses.filter((s) => s !== r.status && s !== next);
  });

  /** What blocks or explains the next status change (shown only while it applies). */
  protected readonly statusHint = computed(() => {
    const r = this.record();
    if (!r || !this.canWrite() || this.def().closedStatuses.includes(r.status)) {
      return null;
    }
    const key = this.def().key;
    if (key === 'dpia' && r.status === 'screening') {
      return `privacy.dpia.screeningOutcome.${(r as Dpia).screening_result}`;
    }
    if (key === 'breach' && !this.next()) {
      return 'privacy.detail.statusHint.breach';
    }
    if (key === 'processor' && r.status === 'onboarding') {
      return 'privacy.detail.statusHint.processor';
    }
    if (key === 'transfer' && r.status === 'draft') {
      return 'privacy.detail.statusHint.transfer';
    }
    if (key === 'dsr' && !this.next()) {
      return 'privacy.detail.statusHint.dsr';
    }
    return null;
  });

  protected readonly ownerName = computed(() => this.refs.userName(this.record()?.owner_user_id));

  protected readonly asDsr = computed(() => this.record() as DataSubjectRequest);
  protected readonly asBreach = computed(() => this.record() as DataBreach);
  protected readonly asDpia = computed(() => this.record() as Dpia);
  protected readonly asLba = computed(() => this.record() as LegalBasisAssessment);
  protected readonly asRetention = computed(() => this.record() as RetentionSchedule);
  protected readonly risks = computed<readonly DpiaRisk[]>(() =>
    this.def().key === 'dpia' ? ((this.record() as Dpia | null)?.risks ?? []) : [],
  );

  /** Facts a panel or the lead of the page already shows. */
  protected readonly skipFields = computed<readonly string[]>(() => {
    const r = this.record();
    switch (this.def().key) {
      case 'breach':
        return [
          ...BREACH_DECISION_FIELDS,
          ...(r?.status === 'closed' ? [] : ['aware_at', 'notification_deadline']),
        ];
      case 'dpia':
        return [
          'screening_result',
          'prior_consultation_required',
          'decided_by',
          'decided_at',
          'decision_comment',
        ];
      case 'lba':
        return ['decided_by', 'decided_at', 'decision_comment'];
      case 'dsr':
        return (r as DataSubjectRequest | null)?.closed_at
          ? ['due_at', 'extended_due_at']
          : ['received_at', 'due_at', 'extended_due_at', 'extension_reason'];
      case 'retention':
        return ['next_execution_due_at', 'execution_interval_months'];
      default:
        return [];
    }
  });

  /** The "Hovedinformasjon" fields of the register. */
  protected readonly lead = computed(() => LEAD_FIELDS[this.def().key]);

  /** "Status – what it means" at the top of "Hovedinformasjon". */
  protected readonly sentence = computed(() => {
    const r = this.record();
    if (!r) {
      return null;
    }
    const locale = this.language.locale();
    return statusSentence(this.def().key, r, {
      day: (iso) => (iso ? formatLocalDay(iso, 'mediumDate', locale) : ''),
      moment: (iso) => (iso ? formatLocalDate(iso, 'medium', locale) : ''),
      userName: (id) => this.refs.userName(id) ?? this.t('privacy.common.someone'),
      country: (code) => (code ? locationName(code, this.language) : ''),
      status: (status) => this.t(statusKey(status)),
    });
  });

  /** A DPIA whose residual risk is still high: Art. 36 prior consultation. */
  protected readonly priorConsultation = computed(() => {
    const d = this.record() as Dpia | null;
    return (
      this.def().key === 'dpia' &&
      !!d?.residual_risk &&
      d.prior_consultation_required &&
      d.status !== 'rejected'
    );
  });

  /** The decision panel while a decision is due or once it is made. */
  protected readonly showDecision = computed(() => {
    const r = this.record() as Dpia | LegalBasisAssessment | null;
    return !!r && (r.status === 'awaiting_decision' || !!r.decided_at);
  });

  /** The breach's notification decisions, in words, for "Hovedinformasjon". */
  protected readonly breachAuthority = computed(() => {
    const b = this.record() as DataBreach | null;
    if (!b || this.def().key !== 'breach') {
      return null;
    }
    const locale = this.language.locale();
    const parts = [
      this.t(breachAuthorityKey(b), {
        date: b.authority_notified_at
          ? formatLocalDate(b.authority_notified_at, 'medium', locale)
          : '',
      }),
    ];
    if (b.authority_reference) {
      parts.push(this.t('privacy.breach.reference', { ref: b.authority_reference }));
    }
    if (b.authority_notification_required === false && b.authority_decision_reason) {
      parts.push(b.authority_decision_reason);
    }
    return parts.join('\n');
  });

  protected readonly breachSubjects = computed(() => {
    const b = this.record() as DataBreach | null;
    if (!b || this.def().key !== 'breach') {
      return null;
    }
    const locale = this.language.locale();
    const parts = [
      this.t(breachSubjectsKey(b), {
        date: b.subjects_notified_at
          ? formatLocalDate(b.subjects_notified_at, 'medium', locale)
          : '',
      }),
    ];
    if (b.subjects_exemption) {
      parts.push(this.t(`privacy.options.subjectsExemption.${b.subjects_exemption}`));
    }
    if (b.subjects_notification_required === false && b.subjects_decision_reason) {
      parts.push(b.subjects_decision_reason);
    }
    return parts.join('\n');
  });

  /** The edit page, when the user may edit the record now. */
  protected readonly editLink = computed<readonly unknown[] | null>(() => {
    const r = this.record();
    return r && this.canWrite() && this.editable()
      ? ['/privacy', this.def().segment, r.id, 'edit']
      : null;
  });

  /** Whether the register has a review date (shown in the card's metadata). */
  protected readonly hasReview = computed(() =>
    this.def().fields.some((f) => f.key === 'review_due_at'),
  );
  protected readonly reviewDue = computed(
    () => (this.record() as { review_due_at?: string | null } | null)?.review_due_at ?? null,
  );
  protected readonly reviewOverdue = computed(() => {
    const r = this.record();
    return (
      !!r &&
      this.hasReview() &&
      !this.def().closedStatuses.includes(r.status) &&
      isPastDay(this.reviewDue())
    );
  });

  /** "Oppfølging": what is missing for this record, each line a link. */
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const r = this.record();
    if (!r) {
      return [];
    }
    const def = this.def();
    return privacyMissing({
      register: def.key,
      record: r,
      gaps: this.canWrite() ? this.gaps() : [],
      gapParams: (gap) => gapParams(gap, this.language),
      thisRecord: this.t('privacy.missing.thisRecord'),
      fieldList: (keys) =>
        keys
          .map((k) => {
            const f = def.fields.find((x) => x.key === k);
            return this.t(f ? fieldLabelKey(f) : `privacy.fields.${k}`);
          })
          .join(', '),
      editLink: this.editLink(),
      closed: def.closedStatuses.includes(r.status),
      reviewOverdue: this.reviewOverdue(),
      reviewDue: this.reviewDue()
        ? formatLocalDay(this.reviewDue()!, 'mediumDate', this.language.locale())
        : '',
    });
  });

  protected readonly breachPanel = viewChild<BreachPanel>('breachPanel');
  protected readonly dsrHandling = viewChild<DsrHandling>('dsrHandling');

  /** The chapter V status of the processor's or transfer's country. */
  protected readonly countryStatus = computed(() => {
    const r = this.record();
    const key = this.def().key;
    if (!r || (key !== 'processor' && key !== 'transfer')) {
      return null;
    }
    const code =
      key === 'processor'
        ? (r as Processor).country
        : (r as TransferAssessment).destination_country;
    const status = (r as Processor | TransferAssessment).country_status;
    if (!code || !status) {
      return null;
    }
    return { status, name: locationName(code, this.language) };
  });

  /** U14: records with their own documents (DPIA, TIA and LIA reports, request letters). */
  protected readonly hasRecordOutputs = computed(() => RECORD_OUTPUT_REGISTERS.has(this.def().key));
  protected readonly breachFlows = computed(() =>
    this.def().key === 'breach' ? BREACH_FLOWS.filter((f) => this.perms().has(f.permission)) : [],
  );

  private request = new Subscription();
  private side = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.side.unsubscribe();
    });
    this.refs.ensureMembers();
    providePageContext(() => {
      const r = this.record();
      return {
        module: 'privacy',
        entityType: this.def().entityType,
        entityId: this.id(),
        view: 'detail',
        // Personal-data registers never put the record title in the context.
        title: r ? (this.def().personal ? r.code : `${r.code} ${r.title}`) : null,
        requirements: this.requirementRefs(),
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const register = this.register();
      untracked(() => this.load(orgId, register, id));
    });
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.language.translate(key, params);
  }

  protected canStart(permission: string): boolean {
    return this.perms().has(permission);
  }

  protected startFlow(key: string): void {
    const r = this.record();
    if (r) {
      void this.flows.start(key, this.def().entityType, r.id);
    }
  }

  protected askAbout(): void {
    const r = this.record();
    if (r) {
      this.askPanel.askAbout(this.t('privacy.ask.summarise', { code: r.code }));
    }
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.register(), this.id());
  }

  private load(orgId: string | null, register: RegisterKey, id: string): void {
    this.request.unsubscribe();
    this.side.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!this.record() || this.record()!.id !== id) {
      this.state.set('loading');
    }
    const def = REGISTERS[register];
    this.request = this.api.get(orgId, def, id).subscribe({
      next: (record) => {
        this.record.set(record);
        this.state.set('ready');
      },
      error: (err) => {
        this.loadError.set(privacyError(err).key);
        this.state.set('error');
      },
    });
    this.side = new Subscription();
    // What is missing for this record (gaps are only computed for some registers).
    this.side.add(
      this.api
        .gaps(orgId, { entityId: id })
        .pipe(catchError(() => of({ items: [], total: 0, by_kind: {} })))
        .subscribe((g) => this.gaps.set(g.items.filter((x) => x.entity_id === id))),
    );
    if (this.perms().has('standards:read')) {
      this.side.add(
        this.standards
          .listLinks(orgId, { entity_type: def.entityType, entity_id: id })
          .pipe(catchError(() => of([])))
          .subscribe((links) =>
            this.requirementRefs.set(
              links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
            ),
          ),
      );
    }
  }

  protected applyStatus(status: string): void {
    const r = this.record();
    if (!r || !status || status === r.status) {
      return;
    }
    this.pendingStatus.set(status);
    if (
      this.def().key === 'dsr' &&
      OUTCOME_STATUSES.includes(status) &&
      !(r as DataSubjectRequest).outcome
    ) {
      this.askOutcome.set(true);
      return;
    }
    this.patchStatus(null);
  }

  protected patchStatus(outcome: string | null): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r) {
      return;
    }
    const body: Record<string, unknown> = { status: this.pendingStatus() };
    if (outcome?.trim()) {
      body['outcome'] = outcome.trim();
    }
    this.mutate(this.api.update(orgId, this.def(), r.id, body), 'privacy.notices.statusChanged');
  }

  protected withdraw(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record() as ConsentRecord | null;
    if (!orgId || !r) {
      return;
    }
    this.mutate(
      this.api.update(orgId, this.def(), r.id, {
        withdrawn_at: new Date().toISOString().slice(0, 19),
      }),
      'privacy.notices.withdrawn',
    );
  }

  private mutate(call: ReturnType<PrivacyApi['update']>, notice: string): void {
    this.busy.set(true);
    this.actionError.set(null);
    call.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.askOutcome.set(false);
        this.withdrawing.set(false);
        this.record.set(saved);
        this.notify.success(notice, {
          code: saved.code,
          status: this.t(statusKey(saved.status)),
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.askOutcome.set(false);
        this.withdrawing.set(false);
        const e = privacyError(err);
        this.actionError.set({
          key: e.key,
          fields: e.fields.map((f) => this.t(`privacy.fields.${f}`)).join(', '),
        });
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r) {
      return;
    }
    this.busy.set(true);
    this.api.remove(orgId, this.def(), r.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(false);
        this.refs.invalidate(this.def().key);
        this.notify.success('privacy.notices.deleted', { code: r.code });
        void this.router.navigate(['/privacy', this.def().segment]);
      },
      error: (err) => {
        this.busy.set(false);
        this.deleting.set(false);
        this.actionError.set({ key: privacyError(err).key, fields: '' });
      },
    });
  }
}
