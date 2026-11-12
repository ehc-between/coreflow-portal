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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, map } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AttachmentsApi } from '../../core/attachments/attachments-api';
import { Attachment } from '../../core/attachments/attachment.models';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { ContractAiPanel } from './contract-ai-panel';
import { ContractKeyDates } from './contract-key-dates';
import { ContractObligations } from './contract-obligations';
import { ContractParties } from './contract-parties';
import { ContractVersions } from './contract-versions';
import { ContractWorkflowBar, WorkflowRun } from './contract-workflow-bar';
import { ContractsApi } from './data/contracts-api';
import { Contract } from './data/contract.models';
import {
  contractStatusKey,
  contractStatusTone,
  contractTypeKey,
  deadlineKindKey,
  dpaTone,
  isClosedContract,
} from './data/contract-display';
import { contractErrorKey } from './data/contract-errors';
import { ContractLessonLink } from './lesson-link';

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
export const CONTRACT_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'contracts.fields.code',
  title: 'contracts.fields.title',
  contract_type: 'contracts.fields.contractType',
  status: 'contracts.fields.status',
  description: 'contracts.fields.description',
  owner_user_id: 'contracts.fields.owner',
  department_id: 'contracts.fields.department',
  confidential: 'contracts.fields.confidential',
  processes_personal_data: 'contracts.fields.processesPersonalData',
  value_amount: 'contracts.fields.valueAmount',
  currency: 'contracts.fields.currency',
  value_period: 'contracts.fields.valuePeriod',
  start_date: 'contracts.fields.startDate',
  end_date: 'contracts.fields.endDate',
  signed_date: 'contracts.fields.signedDate',
  review_date: 'contracts.fields.reviewDate',
  notice_period_days: 'contracts.fields.noticePeriodDays',
  auto_renew: 'contracts.fields.autoRenew',
  renewal_term_months: 'contracts.fields.renewalTermMonths',
  renewal_notes: 'contracts.fields.renewalNotes',
  governing_law: 'contracts.fields.governingLaw',
  termination_date: 'contracts.fields.terminationDate',
  current_version: 'contracts.fields.currentVersion',
};

/**
 * A contract (`/contracts/:id`): register details, the approval workflow, parties,
 * key dates, versions and signed copies, AI analysis of an attached file, and DPA
 * coverage; obligations in the Tasks tab; related records, activity, comments,
 * attachments and revision history from the shared record kit.
 */
@Component({
  selector: 'app-contract-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    ContractAiPanel,
    ContractKeyDates,
    ContractObligations,
    ContractParties,
    ContractVersions,
    ContractWorkflowBar,
    ContractLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
          {{ 'contracts.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          <a
            routerLink="/contracts"
            class="mt-4 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'contracts.common.backToList' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (contract(); as c) {
          <app-record-detail-layout
            entityType="contract"
            [entityId]="c.id"
            [tabs]="tabs"
            [canEdit]="c.can_edit"
            [fieldLabels]="fieldLabels"
            backLink="/contracts"
            backLabelKey="contracts.common.backToList"
          >
            <div header>
              <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
                <span class="font-mono font-semibold">{{ c.code }}</span>
                <span>{{ typeKey(c.contract_type) | transloco }}</span>
                @if (c.current_version > 0) {
                  <span>{{
                    'contracts.versions.number' | transloco: { n: c.current_version }
                  }}</span>
                }
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="contract-heading"
              >
                {{ c.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="statusTone(c.status)" data-testid="contract-status">{{
                  statusKey(c.status) | transloco
                }}</app-badge>
                @if (c.confidential) {
                  <app-badge tone="neutral">
                    <app-icon name="lock" [size]="12" />
                    {{ 'contracts.fields.confidential' | transloco }}
                  </app-badge>
                }
                @if (c.processes_personal_data) {
                  <app-badge tone="info">{{ 'contracts.list.personalData' | transloco }}</app-badge>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button entityType="contract" [entityId]="c.id" />
              <app-ask-about [prompt]="'contracts.ask.summarise' | transloco" />
              @if (c.can_edit) {
                <a
                  [routerLink]="['/contracts', c.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="contract-edit"
                >
                  {{ 'contracts.common.edit' | transloco }}
                </a>
              }
              @if (c.can_delete) {
                <app-button variant="ghost" size="sm" (click)="deleting.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'contracts.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-6">
              <app-guide-intro scope="contracts" page="detail" />

              @if (closed()) {
                <app-alert tone="info">
                  {{
                    'contracts.detail.closedNotice'
                      | transloco: { status: (statusKey(c.status) | transloco) }
                  }}
                </app-alert>
              }

              @if (c.allowed_actions.length) {
                <app-card>
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p class="text-[13px] text-fg-muted">
                      {{ 'contracts.workflow.hint.' + c.status | transloco }}
                    </p>
                    <app-contract-workflow-bar
                      [contract]="c"
                      [busy]="acting()"
                      (run)="runAction($event)"
                    />
                  </div>
                </app-card>
              }

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'contracts.detail.summary' | transloco }}
                </h2>
                @if (c.description) {
                  <p class="mb-4 text-[13.5px] whitespace-pre-line text-fg">{{ c.description }}</p>
                }
                <dl
                  class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div>
                    <dt class="text-fg-subtle">{{ 'contracts.fields.owner' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ c.owner?.name ?? ('contracts.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'contracts.fields.counterparties' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        c.counterparties.length
                          ? c.counterparties.join(', ')
                          : ('contracts.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'contracts.fields.value' | transloco }}</dt>
                    <dd class="text-fg">
                      @if (c.value_amount) {
                        {{ c.value_amount | localNumber: '1.0-2' }} {{ c.currency ?? '' }}
                        @if (c.value_period) {
                          · {{ 'contracts.valuePeriods.' + c.value_period | transloco }}
                        }
                      } @else {
                        {{ 'contracts.common.none' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'contracts.fields.startDate' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        c.start_date
                          ? (c.start_date | localDay)
                          : ('contracts.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'contracts.fields.endDate' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        c.end_date ? (c.end_date | localDay) : ('contracts.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'contracts.fields.signedDate' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        c.signed_date
                          ? (c.signed_date | localDay)
                          : ('contracts.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="flex items-center gap-1 text-fg-subtle">
                      {{ 'contracts.fields.noticeDeadline' | transloco }}
                      <app-ask-about
                        [prompt]="'contracts.ask.noticeDeadline' | transloco"
                        field="notice_deadline"
                      />
                    </dt>
                    <dd class="text-fg">
                      {{
                        c.notice_deadline
                          ? (c.notice_deadline | localDay)
                          : ('contracts.common.none' | transloco)
                      }}
                      @if (c.notice_period_days !== null) {
                        <span class="text-fg-subtle">
                          ({{
                            'contracts.detail.noticeDays'
                              | transloco: { days: c.notice_period_days }
                          }})
                        </span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'contracts.fields.renewal' | transloco }}</dt>
                    <dd class="text-fg">
                      @if (c.auto_renew) {
                        {{
                          c.renewal_term_months
                            ? ('contracts.detail.autoRenewTerm'
                              | transloco: { months: c.renewal_term_months })
                            : ('contracts.detail.autoRenew' | transloco)
                        }}
                      } @else {
                        {{ 'contracts.detail.noAutoRenew' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'contracts.fields.reviewDate' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        c.review_date
                          ? (c.review_date | localDay)
                          : ('contracts.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'contracts.fields.governingLaw' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ c.governing_law ?? ('contracts.common.none' | transloco) }}
                    </dd>
                  </div>
                  @if (c.termination_date) {
                    <div>
                      <dt class="text-fg-subtle">
                        {{ 'contracts.fields.terminationDate' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{
                          c.termination_date
                            ? (c.termination_date | localDay)
                            : ('contracts.common.none' | transloco)
                        }}
                      </dd>
                    </div>
                  }
                  @if (c.approved_by) {
                    <div>
                      <dt class="text-fg-subtle">
                        {{ 'contracts.fields.approvedBy' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{ c.approved_by.name ?? '' }} · {{ c.approved_at | localDay }}
                      </dd>
                    </div>
                  }
                </dl>
                @if (c.renewal_notes) {
                  <p class="mt-4 text-[13px] whitespace-pre-line text-fg-muted">
                    <span class="font-semibold text-fg"
                      >{{ 'contracts.fields.renewalNotes' | transloco }}:</span
                    >
                    {{ c.renewal_notes }}
                  </p>
                }
              </app-card>

              <app-card>
                <app-contract-parties
                  [contractId]="c.id"
                  [parties]="c.parties"
                  [canEdit]="c.can_edit"
                  (changed)="reload()"
                />
              </app-card>

              <app-card>
                <app-contract-key-dates
                  [contractId]="c.id"
                  [keyDates]="c.key_dates"
                  [canEdit]="c.can_edit"
                  (changed)="reload()"
                />
              </app-card>

              <app-card>
                <app-contract-versions
                  [contractId]="c.id"
                  [versions]="c.versions"
                  [attachments]="attachments()"
                  [canEdit]="c.can_edit"
                  (changed)="reload()"
                />
              </app-card>

              <app-contract-ai-panel
                [contract]="c"
                [attachments]="attachments()"
                (changed)="reload()"
                (obligationAdded)="onObligationAdded()"
              />
            </div>

            <div tasks>
              <app-contract-obligations
                [contractId]="c.id"
                [canEdit]="c.can_edit"
                [refresh]="obligationsVersion()"
                (changed)="reload()"
              />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 text-[13px] font-semibold text-fg-subtle">
                  {{ 'contracts.detail.nextDeadline' | transloco }}
                </h2>
                @if (c.next_deadline; as d) {
                  <p
                    class="text-[15px] font-semibold"
                    [class.text-fail]="d.overdue"
                    data-testid="next-deadline"
                  >
                    {{ d.due_date | localDay }}
                  </p>
                  <p class="text-[13px] text-fg-muted">
                    {{ kindKey(d.kind) | transloco }}
                    @if (d.label) {
                      · {{ d.label }}
                    }
                    @if (d.overdue) {
                      · {{ 'contracts.common.overdue' | transloco }}
                    }
                  </p>
                } @else {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'contracts.detail.noDeadline' | transloco }}
                  </p>
                }
                <p class="mt-3 text-[12.5px] text-fg-muted">
                  {{
                    'contracts.detail.openObligations' | transloco: { count: c.open_obligations }
                  }}
                </p>
              </app-card>

              <app-card>
                <h2
                  class="mb-2 flex items-center justify-between gap-2 text-[13px] font-semibold text-fg-subtle"
                >
                  {{ 'contracts.dpa.title' | transloco }}
                  <app-badge [tone]="dpaTone(c.dpa.status)" data-testid="dpa-status">
                    {{ 'contracts.dpa.status.' + c.dpa.status | transloco }}
                  </app-badge>
                </h2>
                <p class="text-[13px] text-fg-muted">
                  {{ 'contracts.dpa.explain.' + c.dpa.status | transloco }}
                </p>
                @if (c.dpa.linked_dpa_ids.length) {
                  <ul class="mt-2 flex flex-col gap-1">
                    @for (id of c.dpa.linked_dpa_ids; track id; let i = $index) {
                      <li>
                        <a
                          [routerLink]="['/contracts', id]"
                          class="text-[13px] font-semibold text-accent hover:underline"
                        >
                          {{ 'contracts.dpa.linked' | transloco: { n: i + 1 } }}
                        </a>
                      </li>
                    }
                  </ul>
                }
                @if (c.dpa.status === 'missing' && c.can_edit) {
                  <p class="mt-2 text-[12.5px] font-semibold text-fg">
                    {{ 'contracts.dpa.linkCta' | transloco }}
                  </p>
                }
              </app-card>

              <app-supports-requirements entityType="contract" [entityId]="c.id" />
              <app-why-it-matters scope="contracts" page="detail" />
              <div class="flex flex-col items-start gap-1">
                <app-contract-lesson-link lesson="contract-lifecycle" />
                @if (c.processes_personal_data) {
                  <app-contract-lesson-link lesson="processor-agreements" />
                }
              </div>
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'contracts.detail.deleteTitle' | transloco"
            [message]="'contracts.detail.deleteMessage' | transloco: { code: c.code }"
            [confirmLabel]="'contracts.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
        }
      }
    }
  `,
})
export class ContractDetail {
  private readonly api = inject(ContractsApi);
  private readonly attachmentsApi = inject(AttachmentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = CONTRACT_FIELD_LABELS;
  protected readonly statusKey = contractStatusKey;
  protected readonly statusTone = contractStatusTone;
  protected readonly typeKey = contractTypeKey;
  protected readonly kindKey = deadlineKindKey;
  protected readonly dpaTone = dpaTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('contracts.common.loadFailed');
  protected readonly contract = signal<Contract | null>(null);
  protected readonly attachments = signal<readonly Attachment[]>([]);
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly obligationsVersion = signal(0);
  protected readonly closed = computed(() => isClosedContract(this.contract()?.status));

  /** The open tab (`?tab=`), so the file list refreshes when returning to details. */
  private readonly tab = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('tab'))), {
    initialValue: null,
  });

  private request = new Subscription();
  private filesRequest = new Subscription();

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      this.request.unsubscribe();
      this.filesRequest.unsubscribe();
    });
    providePageContext(() => {
      const c = this.contract();
      return {
        module: 'contracts',
        entityType: 'contract',
        entityId: this.id(),
        view: 'detail',
        title: c ? `${c.code} ${c.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
    effect(() => {
      const tab = this.tab();
      const orgId = this.selectedOrg.currentOrgId();
      if (!tab || tab === 'details') {
        untracked(() => this.loadFiles(orgId, this.id()));
      }
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  protected onObligationAdded(): void {
    this.obligationsVersion.update((v) => v + 1);
    this.reload();
  }

  protected runAction(run: WorkflowRun): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.action(orgId, this.id(), run.action, run.body).subscribe({
      next: (contract) => {
        this.acting.set(false);
        this.contract.set(contract);
        this.notifications.success(`contracts.notices.actions.${run.action}`, {
          code: contract.code,
        });
        if (run.action === 'terminate' || run.action === 'expire') {
          this.obligationsVersion.update((v) => v + 1);
        }
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(contractErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.contract();
    if (!orgId || !c) {
      return;
    }
    this.acting.set(true);
    this.api.delete(orgId, c.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deleting.set(false);
        this.notifications.success('contracts.notices.deleted', { code: c.code });
        void this.router.navigate(['/contracts']);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(contractErrorKey(error));
      },
    });
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
      next: (contract) => {
        this.contract.set(contract);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        if (initial) {
          this.errorKey.set(contractErrorKey(error));
          this.state.set('error');
        } else {
          this.notifications.error(contractErrorKey(error));
        }
      },
    });
  }

  private loadFiles(orgId: string | null, id: string): void {
    this.filesRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.filesRequest = this.attachmentsApi.list(orgId, 'contract', id).subscribe({
      next: (items) => this.attachments.set(items),
      error: () => this.attachments.set([]),
    });
  }
}
