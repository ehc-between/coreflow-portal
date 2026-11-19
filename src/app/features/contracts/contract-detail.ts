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
import { AskPanelService } from '../ask/ask-panel.service';
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
import { CustomerChip } from '../../shared/customers';
import { formatLocalDate, formatLocalDay } from '../../shared/locale/locale-pipes';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { Breadcrumb } from '../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { ContractAiPanel } from './contract-ai-panel';
import { ContractDpaCard } from './contract-dpa-card';
import { ContractDpaChecklist } from './contract-dpa-checklist';
import { ContractKeyDates } from './contract-key-dates';
import { ContractLearnMore } from './contract-learn-more';
import { ContractObligations } from './contract-obligations';
import { ContractParties } from './contract-parties';
import { ContractVersions } from './contract-versions';
import { ContractWorkflowBar, WorkflowRun } from './contract-workflow-bar';
import { CONTRACTS_CRUMB, CONTRACTS_SETTINGS_LINK } from './contracts-nav';
import { ContractsApi } from './data/contracts-api';
import { Contract, PERM_MANAGE } from './data/contract.models';
import {
  CONTRACT_SECTIONS,
  contractStatusSentence,
  contractTodos,
  counterpartiesOf,
} from './data/contract-anatomy';
import {
  contractStatusKey,
  contractTypeKey,
  deadlineKindKey,
  formatAmount,
  isClosedContract,
  personalDataRoleKey,
  reviewItemKey,
  transferBasisKey,
} from './data/contract-display';
import { contractErrorKey } from './data/contract-errors';
import { roleOf } from './data/contract-form-model';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** The obligations live in the tasks slot; call the tab what it holds. */
const TAB_LABELS: Partial<Record<RecordTab, string>> = {
  tasks: 'contracts.detail.obligationsTab',
};

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
  personal_data_role: 'contracts.fields.personalDataRole',
  transfer_basis: 'contracts.fields.transferBasis',
  transfer_countries: 'contracts.fields.transferCountries',
  ict_critical: 'contracts.fields.ictCritical',
  involves_ai_system: 'contracts.fields.involvesAiSystem',
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
  approval_review: 'contracts.fields.approvalReview',
  last_reviewed_at: 'contracts.fields.lastReviewed',
};

/** The guided steps from "approved" to "active": upload the signed copy, mark it signed, activate. */
export function signingSteps(c: Contract): {
  readonly copy: boolean;
  readonly signed: boolean;
  readonly canActivate: boolean;
} {
  const v = c.versions[0];
  return {
    copy: !!v?.attachment_id,
    signed: !!v?.signed,
    canActivate: c.allowed_actions.includes('activate'),
  };
}

/**
 * A contract (`/contracts/:id`) on the detail-page anatomy (docs/ux-guide.md §2.7).
 * Header: code · type · status, "Rediger", "Spør KI" (summary, reading the attached
 * file, the DPA clause check) and "Mer". "Hovedinformasjon" answers what a reader
 * comes for: a status sentence with the next lifecycle step (the approval workflow,
 * the signing steps), who the contract is with (linked to the supplier register),
 * what it covers, how long it runs (renewal and notice deadline) and the next
 * deadline with the open obligations. The Details tab holds the secondary fields
 * (empty ones hidden), the parties, key dates, versions with signed copies, the
 * data processing agreement, the approval trail and the assistant's findings.
 * One "Oppfølging" card lists what is missing, the requirements, the connections
 * and owner / approval / review dates.
 */
@Component({
  selector: 'app-contract-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    CustomerChip,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
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
    ContractAiPanel,
    ContractDpaCard,
    ContractDpaChecklist,
    ContractKeyDates,
    ContractLearnMore,
    ContractObligations,
    ContractParties,
    ContractVersions,
    ContractWorkflowBar,
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
          <a routerLink="/contracts" class="mt-4 inline-block text-ui font-semibold text-accent">
            {{ 'contracts.common.backToList' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (contract(); as c) {
          @let sentence = statusSentence();
          <app-record-detail-layout
            [anatomy]="true"
            entityType="contract"
            [entityId]="c.id"
            [title]="c.title"
            [breadcrumbs]="breadcrumbs()"
            [settingsLink]="canManage() ? settingsLink : null"
            [tabs]="tabs"
            [tabLabels]="tabLabels"
            [counts]="counts()"
            [canEdit]="c.can_edit"
            [requirementsPanel]="true"
            [fieldLabels]="fieldLabels"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono" data-testid="contract-meta">{{ c.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ typeKey(c.contract_type) | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="c.status"
                [labelKey]="statusKey(c.status)"
                data-testid="contract-status"
              />
              @if (reviewOverdue()) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="contracts.warnings.review_overdue.label"
                />
              }
            </ng-container>

            @if (c.can_edit) {
              <app-button primary (click)="edit()" data-testid="contract-edit">
                {{ 'contracts.common.edit' | transloco }}
              </app-button>
            }
            @if (firstSupplierId(); as supplierId) {
              <button
                overflow
                appMenuItem
                type="button"
                (click)="startEvaluation(supplierId)"
                data-testid="start-evaluation"
              >
                {{ 'contracts.detail.startEvaluation' | transloco }}
              </button>
            }
            @if (c.can_delete) {
              <button
                overflow
                appMenuItem
                type="button"
                [danger]="true"
                (click)="deleting.set(true)"
                data-testid="contract-delete"
              >
                {{ 'contracts.common.delete' | transloco }}
              </button>
            }

            <button
              appMenuItem
              ask
              type="button"
              (click)="askAboutContract()"
              data-testid="contract-ask"
            >
              <app-icon name="spark" [size]="15" />
              {{ 'contracts.detail.askSummarise' | transloco }}
            </button>
            @if (aiPanel()?.files()?.length) {
              @if (aiPanel()?.canWrite()) {
                <button
                  appMenuItem
                  ask
                  type="button"
                  (click)="runAi('extract')"
                  data-testid="contract-ai-extract"
                >
                  <app-icon name="spark" [size]="15" />
                  {{ 'contracts.ai.extract' | transloco }}
                </button>
              }
              @if (aiPanel()?.dpaRelevant()) {
                <button
                  appMenuItem
                  ask
                  type="button"
                  (click)="runAi('dpa')"
                  data-testid="contract-ai-dpa"
                >
                  <app-icon name="spark" [size]="15" />
                  {{ 'contracts.ai.dpaCheck' | transloco }}
                </button>
              }
            }

            <app-help-strip
              help
              scope="contracts"
              page="detail"
              [lesson]="roleOf(c) !== 'none' ? 'processor-agreements' : 'contract-lifecycle'"
              [subject]="c.title"
            />

            <app-record-lead record-lead [fillLink]="c.can_edit ? editLink() : null">
              <app-record-status-line status [tone]="sentence.tone" data-testid="contract-sentence">
                {{ sentence.key | transloco: { date: day(sentence.date) ?? '' } }}
              </app-record-status-line>

              @if (c.allowed_actions.length || c.approval_blocked_reason) {
                <div
                  status
                  class="mb-5 flex flex-col gap-3 rounded-tile border border-border px-3 py-3"
                  data-testid="contract-next-step"
                >
                  <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div class="min-w-0 text-meta text-fg-muted">
                      <span class="block font-semibold text-fg">
                        {{ 'contracts.detail.nextStep' | transloco }}
                      </span>
                      @if (c.approval_blocked_reason === 'self_approval') {
                        <span class="mt-0.5 block" data-testid="self-approval-note">
                          {{ 'contracts.workflow.selfApproval' | transloco }}
                        </span>
                      }
                      @if (c.status === 'in_review' && c.submitted_by) {
                        <span class="mt-0.5 block">
                          {{
                            'contracts.workflow.submittedBy'
                              | transloco
                                : {
                                    name: c.submitted_by.name ?? '',
                                    date: day(c.submitted_at),
                                  }
                          }}
                        </span>
                      }
                    </div>
                    <app-contract-workflow-bar
                      #workflow
                      [contract]="c"
                      [busy]="acting()"
                      (run)="runAction($event)"
                    />
                  </div>

                  @if (c.status === 'approved') {
                    @let s = steps();
                    <ol
                      class="grid grid-cols-1 gap-2 border-t border-border pt-3 md:grid-cols-3"
                      data-testid="signing-steps"
                    >
                      <li
                        class="rounded-tile border px-3 py-2"
                        [class]="s.copy ? 'border-pass/40 bg-pass-soft' : 'border-border'"
                      >
                        <span class="block text-meta font-semibold text-fg-muted">1</span>
                        <span class="block text-ui font-semibold text-fg">
                          {{ 'contracts.signing.copy' | transloco }}
                        </span>
                        <span class="block text-meta text-fg-muted">
                          {{
                            (s.copy ? 'contracts.signing.copyDone' : 'contracts.signing.copyTodo')
                              | transloco
                          }}
                        </span>
                      </li>
                      <li
                        class="rounded-tile border px-3 py-2"
                        [class]="s.signed ? 'border-pass/40 bg-pass-soft' : 'border-border'"
                      >
                        <span class="block text-meta font-semibold text-fg-muted">2</span>
                        <span class="block text-ui font-semibold text-fg">
                          {{ 'contracts.signing.sign' | transloco }}
                        </span>
                        <span class="block text-meta text-fg-muted">
                          {{
                            (s.signed ? 'contracts.signing.signDone' : 'contracts.signing.signTodo')
                              | transloco
                          }}
                        </span>
                      </li>
                      <li class="rounded-tile border border-border px-3 py-2">
                        <span class="block text-meta font-semibold text-fg-muted">3</span>
                        <span class="block text-ui font-semibold text-fg">
                          {{ 'contracts.signing.activate' | transloco }}
                        </span>
                        @if (s.canActivate) {
                          <app-button
                            class="mt-1"
                            size="sm"
                            [variant]="s.copy && s.signed ? 'primary' : 'secondary'"
                            [disabled]="acting()"
                            (click)="workflowBar()?.open('activate')"
                            data-testid="signing-activate"
                          >
                            {{ 'contracts.actions.activate' | transloco }}
                          </app-button>
                        }
                      </li>
                    </ol>
                  }
                </div>
              }

              <app-field-item
                size="lead"
                labelKey="contracts.detail.lead.with"
                data-testid="lead-with"
              >
                @if (counterparties().length) {
                  <ul class="flex flex-col gap-1">
                    @for (p of counterparties(); track p.id) {
                      <li class="[overflow-wrap:anywhere]">
                        @if (p.customer) {
                          <app-customer-chip
                            [ref]="p.customer"
                            data-testid="contract-customer-chip"
                          />
                        } @else if (p.supplier_id) {
                          <a
                            [routerLink]="p.supplier?.url || ['/suppliers', p.supplier_id]"
                            class="font-semibold text-accent hover:underline"
                            >{{ p.name }}</a
                          >
                          @if (p.supplier?.code; as code) {
                            <span class="ml-1 font-mono text-meta text-fg-muted">{{ code }}</span>
                          }
                        } @else {
                          <span class="font-semibold">{{ p.name }}</span>
                        }
                        <span class="text-ui text-fg-muted">
                          · {{ 'contracts.partyRoles.' + p.role | transloco }}</span
                        >
                      </li>
                    }
                  </ul>
                }
              </app-field-item>
              <app-field-item
                size="lead"
                labelKey="contracts.detail.lead.term"
                data-testid="lead-term"
              >
                @if (periodText(); as period) {
                  <span class="block">{{ period }}</span>
                }
                @if (termNotes().length) {
                  <span class="mt-0.5 block text-ui text-fg-muted">
                    @for (line of termNotes(); track line) {
                      <span class="block">{{ line }}</span>
                    }
                  </span>
                }
              </app-field-item>
              <app-field-item
                size="lead"
                labelKey="contracts.detail.lead.about"
                [wide]="true"
                [multiline]="true"
                [value]="c.description"
              />
              <app-field-item
                size="lead"
                labelKey="contracts.detail.lead.nextDeadline"
                [wide]="true"
                [keepEmpty]="true"
                emptyKey="contracts.detail.noDeadline"
                data-testid="lead-deadline"
              >
                @if (c.next_deadline; as d) {
                  <span class="flex flex-wrap items-baseline gap-x-2" data-testid="next-deadline">
                    <span class="font-semibold" [class.text-warn-ink]="d.overdue">{{
                      day(d.due_date)
                    }}</span>
                    <span class="text-ui text-fg-muted">
                      {{ kindKey(d.kind) | transloco }}
                      @if (d.label) {
                        · {{ d.label }}
                      }
                      @if (d.overdue) {
                        · {{ 'contracts.common.overdue' | transloco }}
                      }
                    </span>
                  </span>
                }
                @if (c.open_obligations > 0) {
                  <a
                    [routerLink]="[]"
                    [queryParams]="{ tab: 'tasks' }"
                    queryParamsHandling="merge"
                    class="mt-1 inline-flex items-center gap-1 text-ui font-semibold text-accent hover:underline"
                    data-testid="open-obligations"
                  >
                    {{
                      'contracts.detail.openObligations' | transloco: { count: c.open_obligations }
                    }}
                    <span aria-hidden="true">→</span>
                  </a>
                }
              </app-field-item>
            </app-record-lead>

            <app-record-details [columns]="3" [fillLink]="c.can_edit ? editLink() : null">
              <app-field-item labelKey="contracts.fields.value" [value]="valueText()" />
              <app-field-item
                labelKey="contracts.detail.labels.signedDate"
                [value]="day(c.signed_date)"
              />
              <app-field-item
                labelKey="contracts.fields.department"
                [value]="departmentName()"
                data-testid="summary-department"
              />
              <app-field-item
                labelKey="contracts.detail.labels.governingLaw"
                [value]="c.governing_law"
              />
              @if (roleOf(c) !== 'none') {
                <app-field-item
                  labelKey="contracts.fields.personalDataRole"
                  [value]="roleText()"
                  data-testid="summary-role"
                />
              }
              @if (c.transfer_basis && c.transfer_basis !== 'none') {
                <app-field-item
                  labelKey="contracts.fields.transferBasis"
                  [value]="transferText()"
                />
              }
              @if (c.ict_critical || c.involves_ai_system) {
                <app-field-item labelKey="contracts.detail.labels.flags" [value]="flagsText()" />
              }
              @if (c.confidential) {
                <app-field-item
                  labelKey="contracts.fields.confidential"
                  [value]="'contracts.detail.confidentialYes' | transloco"
                />
              }
              @if (c.current_version > 0) {
                <app-field-item
                  labelKey="contracts.fields.currentVersion"
                  [value]="'contracts.versions.number' | transloco: { n: c.current_version }"
                />
              }
              @if (c.termination_date) {
                <app-field-item
                  labelKey="contracts.fields.terminationDate"
                  [value]="day(c.termination_date)"
                />
              }
              <app-field-item
                labelKey="contracts.fields.renewalNotes"
                [wide]="true"
                [multiline]="true"
                [value]="c.renewal_notes"
              />

              <div after class="mt-6 flex flex-col gap-6">
                <app-contract-ai-panel
                  [contract]="c"
                  [attachments]="attachments()"
                  (changed)="reload()"
                  (obligationAdded)="onObligationAdded()"
                />

                <app-card [attr.id]="sections.parties" class="scroll-mt-20">
                  <app-contract-parties
                    [contractId]="c.id"
                    [parties]="c.parties"
                    [canEdit]="c.can_edit"
                    (changed)="reload()"
                  />
                </app-card>

                <app-card [attr.id]="sections.keyDates" class="scroll-mt-20">
                  <app-contract-key-dates
                    [contractId]="c.id"
                    [keyDates]="c.key_dates"
                    [canEdit]="c.can_edit"
                    (changed)="reload()"
                  />
                </app-card>

                <app-card [attr.id]="sections.versions" class="scroll-mt-20">
                  <app-contract-versions
                    [contractId]="c.id"
                    [versions]="c.versions"
                    [attachments]="attachments()"
                    [canEdit]="c.can_edit"
                    (changed)="onFilesChanged()"
                  />
                </app-card>

                @if (c.contract_type === 'dpa' || c.dpa.required) {
                  <div [attr.id]="sections.dpa" class="flex scroll-mt-20 flex-col gap-6">
                    <app-contract-dpa-card [contract]="c" (changed)="contract.set($event)" />
                    <app-contract-dpa-checklist
                      [contract]="c"
                      (changed)="contract.set($event)"
                      (obligationAdded)="onObligationAdded()"
                    />
                  </div>
                }

                @if (c.approval_review; as review) {
                  <app-card>
                    <section aria-labelledby="cf-approval-h" data-testid="approval-review">
                      <h2 id="cf-approval-h" class="mb-1 font-display text-card font-bold text-fg">
                        {{ 'contracts.approve.trailTitle' | transloco }}
                      </h2>
                      <p class="mb-3 text-meta text-fg-muted">
                        {{
                          'contracts.approve.trailBy'
                            | transloco
                              : {
                                  name: review.reviewed_by?.name ?? '',
                                  date: dateTime(review.reviewed_at),
                                }
                        }}
                      </p>
                      @if (review.items.length) {
                        <ul class="flex flex-col gap-1">
                          @for (item of review.items; track item.key) {
                            <li class="flex items-start gap-2 text-ui">
                              <app-status-badge
                                meaning="compliance"
                                [value]="item.answer === 'yes' ? 'met' : 'not_applicable'"
                                [labelKey]="'contracts.approve.answers.' + item.answer"
                              />
                              <span class="text-fg">{{ itemKey(item.key) | transloco }}</span>
                            </li>
                          }
                        </ul>
                      }
                      @if (review.note) {
                        <p class="mt-3 text-ui whitespace-pre-line text-fg-muted">
                          <span class="font-semibold text-fg"
                            >{{ 'contracts.approve.note' | transloco }}:</span
                          >
                          {{ review.note }}
                        </p>
                      }
                    </section>
                  </app-card>
                }
              </div>
            </app-record-details>

            <div tasks>
              <app-contract-obligations
                [contractId]="c.id"
                [canEdit]="c.can_edit"
                [refresh]="obligationsVersion()"
                (changed)="reload()"
              />
            </div>

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="contracts.fields.owner"
                [value]="c.owner?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="contracts.fields.approvedBy"
                [value]="approvedText()"
                data-testid="summary-approved"
              />
              <app-field-item
                layout="inline"
                labelKey="contracts.fields.lastReviewed"
                [value]="lastReviewText()"
              />
              <app-field-item
                layout="inline"
                labelKey="contracts.fields.reviewDate"
                [keepEmpty]="!closed()"
                emptyKey="kit.detail.meta.notPlanned"
                emptyActionKey="kit.detail.meta.plan"
                [emptyLink]="c.can_edit ? editLink() : null"
              >
                @if (c.review_date) {
                  <span [class.text-warn-ink]="reviewOverdue()">{{ day(c.review_date) }}</span>
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="contracts.detail.labels.updated"
                [value]="day(c.updated_at)"
              />
            </app-record-meta>

            <app-contract-learn-more aside-learn [requirementRefs]="c.requirement_refs" />
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
  private readonly assignees = inject(AssigneeOptionsService);
  private readonly askPanel = inject(AskPanelService);
  private readonly flows = inject(CreateFlowService);

  readonly id = input.required<string>();

  protected readonly settingsLink = CONTRACTS_SETTINGS_LINK;
  protected readonly tabs = TABS;
  protected readonly tabLabels = TAB_LABELS;
  protected readonly fieldLabels = CONTRACT_FIELD_LABELS;
  protected readonly sections = CONTRACT_SECTIONS;
  protected readonly statusKey = contractStatusKey;
  protected readonly typeKey = contractTypeKey;
  protected readonly kindKey = deadlineKindKey;
  protected readonly itemKey = reviewItemKey;
  protected readonly roleOf = roleOf;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('contracts.common.loadFailed');
  protected readonly contract = signal<Contract | null>(null);
  protected readonly attachments = signal<readonly Attachment[]>([]);
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly obligationsVersion = signal(0);
  protected readonly workflowBar = viewChild<ContractWorkflowBar>('workflow');
  protected readonly aiPanel = viewChild(ContractAiPanel);

  protected readonly closed = computed(() => isClosedContract(this.contract()?.status));
  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_MANAGE),
  );
  protected readonly breadcrumbs = computed<readonly Breadcrumb[]>(() => [
    CONTRACTS_CRUMB,
    { label: this.contract()?.code ?? '' },
  ]);
  protected readonly editLink = computed(() => ['/contracts', this.id(), 'edit']);
  protected readonly counts = computed<Partial<Record<RecordTab, number>>>(() => ({
    tasks: this.contract()?.open_obligations ?? 0,
    attachments: this.attachments().length,
  }));
  protected readonly statusSentence = computed(() => {
    const c = this.contract();
    return c
      ? contractStatusSentence(c)
      : { key: 'contracts.detail.statusLine.unknown', tone: 'neutral' as const, date: null };
  });
  protected readonly reviewOverdue = computed(
    () => !!this.contract()?.warnings?.includes('review_overdue'),
  );
  protected readonly counterparties = computed(() => {
    const c = this.contract();
    return c ? counterpartiesOf(c) : [];
  });
  /** "Oppfølging": what is missing, each line a link or an action. */
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const c = this.contract();
    if (!c) {
      return [];
    }
    const params = { date: this.day(c.notice_deadline) ?? '' };
    return contractTodos(c).map((todo) => {
      const t = todo.target;
      const base = { key: todo.key, labelKey: todo.labelKey, params };
      switch (t.kind) {
        case 'edit':
          return { ...base, link: this.editLink() };
        case 'section':
          return { ...base, action: () => this.goToSection(t.id) };
        case 'action':
          return { ...base, action: () => this.workflowBar()?.open(t.action) };
      }
    });
  });
  protected readonly steps = computed(() => {
    const c = this.contract();
    return c ? signingSteps(c) : { copy: false, signed: false, canActivate: false };
  });
  protected readonly firstSupplierId = computed(
    () => this.counterparties().find((p) => p.supplier_id)?.supplier_id ?? null,
  );
  protected readonly departmentName = computed(() => {
    const id = this.contract()?.department_id;
    if (!id) {
      return null;
    }
    const dept = this.assignees.options().departments.find((d) => d.value === `department:${id}`);
    return dept?.label ?? null;
  });
  protected readonly valueText = computed(() => {
    const c = this.contract();
    if (!c?.value_amount) {
      return null;
    }
    const amount =
      `${formatAmount(c.value_amount, this.language.locale())} ${c.currency ?? ''}`.trim();
    return c.value_period
      ? `${amount} · ${this.t(`contracts.valuePeriods.${c.value_period}`)}`
      : amount;
  });
  /** "22. jan. 2026 – 22. jan. 2027", or only the known end. */
  protected readonly periodText = computed(() => {
    const c = this.contract();
    const start = this.day(c?.start_date);
    const end = this.day(c?.end_date);
    if (start && end) {
      return `${start} – ${end}`;
    }
    if (start) {
      return this.t('contracts.detail.from', { date: start });
    }
    return end ? this.t('contracts.detail.until', { date: end }) : null;
  });
  /** Renewal and notice under the period: what the reader must act on. */
  protected readonly termNotes = computed<readonly string[]>(() => {
    const c = this.contract();
    if (!c || this.closed()) {
      return [];
    }
    const lines: string[] = [];
    if (c.auto_renew) {
      lines.push(
        c.renewal_term_months
          ? this.t('contracts.detail.autoRenewTerm', { months: c.renewal_term_months })
          : this.t('contracts.detail.autoRenew'),
      );
    } else if (c.end_date) {
      lines.push(this.t('contracts.detail.noAutoRenew'));
    }
    const deadline = this.day(c.notice_deadline);
    if (deadline) {
      lines.push(
        c.notice_period_days !== null
          ? this.t('contracts.detail.noticeBy', { date: deadline, days: c.notice_period_days })
          : this.t('contracts.detail.noticeByDate', { date: deadline }),
      );
    } else if (c.notice_period_days !== null) {
      lines.push(this.t('contracts.detail.noticeDays', { days: c.notice_period_days }));
    }
    return lines;
  });
  protected readonly roleText = computed(() => {
    const c = this.contract();
    return c ? this.t(personalDataRoleKey(roleOf(c))) : null;
  });
  protected readonly transferText = computed(() => {
    const c = this.contract();
    if (!c?.transfer_basis) {
      return null;
    }
    const basis = this.t(transferBasisKey(c.transfer_basis));
    return c.transfer_countries ? `${basis} · ${c.transfer_countries}` : basis;
  });
  protected readonly flagsText = computed(() => {
    const c = this.contract();
    const flags: string[] = [];
    if (c?.ict_critical) {
      flags.push(this.t('contracts.fields.ictCritical'));
    }
    if (c?.involves_ai_system) {
      flags.push(this.t('contracts.fields.involvesAiSystem'));
    }
    return flags.join(' · ') || null;
  });
  /** "Kari Nordmann · 3 Oct 2026" — so an auditor sees who approved and when. */
  protected readonly approvedText = computed(() => {
    const c = this.contract();
    if (!c?.approved_by) {
      return c && ['draft', 'in_review'].includes(c.status)
        ? this.t('contracts.detail.notApprovedYet')
        : null;
    }
    return [c.approved_by.name, this.day(c.approved_at)].filter(Boolean).join(' · ');
  });
  protected readonly lastReviewText = computed(() => {
    const c = this.contract();
    if (!c?.last_reviewed_at) {
      return null;
    }
    return [c.last_reviewed_by?.name, this.day(c.last_reviewed_at)].filter(Boolean).join(' · ');
  });

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
    this.assignees.ensureLoaded();
    providePageContext(() => {
      const c = this.contract();
      return {
        module: 'contracts',
        entityType: 'contract',
        entityId: this.id(),
        view: 'detail',
        title: c ? `${c.code} ${c.title}` : null,
        requirements: [...(c?.requirement_refs ?? [])],
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
      const id = this.id();
      if (!tab || tab === 'details') {
        untracked(() => this.loadFiles(orgId, id));
      }
    });
  }

  protected day(value: string | null | undefined): string | null {
    return formatLocalDay(value, 'mediumDate', this.language.locale()) || null;
  }

  protected dateTime(value: string | null | undefined): string {
    return formatLocalDate(value, 'mediumDate', this.language.locale());
  }

  protected reload(initial = false): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), initial);
  }

  protected onObligationAdded(): void {
    this.obligationsVersion.update((v) => v + 1);
    this.reload();
  }

  /** A signed copy was uploaded or pinned: the file list and the contract both changed. */
  protected onFilesChanged(): void {
    this.loadFiles(this.selectedOrg.currentOrgId(), this.id());
    this.reload();
  }

  protected edit(): void {
    void this.router.navigate(this.editLink());
  }

  protected askAboutContract(): void {
    this.askPanel.askAbout(this.t('contracts.ask.summarise'));
  }

  /** "Spør KI" -> read the attached file: show the Details tab, where the findings appear. */
  protected runAi(kind: 'extract' | 'dpa'): void {
    void this.showDetails().then(() => {
      const panel = this.aiPanel();
      if (kind === 'extract') {
        panel?.extract();
      } else {
        panel?.checkDpa();
      }
    });
  }

  /** A to-do line of "Oppfølging": open the Details tab and scroll to the section. */
  protected goToSection(id: string): void {
    void this.showDetails().then(() =>
      setTimeout(() =>
        document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
      ),
    );
  }

  protected startEvaluation(supplierId: string): void {
    void this.flows.start('supplier.to_evaluation', 'supplier', supplierId);
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

  private showDetails(): Promise<boolean> {
    const tab = this.tab();
    if (!tab || tab === 'details') {
      return Promise.resolve(true);
    }
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: null },
      queryParamsHandling: 'merge',
    });
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.language.translate(key, params);
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
      // Only clean files can be read or extracted; scanning / quarantined ones can't.
      next: (items) => this.attachments.set(items.filter(isDownloadable)),
      error: () => this.attachments.set([]),
    });
  }
}
