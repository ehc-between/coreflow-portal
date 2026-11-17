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
import { CreateFlowService, FlowContext } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { AskPanelService } from '../ask/ask-panel.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { CountryNamePipe } from '../../shared/locale/countries';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
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
import {
  ATTENTION_BADGE,
  AttentionAction,
  attentionAction,
  certificateBadge,
  criticalityBadge,
  decisionBadge,
  scoreParams,
  supplierStatusBadge,
  zoneBadge,
} from './data/supplier-display';
import { supplierErrorKey } from './data/supplier-errors';
import {
  AttentionCode,
  EvaluationDetail,
  EvaluationKind,
  SUPPLIER_FLAGS,
  SupplierDetail,
} from './data/supplier.models';
import { SuppliersApi } from './data/suppliers-api';
import { StartEvaluationDialog } from './detail/start-evaluation-dialog';
import { StatusChange, SupplierStatusDialog } from './detail/status-dialog';
import { SupplierAgreementsCard } from './detail/supplier-agreements';
import { SupplierEvaluationsPanel } from './detail/supplier-evaluations-panel';
import { SupplierPerformancePanel } from './detail/supplier-performance-panel';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> label key (the supplier's controlled fields). */
export const SUPPLIER_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'suppliers.fields.code',
  name: 'suppliers.fields.name',
  legal_name: 'suppliers.fields.legalName',
  registration_number: 'suppliers.fields.registrationNumber',
  country: 'suppliers.fields.country',
  website: 'suppliers.fields.website',
  category: 'suppliers.fields.category',
  description: 'suppliers.fields.description',
  criticality: 'suppliers.fields.criticality',
  status: 'suppliers.fields.status',
  owner_user_id: 'suppliers.fields.owner',
  department_id: 'suppliers.fields.department',
  contact_name: 'suppliers.fields.contactName',
  contact_email: 'suppliers.fields.contactEmail',
  contact_phone: 'suppliers.fields.contactPhone',
  processes_personal_data: 'suppliers.flags.processes_personal_data',
  has_system_access: 'suppliers.flags.has_system_access',
  provides_cloud_services: 'suppliers.flags.provides_cloud_services',
  provides_ai: 'suppliers.flags.provides_ai',
  data_locations: 'suppliers.fields.dataLocations',
  certifications: 'suppliers.fields.certifications',
  certificates: 'suppliers.fields.certifications',
  evaluation_interval_months: 'suppliers.fields.intervalMonths',
  next_evaluation_at: 'suppliers.fields.nextEvaluation',
  approved_at: 'suppliers.fields.approvedAt',
  approved_by: 'suppliers.fields.approvedBy',
};

/** Lower-case the first letter unless the word is an abbreviation ("KI-vurdering", "AI"). */
export function lowerFirst(text: string): string {
  return text.length > 1 && text[1] === text[1].toLowerCase()
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}

/** One "Trenger oppfølging" row: the flag, what it means and what closes it. */
interface AttentionRow {
  readonly code: AttentionCode;
  readonly action: AttentionAction;
}

/**
 * A supplier's page (`/suppliers/:id`). Up front: what needs follow-up (each flag with
 * the action that closes it), approval and re-evaluation with open conditions and the
 * assessments the risk profile calls for ("Påkrevde vurderinger 1 av 3"); then the
 * agreements hub (contracts, DPA, processors, transfers, AI systems, assets, risks,
 * deviations), evaluations, the performance log and the profile with structured
 * certificates. The aside shows the requirements the supplier documents and its
 * connections. `?newEvaluation=1` (create from here) opens "Start vurdering".
 */
@Component({
  selector: 'app-supplier-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    CountryNamePipe,
    LocalDayPipe,
    MarkdownPipe,
    Button,
    Card,
    ConfirmDialog,
    EntityTasks,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    RecordDetailLayout,
    StartEvaluationDialog,
    StatusBadge,
    SupplierAgreementsCard,
    SupplierEvaluationsPanel,
    SupplierPerformancePanel,
    SupplierStatusDialog,
    WatchButton,
    WhyItMatters,
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
            routerLink="/suppliers"
            class="mb-3 inline-flex items-center gap-1 text-ui font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'suppliers.common.backToRegister' | transloco }}
          </a>
          <app-error-state
            titleKey="suppliers.detail.notFoundTitle"
            bodyKey="suppliers.detail.notFound"
            (retry)="reload()"
          />
        </div>
      }
      @default {
        @if (supplier(); as s) {
          <app-record-detail-layout
            entityType="supplier"
            [entityId]="s.id"
            [title]="s.name"
            [breadcrumbs]="[
              { labelKey: 'modules.names.suppliers', link: '/suppliers' },
              { label: s.name },
            ]"
            [tabs]="tabs"
            [canEdit]="s.can_edit"
            [requirementsPanel]="true"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            backLink="/suppliers"
            backLabelKey="suppliers.common.backToRegister"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ s.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'suppliers.category.' + s.category | transloco }}</span>
              @let st = statusBadge(s.status);
              <app-status-badge
                [meaning]="st.meaning"
                [value]="st.value"
                [labelKey]="'suppliers.status.' + s.status"
              />
              @let cr = critBadge(s.criticality);
              <app-status-badge
                [meaning]="cr.meaning"
                [value]="cr.value"
                [labelKey]="'suppliers.criticalityLabel'"
                [labelParams]="{ level: ('suppliers.criticality.' + s.criticality | transloco) }"
              />
            </ng-container>

            @if (s.can_edit) {
              <app-button primary data-testid="header-start-evaluation" (click)="openStart(null)">
                {{ 'suppliers.evaluations.start' | transloco }}
              </app-button>
            }
            @if (s.can_edit) {
              <a
                secondary
                [routerLink]="['/suppliers', s.id, 'edit']"
                class="inline-flex h-9 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
              >
                {{ 'suppliers.common.edit' | transloco }}
              </a>
            }
            <app-watch-button secondary entityType="supplier" [entityId]="s.id" />
            @if (s.can_edit) {
              <button appMenuItem overflow type="button" (click)="openStatus()">
                {{ 'suppliers.detail.changeStatus' | transloco }}
              </button>
            }
            @if (!ai.unavailable()) {
              <button appMenuItem overflow type="button" (click)="askSummary()">
                {{ 'suppliers.ai.summarise' | transloco }}
              </button>
            }
            @if (s.can_delete) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="confirmDelete.set(true)"
              >
                {{ 'suppliers.common.delete' | transloco }}
              </button>
            }

            <app-help-strip help scope="suppliers" page="detail" lesson="evaluating-suppliers" />

            <div class="flex flex-col gap-5">
              @if (attentionRows().length) {
                <app-card>
                  <div data-testid="attention-card">
                    <h2
                      class="mb-2 flex items-center gap-2 font-display text-card font-bold text-fg"
                    >
                      <app-icon name="alert" [size]="16" class="text-warn-ink" />
                      {{
                        'suppliers.detail.attentionTitle'
                          | transloco: { count: attentionRows().length }
                      }}
                    </h2>
                    <ul class="flex flex-col divide-y divide-border">
                      @for (row of attentionRows(); track row.code) {
                        <li
                          class="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                          [attr.data-code]="row.code"
                        >
                          <div class="min-w-0 flex-1">
                            <app-status-badge
                              [meaning]="attentionBadge.meaning"
                              [value]="attentionBadge.value"
                              [labelKey]="'suppliers.attention.' + row.code"
                            />
                            <p class="mt-1 text-ui text-fg-muted">
                              {{ 'suppliers.attentionWhy.' + row.code | transloco }}
                            </p>
                          </div>
                          @if (s.can_edit) {
                            @switch (row.action.kind) {
                              @case ('evaluate') {
                                <app-button
                                  size="sm"
                                  variant="secondary"
                                  (click)="openStart(evaluationOf(row.action))"
                                >
                                  {{
                                    'suppliers.detail.startKind'
                                      | transloco
                                        : { kind: kindInSentence(evaluationOf(row.action)) }
                                  }}
                                </app-button>
                              }
                              @case ('flow') {
                                @if (can(permissionOf(row.action))) {
                                  <app-button
                                    size="sm"
                                    variant="secondary"
                                    (click)="startFlow(flowOf(row.action))"
                                  >
                                    {{ 'suppliers.attentionAction.' + row.code | transloco }}
                                  </app-button>
                                }
                              }
                              @case ('edit') {
                                <a
                                  [routerLink]="['/suppliers', s.id, 'edit']"
                                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
                                >
                                  {{ 'suppliers.attentionAction.' + row.code | transloco }}
                                </a>
                              }
                            }
                          }
                        </li>
                      }
                    </ul>
                  </div>
                </app-card>
              }

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'suppliers.detail.approval' | transloco }}
                  </h2>
                  @if (!ai.unavailable()) {
                    <app-button variant="ghost" size="sm" (click)="askNextStep()">
                      <app-icon name="spark" [size]="14" />
                      {{ 'suppliers.ai.askNextStep' | transloco }}
                    </app-button>
                  }
                </div>
                <p class="mb-4 text-body text-fg">
                  {{ 'suppliers.statusHelp.' + s.status | transloco }}
                </p>
                <app-field-list [columns]="2">
                  <app-field-item labelKey="suppliers.fields.approvedAt">
                    @if (s.approved_at) {
                      {{
                        'suppliers.detail.approvedOn'
                          | transloco
                            : {
                                date: (s.approved_at | localDay),
                                name:
                                  s.approved_by?.name ?? ('suppliers.common.nobody' | transloco),
                              }
                      }}
                    } @else {
                      {{ 'suppliers.detail.notApproved' | transloco }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="suppliers.fields.lastEvaluated">
                    @if (s.last_evaluated_at) {
                      {{ s.last_evaluated_at | localDay }}
                      @if (lastScore(); as sc) {
                        · {{ 'suppliers.score.of100' | transloco: sc }}
                      }
                    } @else {
                      {{ 'suppliers.detail.neverEvaluated' | transloco }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="suppliers.fields.nextEvaluation">
                    <span
                      [class.text-warn-ink]="s.evaluation_overdue"
                      [class.font-semibold]="s.evaluation_overdue"
                      data-testid="next-evaluation"
                    >
                      @if (s.next_evaluation_at) {
                        {{
                          (s.evaluation_overdue
                            ? 'suppliers.detail.overdueSince'
                            : 'suppliers.detail.onDate'
                          ) | transloco: { date: (s.next_evaluation_at | localDay) }
                        }}
                      } @else {
                        {{ 'suppliers.list.noEvaluationDate' | transloco }}
                      }
                    </span>
                  </app-field-item>
                  <app-field-item labelKey="suppliers.fields.intervalMonths">
                    {{
                      (s.evaluation_interval_months
                        ? 'suppliers.detail.intervalOwn'
                        : 'suppliers.detail.intervalDefault'
                      )
                        | transloco
                          : {
                              months: s.effective_interval_months,
                              criticality: ('suppliers.criticality.' + s.criticality | transloco),
                            }
                    }}
                  </app-field-item>
                </app-field-list>

                @if (s.open_conditions; as c) {
                  <div
                    class="mt-4 rounded-tile border px-3 py-2.5 text-ui"
                    [class]="c.overdue ? 'border-warn bg-warn-soft' : 'border-border bg-surface-2'"
                    data-testid="open-conditions"
                  >
                    <p class="font-semibold text-fg">
                      {{ 'suppliers.detail.conditionsTitle' | transloco }}
                    </p>
                    <p class="mt-1 whitespace-pre-line text-fg">{{ c.text }}</p>
                    <p class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-meta text-fg-muted">
                      @if (c.due_at) {
                        <span [class.font-semibold]="c.overdue" [class.text-warn-ink]="c.overdue">
                          {{
                            (c.overdue
                              ? 'suppliers.detail.conditionsOverdue'
                              : 'suppliers.detail.conditionsDue'
                            ) | transloco: { date: (c.due_at | localDay) }
                          }}
                        </span>
                      }
                      @if (c.task_status) {
                        <span>
                          {{
                            'suppliers.detail.conditionsTask'
                              | transloco
                                : { status: ('suppliers.taskStatus.' + c.task_status | transloco) }
                          }}
                        </span>
                      }
                      <a
                        [routerLink]="c.evaluation_url"
                        class="font-semibold text-accent hover:underline"
                      >
                        {{ 'suppliers.detail.openDecision' | transloco }}
                      </a>
                    </p>
                  </div>
                }

                @if (required().length) {
                  <div class="mt-4" data-testid="required-assessments">
                    <h3 class="mb-2 text-ui font-semibold text-fg">
                      {{
                        'suppliers.required.title'
                          | transloco: { done: s.required_done ?? 0, total: s.required_total ?? 0 }
                      }}
                    </h3>
                    <ul
                      class="flex flex-col divide-y divide-border rounded-tile border border-border"
                    >
                      @for (r of required(); track r.kind) {
                        <li
                          class="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                          [attr.data-kind]="r.kind"
                        >
                          <span
                            class="flex h-5 w-5 flex-none items-center justify-center rounded-full"
                            [class]="
                              r.done ? 'bg-pass-soft text-pass-ink' : 'bg-surface-2 text-fg-subtle'
                            "
                            aria-hidden="true"
                          >
                            <app-icon [name]="r.done ? 'check' : 'clock'" [size]="12" />
                          </span>
                          <div class="min-w-0 flex-1">
                            <p class="text-ui font-semibold text-fg">
                              {{ 'suppliers.evaluationKind.' + r.kind | transloco }}
                              <span class="sr-only">
                                ·
                                {{
                                  (r.done
                                    ? 'suppliers.required.done'
                                    : 'suppliers.required.notDone'
                                  ) | transloco
                                }}
                              </span>
                            </p>
                            <p class="text-meta text-fg-muted">
                              {{ 'suppliers.required.why.' + r.reason | transloco }}
                            </p>
                          </div>
                          <span class="flex flex-wrap items-center gap-2 text-meta">
                            @if (r.latest; as l) {
                              <a
                                [routerLink]="['/suppliers', s.id, 'evaluations', l.id]"
                                class="inline-flex items-center gap-2 hover:underline"
                              >
                                @if (l.decision) {
                                  @let d = decision(l.decision);
                                  <app-status-badge
                                    [meaning]="d.meaning"
                                    [value]="d.value"
                                    [labelKey]="'suppliers.decision.' + l.decision"
                                  />
                                }
                                @if (scoreOf(l.score); as sc) {
                                  <span class="text-fg-muted">{{
                                    'suppliers.score.of100' | transloco: sc
                                  }}</span>
                                }
                                @if (l.decided_at) {
                                  <span class="text-fg-subtle">{{ l.decided_at | localDay }}</span>
                                }
                              </a>
                            }
                            @if (r.open_evaluation_id) {
                              <a
                                [routerLink]="[
                                  '/suppliers',
                                  s.id,
                                  'evaluations',
                                  r.open_evaluation_id,
                                ]"
                                class="font-semibold text-accent hover:underline"
                              >
                                {{ 'suppliers.required.inProgress' | transloco }}
                              </a>
                            } @else if (!r.done && s.can_edit) {
                              <app-button size="sm" variant="secondary" (click)="openStart(r.kind)">
                                {{ 'suppliers.required.start' | transloco }}
                              </app-button>
                            } @else if (!r.done) {
                              <span class="text-fg-subtle">{{
                                'suppliers.required.notStarted' | transloco
                              }}</span>
                            }
                          </span>
                        </li>
                      }
                    </ul>
                  </div>
                }
              </app-card>

              <app-supplier-agreements [supplier]="s" [canEdit]="s.can_edit" (changed)="reload()" />

              <app-supplier-evaluations-panel
                [supplier]="s"
                [canWrite]="s.can_edit"
                (startRequested)="openStart(null)"
              />

              <app-supplier-performance-panel
                [supplierId]="s.id"
                [canWrite]="s.can_edit"
                [warning]="s.performance_warning"
                (changed)="reload()"
                (evaluateRequested)="openStart('ad_hoc')"
              />

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'suppliers.detail.profile' | transloco }}
                </h2>
                @if (s.description) {
                  <div
                    class="cf-prose mb-4 text-body leading-relaxed text-fg"
                    [innerHTML]="s.description | appMarkdown"
                  ></div>
                }
                <app-field-list [columns]="2">
                  <app-field-item
                    labelKey="suppliers.fields.owner"
                    [value]="s.owner?.name"
                    empty="none"
                  />
                  <app-field-item labelKey="suppliers.fields.legalName" [value]="s.legal_name" />
                  <app-field-item
                    labelKey="suppliers.fields.registrationNumber"
                    [value]="s.registration_number"
                  />
                  <app-field-item
                    labelKey="suppliers.fields.country"
                    [value]="s.country ? (s.country | countryName) : null"
                  />
                  <app-field-item labelKey="suppliers.fields.website">
                    @if (safeWebsite(s.website); as url) {
                      <a
                        [href]="url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="break-all text-accent hover:underline"
                      >
                        {{ s.website }}
                      </a>
                    } @else if (s.website) {
                      {{ s.website }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="suppliers.detail.contact">
                    @if (s.contact_name || s.contact_email || s.contact_phone) {
                      <span class="block">{{ s.contact_name }}</span>
                      @if (s.contact_email) {
                        <a
                          [href]="'mailto:' + s.contact_email"
                          class="block break-all text-accent hover:underline"
                        >
                          {{ s.contact_email }}
                        </a>
                      }
                      @if (s.contact_phone) {
                        <span class="block">{{ s.contact_phone }}</span>
                      }
                    }
                  </app-field-item>
                  <app-field-item labelKey="suppliers.detail.riskFlags" [wide]="true">
                    @if (activeFlags().length) {
                      <span class="flex flex-wrap gap-1.5">
                        @for (flag of activeFlags(); track flag) {
                          <span
                            class="rounded-full bg-accent-soft px-2 py-0.5 text-meta font-semibold text-accent"
                            >{{ 'suppliers.flags.' + flag | transloco }}</span
                          >
                        }
                      </span>
                    } @else {
                      <span class="text-fg-subtle">{{
                        'suppliers.detail.noFlags' | transloco
                      }}</span>
                    }
                  </app-field-item>
                  <app-field-item
                    labelKey="suppliers.fields.dataLocations"
                    [wide]="true"
                    empty="none"
                  >
                    @if (locations().length) {
                      <ul class="flex flex-col gap-1" data-testid="data-locations">
                        @for (l of locations(); track l.code) {
                          <li class="flex flex-wrap items-center gap-1.5" [attr.data-code]="l.code">
                            <span>{{ l.code | countryName }}</span>
                            @if (l.zone) {
                              @let z = zone(l.zone);
                              <app-status-badge
                                [meaning]="z.meaning"
                                [value]="z.value"
                                [labelKey]="'suppliers.zones.' + l.zone"
                              />
                            }
                            @if (l.needs_review) {
                              <app-status-badge
                                meaning="lifecycle"
                                value="due"
                                labelKey="suppliers.detail.locationReview"
                                [labelParams]="{ code: l.code }"
                              />
                            }
                          </li>
                        }
                      </ul>
                    }
                  </app-field-item>
                  <app-field-item
                    labelKey="suppliers.fields.certifications"
                    [wide]="true"
                    empty="none"
                  >
                    @if (certificates().length) {
                      <ul class="flex flex-col gap-2" data-testid="certificates">
                        @for (c of certificates(); track c.id) {
                          <li class="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span class="font-semibold">{{ c.standard_name || c.label }}</span>
                            @let cb = certBadge(c.status);
                            <app-status-badge
                              [meaning]="cb.meaning"
                              [value]="cb.value"
                              [labelKey]="'suppliers.certificates.status.' + c.status"
                            />
                            <span class="w-full text-meta text-fg-muted sm:w-auto">
                              @if (c.number) {
                                {{
                                  'suppliers.certificates.numberShort'
                                    | transloco: { number: c.number }
                                }}
                              }
                              @if (c.issuer) {
                                · {{ c.issuer }}
                              }
                              @if (c.valid_until) {
                                ·
                                {{
                                  'suppliers.certificates.validUntil'
                                    | transloco: { date: (c.valid_until | localDay) }
                                }}
                              }
                              @if (c.attachment_id) {
                                ·
                                <a
                                  [routerLink]="[]"
                                  [queryParams]="{ tab: 'attachments' }"
                                  class="font-semibold text-accent hover:underline"
                                  >{{ 'suppliers.certificates.attached' | transloco }}</a
                                >
                              }
                            </span>
                          </li>
                        }
                      </ul>
                    } @else if (s.certifications.length) {
                      {{ s.certifications.join(', ') }}
                    }
                  </app-field-item>
                </app-field-list>
              </app-card>

              <app-why-it-matters scope="suppliers" page="detail" />
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="supplier"
                [entityId]="s.id"
                [canCreate]="s.can_edit"
                [entityLabel]="s.code + ' ' + s.name"
              />
            </div>
          </app-record-detail-layout>

          <app-start-evaluation-dialog
            [supplier]="s"
            [open]="startOpen()"
            [preferredKind]="startKind()"
            (closed)="startOpen.set(false)"
            (created)="onCreated(s, $event)"
          />

          <app-supplier-status-dialog
            [open]="statusOpen()"
            [current]="s.status"
            [canApprove]="s.can_approve"
            [busy]="busy()"
            [error]="statusError()"
            (confirmed)="changeStatus(s, $event)"
            (cancelled)="statusOpen.set(false)"
          />

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'suppliers.detail.deleteTitle' | transloco"
            [message]="'suppliers.detail.deleteMessage' | transloco: { code: s.code, name: s.name }"
            [confirmLabel]="'suppliers.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove(s)"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class SupplierDetailPage {
  private readonly api = inject(SuppliersApi);
  private readonly standards = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly flows = inject(CreateFlowService);
  protected readonly ai = inject(AiAvailability);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = SUPPLIER_FIELD_LABELS;
  protected readonly statusBadge = supplierStatusBadge;
  protected readonly critBadge = criticalityBadge;
  protected readonly decision = decisionBadge;
  protected readonly zone = zoneBadge;
  protected readonly certBadge = certificateBadge;
  protected readonly attentionBadge = ATTENTION_BADGE;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly supplier = signal<SupplierDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly statusOpen = signal(false);
  protected readonly statusError = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly startOpen = signal(false);
  protected readonly startKind = signal<EvaluationKind | null>(null);
  /** Confirmed requirement refs, for the assistant's page context. */
  private readonly requirementRefs = signal<readonly string[]>([]);
  /** The create-from-here flow that opened "Start vurdering" (`?newEvaluation=1`). */
  private flow: FlowContext | null = null;

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));
  /** Stored data locations with their zone and review flag (codes only on older responses). */
  protected readonly locations = computed(() => {
    const s = this.supplier();
    if (!s) {
      return [];
    }
    const details = new Map((s.data_location_details ?? []).map((d) => [d.code, d]));
    return s.data_locations.map((code) => ({
      code,
      zone: details.get(code)?.zone ?? null,
      needs_review: details.get(code)?.needs_review ?? false,
    }));
  });
  protected readonly activeFlags = computed(() => {
    const s = this.supplier();
    return s ? SUPPLIER_FLAGS.filter((f) => s[f]) : [];
  });
  protected readonly certificates = computed(() => this.supplier()?.certificates ?? []);
  protected readonly required = computed(() => this.supplier()?.required_assessments ?? []);
  protected readonly lastScore = computed(() =>
    scoreParams(this.supplier()?.last_score, null, this.language.locale()),
  );
  protected readonly attentionRows = computed<readonly AttentionRow[]>(() => {
    const s = this.supplier();
    if (!s) {
      return [];
    }
    const approved = !!s.approved_at || s.status === 'approved' || s.status === 'conditional';
    return (s.attention ?? []).map((code) => ({ code, action: attentionAction(code, approved) }));
  });

  private request = new Subscription();
  private refsRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.refsRequest.unsubscribe();
    });
    providePageContext(() => {
      const s = this.supplier();
      return {
        module: 'suppliers',
        entityType: 'supplier',
        entityId: this.id(),
        view: 'detail',
        title: s ? `${s.code} ${s.name}` : null,
        requirements: this.requirementRefs(),
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
    // "Create from here: supplier evaluation" lands on `?newEvaluation=1`.
    if (this.route.snapshot.queryParamMap.get('newEvaluation')) {
      const flow = this.flows.consume(this.route, { targetType: 'supplier_evaluation' });
      effect(() => {
        this.flow = flow();
      });
      this.startOpen.set(true);
    }
  }

  protected can(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  protected evaluationOf(action: AttentionAction): EvaluationKind {
    return action.kind === 'evaluate' ? action.evaluation : 'periodic';
  }

  protected flowOf(action: AttentionAction): string {
    return action.kind === 'flow' ? action.flow : '';
  }

  protected permissionOf(action: AttentionAction): string {
    return action.kind === 'flow' ? action.permission : '';
  }

  /** A kind's name inside a sentence ("Start førstegangsvurdering", but "KI-vurdering"). */
  protected kindInSentence(kind: EvaluationKind): string {
    return lowerFirst(this.language.translate(`suppliers.evaluationKind.${kind}`));
  }

  protected scoreOf(score: number | null) {
    return scoreParams(score, null, this.language.locale());
  }

  /** Only http(s) links are rendered as links. */
  protected safeWebsite(url: string | null): string | null {
    if (!url) {
      return null;
    }
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
    return /^https?:\/\//i.test(withScheme) ? withScheme : null;
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  protected openStatus(): void {
    this.statusError.set(null);
    this.statusOpen.set(true);
  }

  /** Open "Start vurdering" (from any tab), optionally with a kind chosen. */
  protected openStart(kind: EvaluationKind | null): void {
    this.startKind.set(kind);
    this.startOpen.set(true);
  }

  protected startFlow(key: string): void {
    const s = this.supplier();
    if (key && s) {
      void this.flows.start(key, 'supplier', s.id);
    }
  }

  protected onCreated(s: SupplierDetail, evaluation: EvaluationDetail): void {
    this.startOpen.set(false);
    if (this.flow) {
      this.flows
        .complete(evaluation.id, 'supplier_evaluation')
        .pipe(catchError(() => of(null)))
        .subscribe();
      this.flow = null;
    }
    void this.router.navigate(['/suppliers', s.id, 'evaluations', evaluation.id]);
  }

  protected askSummary(): void {
    this.ask.showWith(this.language.translate('suppliers.ai.prompts.summarise'));
  }

  protected askNextStep(): void {
    this.ask.showWith(this.language.translate('suppliers.ai.prompts.nextStep'));
  }

  protected changeStatus(s: SupplierDetail, change: StatusChange): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.statusError.set(null);
    this.api.setStatus(orgId, s.id, change).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.statusOpen.set(false);
        this.supplier.set(updated);
        this.notifications.success('suppliers.detail.statusChanged');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.statusError.set(supplierErrorKey(err));
      },
    });
  }

  protected remove(s: SupplierDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.delete(orgId, s.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('suppliers.detail.deleted', { code: s.code });
        void this.router.navigate(['/suppliers']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(supplierErrorKey(err));
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
    this.request = this.api.get(orgId, id).subscribe({
      next: (s) => {
        this.supplier.set(s);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
    this.loadRefs(orgId, id);
  }

  /** The confirmed requirement refs (quietly empty without `standards:read`). */
  private loadRefs(orgId: string, id: string): void {
    this.refsRequest.unsubscribe();
    if (!this.permissions().includes('standards:read')) {
      return;
    }
    this.refsRequest = this.standards
      .listLinks(orgId, { entity_type: 'supplier', entity_id: id })
      .pipe(catchError(() => of([])))
      .subscribe((links) =>
        this.requirementRefs.set(
          links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
        ),
      );
  }
}
