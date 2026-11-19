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
import { CountryNamePipe } from '../../shared/locale/countries';
import { LocalDayPipe, formatLocalDay } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { AlsoCustomer } from '../../shared/customers/also-customer';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import {
  certificateBadge,
  criticalityBadge,
  dpaBadge,
  scoreParams,
  supplierStatusBadge,
  zoneBadge,
} from './data/supplier-display';
import { supplierErrorKey } from './data/supplier-errors';
import {
  EvaluationDetail,
  EvaluationKind,
  SUPPLIER_FLAGS,
  SupplierDetail,
} from './data/supplier.models';
import { SuppliersApi } from './data/suppliers-api';
import { StartEvaluationDialog } from './detail/start-evaluation-dialog';
import { StatusChange, SupplierStatusDialog } from './detail/status-dialog';
import {
  SUPPLIER_STATUS_TONE,
  SupplierTodo,
  showOnDetails,
  supplierTodos,
} from './detail/supplier-anatomy';
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

/**
 * A supplier's page (`/suppliers/:id`), built on the detail-page anatomy
 * (docs/ux-guide.md §2.7). Header: code · category · status, "Start vurdering" and
 * "Rediger", assistant actions in "Spør KI". Hovedinformasjon: the status sentence,
 * what they deliver, how critical they are, approval and last evaluation, and what
 * they do for the organisation (personal data with the DPA status, system access,
 * cloud, AI), plus open approval conditions. Details: the agreements hub (supplier,
 * processor and DPA in one place: contracts, processor entries, transfers, AI
 * systems, assets, risks, deviations), evaluations with the required assessments,
 * the performance log and the remaining profile fields (empty ones hidden). One
 * "Oppfølging" card: each attention flag and missing assessment with the step that
 * closes it, the requirements, the connections and owner / next re-evaluation.
 * `?newEvaluation=1` (create from here) opens "Start vurdering".
 */
@Component({
  selector: 'app-supplier-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    AlsoCustomer,
    CountryNamePipe,
    LocalDayPipe,
    MarkdownPipe,
    Button,
    ConfirmDialog,
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
    StartEvaluationDialog,
    StatusBadge,
    SupplierAgreementsCard,
    SupplierEvaluationsPanel,
    SupplierPerformancePanel,
    SupplierStatusDialog,
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
            [anatomy]="true"
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
            [missing]="missing()"
            backLink="/suppliers"
            backLabelKey="suppliers.common.backToRegister"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ s.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'suppliers.category.' + s.category | transloco }}</span>
              <span aria-hidden="true">·</span>
              @let st = statusBadge(s.status);
              <app-status-badge
                [meaning]="st.meaning"
                [value]="st.value"
                [labelKey]="'suppliers.status.' + s.status"
              />
              @if (s.evaluation_overdue) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="suppliers.detail.evaluationOverdue"
                />
              }
            </ng-container>

            @if (s.can_edit) {
              <app-button primary data-testid="header-start-evaluation" (click)="openStart(null)">
                {{ 'suppliers.evaluations.start' | transloco }}
              </app-button>
            }
            @if (s.can_edit) {
              <a
                secondary
                [routerLink]="editLink()"
                class="inline-flex h-9 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
              >
                {{ 'suppliers.common.edit' | transloco }}
              </a>
            }
            @if (s.can_edit) {
              <button appMenuItem overflow type="button" (click)="openStatus()">
                {{ 'suppliers.detail.changeStatus' | transloco }}
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

            <button appMenuItem ask type="button" (click)="askSummary()">
              <app-icon name="spark" [size]="15" />
              {{ 'suppliers.ai.summarise' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askNextStep()">
              <app-icon name="spark" [size]="15" />
              {{ 'suppliers.ai.askNextStep' | transloco }}
            </button>

            <app-help-strip help scope="suppliers" page="detail" lesson="evaluating-suppliers" />

            <app-record-lead record-lead [fillLink]="s.can_edit ? editLink() : null">
              <app-record-status-line status [tone]="statusTone()">
                {{ 'suppliers.detail.lead.status.' + s.status | transloco }}
              </app-record-status-line>
              <app-field-item
                size="lead"
                labelKey="suppliers.detail.lead.whatTheyDeliver"
                [wide]="true"
              >
                @if (s.description) {
                  <div
                    class="cf-prose text-body leading-relaxed text-fg"
                    [innerHTML]="s.description | appMarkdown"
                  ></div>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="suppliers.detail.lead.criticality">
                @let cr = critBadge(s.criticality);
                <app-status-badge
                  [meaning]="cr.meaning"
                  [value]="cr.value"
                  [labelKey]="'suppliers.criticality.' + s.criticality"
                />
                <span class="mt-1 block text-meta text-fg-muted">
                  {{
                    'suppliers.detail.lead.criticalityHint'
                      | transloco: { months: s.effective_interval_months }
                  }}
                </span>
              </app-field-item>
              <app-field-item size="lead" labelKey="suppliers.detail.lead.approval">
                <span class="block" data-testid="approval">
                  @if (s.approved_at) {
                    {{
                      'suppliers.detail.lead.approvedOn'
                        | transloco
                          : {
                              date: (s.approved_at | localDay),
                              name: s.approved_by?.name ?? ('suppliers.common.nobody' | transloco),
                            }
                    }}
                  } @else {
                    {{ 'suppliers.detail.notApproved' | transloco }}
                  }
                </span>
                <span class="mt-1 block text-meta text-fg-muted">
                  @if (s.last_evaluated_at) {
                    @if (lastScore(); as sc) {
                      {{
                        'suppliers.detail.lead.lastEvaluatedScore'
                          | transloco: { date: (s.last_evaluated_at | localDay), score: sc.score }
                      }}
                    } @else {
                      {{
                        'suppliers.detail.lead.lastEvaluated'
                          | transloco: { date: (s.last_evaluated_at | localDay) }
                      }}
                    }
                  } @else {
                    {{ 'suppliers.detail.neverEvaluated' | transloco }}
                  }
                </span>
              </app-field-item>
              <app-field-item size="lead" labelKey="suppliers.detail.lead.whatTheyDo" [wide]="true">
                @if (activeFlags().length) {
                  <ul class="flex flex-col gap-1.5" data-testid="supplier-flags">
                    @for (flag of activeFlags(); track flag) {
                      <li class="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-fg">
                        <app-icon
                          name="check"
                          [size]="14"
                          class="flex-none text-fg-muted"
                          aria-hidden="true"
                        />
                        {{ 'suppliers.flags.' + flag | transloco }}
                        @if (flag === 'processes_personal_data' && s.dpa_status) {
                          @let d = dpa(s.dpa_status);
                          <app-status-badge
                            [meaning]="d.meaning"
                            [value]="d.value"
                            [labelKey]="'suppliers.agreements.dpaStatus.' + s.dpa_status"
                            data-testid="lead-dpa"
                          />
                        }
                      </li>
                    }
                  </ul>
                } @else {
                  <span class="text-body text-fg-muted">{{
                    'suppliers.detail.noFlags' | transloco
                  }}</span>
                }
              </app-field-item>
              @if (s.open_conditions; as c) {
                <div
                  class="rounded-tile border px-3 py-2.5 text-ui sm:col-span-2"
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
                      <span aria-hidden="true">→</span>
                    </a>
                  </p>
                </div>
              }
            </app-record-lead>

            <div class="flex flex-col gap-5">
              <app-supplier-agreements [supplier]="s" [canEdit]="s.can_edit" (changed)="reload()" />

              <app-supplier-evaluations-panel
                [supplier]="s"
                [canWrite]="s.can_edit"
                (startRequested)="openStart($event)"
              />

              <app-supplier-performance-panel
                [supplierId]="s.id"
                [canWrite]="s.can_edit"
                [warning]="s.performance_warning"
                (changed)="reload()"
                (evaluateRequested)="openStart('ad_hoc')"
              />

              <app-record-details [columns]="2" [fillLink]="s.can_edit ? editLink() : null">
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
                <app-field-item labelKey="suppliers.fields.dataLocations" [wide]="true">
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
                <app-field-item labelKey="suppliers.fields.certifications" [wide]="true">
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
              </app-record-details>
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="supplier"
                [entityId]="s.id"
                [canCreate]="s.can_edit"
                [entityLabel]="s.code + ' ' + s.name"
              />
            </div>

            <app-also-customer follow-up-connections [orgNumber]="s.registration_number" />

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="suppliers.fields.owner"
                [value]="s.owner?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="suppliers.fields.nextEvaluation"
                [keepEmpty]="true"
                emptyKey="kit.detail.meta.notPlanned"
                emptyActionKey="kit.detail.meta.plan"
                [emptyLink]="s.can_edit ? editLink() : null"
              >
                @if (s.next_evaluation_at) {
                  <span
                    [class.text-warn-ink]="s.evaluation_overdue"
                    [class.font-semibold]="s.evaluation_overdue"
                    data-testid="next-evaluation"
                  >
                    {{
                      (s.evaluation_overdue
                        ? 'suppliers.detail.overdueSince'
                        : 'suppliers.detail.onDate'
                      ) | transloco: { date: (s.next_evaluation_at | localDay) }
                    }}
                  </span>
                }
              </app-field-item>
              <app-field-item layout="inline" labelKey="suppliers.detail.meta.interval">
                {{
                  (s.evaluation_interval_months
                    ? 'suppliers.detail.meta.intervalOwn'
                    : 'suppliers.detail.meta.intervalDefault'
                  ) | transloco: { months: s.effective_interval_months }
                }}
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="suppliers.detail.meta.updated"
                [value]="s.updated_at | localDay"
              />
            </app-record-meta>

            <div aside-learn>
              <app-why-it-matters scope="suppliers" page="detail" />
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
  protected readonly zone = zoneBadge;
  protected readonly certBadge = certificateBadge;
  protected readonly dpa = dpaBadge;

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
  protected readonly lastScore = computed(() =>
    scoreParams(this.supplier()?.last_score, null, this.language.locale()),
  );
  protected readonly editLink = computed(() => ['/suppliers', this.id(), 'edit']);
  protected readonly statusTone = computed(() => {
    const s = this.supplier();
    return s ? SUPPLIER_STATUS_TONE[s.status] : 'neutral';
  });
  /** "Oppfølging": what the supplier still needs, each line with the step that closes it. */
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const s = this.supplier();
    // Kind names and dates are put into the lines; re-run on a language switch.
    this.language.active();
    return s ? supplierTodos(s, (p) => this.can(p)).map((t) => this.toItem(s, t)) : [];
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

  /** A kind's name inside a sentence ("Start førstegangsvurdering", but "KI-vurdering"). */
  protected kindInSentence(kind: EvaluationKind): string {
    return lowerFirst(this.language.translate(`suppliers.evaluationKind.${kind}`));
  }

  /** One "Oppfølging" line with its click. */
  private toItem(s: SupplierDetail, t: SupplierTodo): RecordMissingItem {
    const base = { key: t.key, labelKey: t.labelKey };
    switch (t.kind) {
      case 'start':
        return {
          ...base,
          params: { kind: this.kindInSentence(t.evaluation) },
          action: () => this.openStart(t.evaluation),
        };
      case 'open':
        return {
          ...base,
          params: { kind: this.kindInSentence(t.evaluation) },
          link: ['/suppliers', s.id, 'evaluations', t.evaluationId],
        };
      case 'flow':
        return { ...base, action: () => this.startFlow(t.flow) };
      case 'agreements':
        return { ...base, action: () => this.showAgreements() };
      case 'link':
        return {
          ...base,
          params: { date: formatLocalDay(t.date, 'mediumDate', this.language.locale()) },
          link: t.url,
        };
      default:
        return { ...base, link: this.editLink() };
    }
  }

  /** Bring the agreements card into view (it is on the Details tab). */
  private showAgreements(): void {
    showOnDetails(this.router, this.route, 'supplier-agreements');
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
