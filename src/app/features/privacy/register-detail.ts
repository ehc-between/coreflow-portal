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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, of } from 'rxjs';
import { AiAvailability } from '../../core/ai/ai-availability';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { AskPanelService } from '../ask/ask-panel.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { locationName } from '../../shared/locale/countries';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
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
  RopaEntry,
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
  registerCrumb,
  revisionFieldLabels,
} from './data/privacy-registers';
import { BreachPanel, DecisionPanel, DpiaSteps, DsrPanel } from './detail-panels';
import { NoticePanel } from '../../shared/notices/notice-panel';
import { DsrHandling } from './dsr-handling';
import { PrivacyGaps } from './privacy-gaps';
import { privacyNavItems, privacyPermissions } from './privacy-nav';
import { ProcessorDpaCoverage } from './processor-dpa-coverage';
import { PrivacyRecordFields } from './record-fields';
import { RetentionRuns } from './retention-runs';
import { RopaCompletenessCard, RopaLinked } from './ropa-panels';

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

/** The breach's follow-up records (create-from-here), in the order they are usually made. */
const BREACH_FLOWS = [
  { key: 'data_breach.to_deviation', permission: 'deviations:write', icon: 'alert' },
  { key: 'data_breach.to_risk', permission: 'risk:write', icon: 'risk' },
  { key: 'data_breach.to_task', permission: 'tasks:write', icon: 'check' },
] as const;

/**
 * A privacy record (`/privacy/<segment>/:id`) of any register on the shared detail
 * frame: header with code · register · status, the next workflow step as the primary
 * action and every status in "Mer ⋯"; the register's own panels (request deadline and
 * handling checklist, breach clock and follow-up, DPIA steps and decision, DPA
 * coverage, deletion runs, the Art. 30 completeness and what points to a processing
 * activity); what is missing for this record; the fields by section with links as
 * record chips; requirements, connections and the record kit tabs.
 */
@Component({
  selector: 'app-privacy-register-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    WhyItMatters,
    RecordDetailLayout,
    EntityTasks,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    PromptDialog,
    StatusBadge,
    BreachPanel,
    NoticePanel,
    DecisionPanel,
    DpiaSteps,
    DsrPanel,
    DsrHandling,
    PrivacyGaps,
    PrivacyRecordFields,
    ProcessorDpaCoverage,
    RetentionRuns,
    RopaCompletenessCard,
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
            [entityType]="def().entityType"
            [entityId]="r.id"
            [title]="r.title"
            [breadcrumbs]="breadcrumbs()"
            [settingsLink]="canManage() ? settingsLink : null"
            [tabs]="tabs()"
            [canEdit]="canWrite()"
            [requirementsPanel]="true"
            [fieldLabels]="fieldLabels()"
          >
            <span
              meta
              class="flex flex-wrap items-center gap-x-2 gap-y-1"
              data-testid="privacy-meta"
            >
              <span class="font-mono font-semibold">{{ r.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'privacy.registers.' + def().key + '.name' | transloco }}</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="toneValue(r.status)"
                [labelKey]="statusKey(r.status)"
                data-testid="privacy-status"
              />
              @if (ownerName(); as name) {
                <span class="text-meta text-fg-muted">{{
                  'privacy.list.owner' | transloco: { name }
                }}</span>
              }
            </span>

            @if (canWrite() && next(); as step) {
              <app-button
                primary
                size="sm"
                [loading]="busy()"
                (click)="applyStatus(step.status)"
                data-testid="privacy-next-step"
              >
                {{ step.labelKey | transloco }}
              </app-button>
            }
            @if (canWrite() && editable() && next()) {
              <a
                secondary
                [routerLink]="['/privacy', def().segment, r.id, 'edit']"
                class="inline-flex h-9 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                data-testid="privacy-edit"
              >
                {{ 'privacy.common.edit' | transloco }}
              </a>
            }
            @if (canWrite() && editable() && !next()) {
              <a
                primary
                [routerLink]="['/privacy', def().segment, r.id, 'edit']"
                class="inline-flex h-9 items-center rounded-tile bg-accent px-3.5 text-ui font-semibold text-white hover:bg-accent-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
                data-testid="privacy-edit"
              >
                {{ 'privacy.common.edit' | transloco }}
              </a>
            }
            @if (!ai.unavailable()) {
              <app-button
                secondary
                variant="secondary"
                size="sm"
                (click)="askAbout()"
                data-testid="privacy-ask"
              >
                <app-icon name="spark" [size]="14" />
                {{ 'privacy.ask.button' | transloco }}
              </app-button>
            }
            <app-watch-button secondary [entityType]="def().entityType" [entityId]="r.id" />

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

            <app-module-nav
              nav
              labelKey="modules.names.privacy"
              moreLabelKey="privacy.nav.more"
              [items]="nav()"
            />
            <app-help-strip help scope="privacy" page="detail" [lesson]="def().lesson" />

            <div class="flex flex-col gap-6">
              @if (actionError(); as e) {
                <app-alert tone="error" data-testid="action-error">
                  {{ e.key | transloco: { fields: e.fields } }}
                </app-alert>
              }

              @if (statusHint(); as hint) {
                <p class="text-ui text-fg-muted" data-testid="status-hint">
                  {{ hint | transloco }}
                </p>
              }

              @switch (def().key) {
                @case ('ropa') {
                  @if (asRopa().completeness; as c) {
                    <app-privacy-ropa-completeness [completeness]="c" />
                  }
                }
                @case ('dsr') {
                  <app-privacy-dsr-panel
                    [request]="asDsr()"
                    [canWrite]="canWrite()"
                    (changed)="record.set($event)"
                  />
                  <app-privacy-dsr-handling
                    [request]="asDsr()"
                    [canWrite]="canWrite()"
                    (changed)="record.set($event)"
                  />
                }
                @case ('breach') {
                  <app-privacy-breach-panel [breach]="asBreach()" [canWrite]="canWrite()" />
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
                  <app-privacy-dpia-steps [dpia]="asDpia()" />
                  <app-card data-section="screening">
                    <h2 class="mb-2 font-display text-card font-bold text-fg">
                      {{ 'privacy.form.sections.screening' | transloco }}
                    </h2>
                    @if (criteriaMet().length) {
                      <p class="mb-1 text-ui text-fg-muted">
                        {{ 'privacy.dpia.criteriaMet' | transloco }}
                      </p>
                      <ul class="list-disc pl-5 text-ui text-fg">
                        @for (c of criteriaMet(); track c) {
                          <li>{{ 'privacy.criteria.' + c + '.label' | transloco }}</li>
                        }
                      </ul>
                    } @else {
                      <p class="text-ui text-fg-muted">{{ 'privacy.dpia.noneMet' | transloco }}</p>
                    }
                  </app-card>
                  <app-privacy-decision-panel
                    register="dpia"
                    [record]="asDpia()"
                    [canApprove]="canApprove()"
                    (changed)="record.set($event)"
                  />
                }
                @case ('lba') {
                  <app-privacy-decision-panel
                    register="lba"
                    [record]="asLba()"
                    [canApprove]="canApprove()"
                    (changed)="record.set($event)"
                  />
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
                      'privacy.countryStatus.explain.' + cs.status | transloco: { country: cs.name }
                    }}
                  </span>
                </p>
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

              @if (gaps().length) {
                <app-privacy-gaps
                  [gaps]="gaps()"
                  [limit]="0"
                  [canFix]="canWrite()"
                  [showRecord]="false"
                  titleKey="privacy.gaps.recordTitle"
                  data-testid="record-gaps"
                />
              }

              @if (r.description) {
                <app-card>
                  <h2 class="mb-2 font-display text-card font-bold text-fg">
                    {{ 'privacy.fields.description' | transloco }}
                  </h2>
                  <p class="text-body whitespace-pre-line text-fg">{{ r.description }}</p>
                </app-card>
              }

              <app-privacy-record-fields [register]="def()" [record]="r" [skip]="skipFields()" />

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

              @if (def().key === 'ropa') {
                <app-privacy-ropa-linked [ropaId]="r.id" />
              }

              <app-why-it-matters scope="privacy" [page]="def().key" />
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="def().entityType"
                [entityId]="r.id"
                [canCreate]="canWrite()"
                [entityLabel]="r.code"
              />
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
  protected readonly ai = inject(AiAvailability);
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
    if (key === 'ropa' && r.status === 'draft') {
      return 'privacy.detail.statusHint.ropa';
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

  protected readonly asRopa = computed(() => this.record() as RopaEntry);
  protected readonly asDsr = computed(() => this.record() as DataSubjectRequest);
  protected readonly asBreach = computed(() => this.record() as DataBreach);
  protected readonly asDpia = computed(() => this.record() as Dpia);
  protected readonly asLba = computed(() => this.record() as LegalBasisAssessment);
  protected readonly asRetention = computed(() => this.record() as RetentionSchedule);
  protected readonly risks = computed<readonly DpiaRisk[]>(() =>
    this.def().key === 'dpia' ? ((this.record() as Dpia | null)?.risks ?? []) : [],
  );
  protected readonly criteriaMet = computed(() => {
    const screening = (this.record() as Dpia | null)?.screening ?? {};
    return Object.keys(screening).filter((k) => screening[k]);
  });

  /** Facts a panel of the page already shows (the breach clock, the DPIA steps). */
  protected readonly skipFields = computed<readonly string[]>(() => {
    switch (this.def().key) {
      case 'breach':
        return ['aware_at', 'notification_deadline'];
      case 'dpia': {
        const d = this.record() as Dpia | null;
        return d?.residual_risk
          ? ['screening_result', 'decided_by', 'decided_at', 'decision_comment']
          : [
              'screening_result',
              'prior_consultation_required',
              'decided_by',
              'decided_at',
              'decision_comment',
            ];
      }
      case 'lba':
        return ['decided_by', 'decided_at', 'decision_comment'];
      case 'dsr':
        return ['received_at', 'due_at', 'extended_due_at', 'extension_reason'];
      case 'retention':
        return ['next_execution_due_at', 'execution_interval_months'];
      default:
        return [];
    }
  });

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
