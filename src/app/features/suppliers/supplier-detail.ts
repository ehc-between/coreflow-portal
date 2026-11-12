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
import { providePageContext } from '../../core/ai/page-context';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
import { TeachMe } from '../../shared/guidance/teach-me';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { criticalityTone, decisionTone, statusTone } from './data/supplier-display';
import { supplierErrorKey } from './data/supplier-errors';
import {
  EVALUATION_KINDS,
  EvaluationKind,
  SUPPLIER_FLAGS,
  SupplierDetail,
} from './data/supplier.models';
import { SuppliersApi } from './data/suppliers-api';
import { StatusChange, SupplierStatusDialog } from './detail/status-dialog';
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
  evaluation_interval_months: 'suppliers.fields.intervalMonths',
  next_evaluation_at: 'suppliers.fields.nextEvaluation',
  approved_at: 'suppliers.fields.approvedAt',
  approved_by: 'suppliers.fields.approvedBy',
};

/**
 * A supplier's page (`/suppliers/:id`): status, criticality and the re-evaluation
 * schedule up front; the profile (contact, risk flags, data locations,
 * certifications); evaluations with the latest decision per kind; the performance
 * log; and the shared record tabs (tasks, related items such as contracts and
 * processors, activity, comments, attachments, revisions). Actions: edit, change
 * status (with a reason), start an evaluation, delete, and ask the assistant.
 */
@Component({
  selector: 'app-supplier-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    MarkdownPipe,
    Alert,
    AskAbout,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EntityTasks,
    GuideIntro,
    HasPermissionDirective,
    Icon,
    LessonView,
    RecordDetailLayout,
    SupplierEvaluationsPanel,
    SupplierPerformancePanel,
    SupplierStatusDialog,
    SupportsRequirements,
    TeachMe,
    WatchButton,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="mx-auto max-w-[1180px] px-4 pt-7 text-[14px] text-fg-muted sm:px-8">
          {{ 'suppliers.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            routerLink="/suppliers"
            class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'suppliers.common.backToRegister' | transloco }}
          </a>
          <app-alert>{{ 'suppliers.detail.notFound' | transloco }}</app-alert>
        </div>
      }
      @default {
        @if (supplier(); as s) {
          <app-record-detail-layout
            entityType="supplier"
            [entityId]="s.id"
            [tabs]="tabs"
            [canEdit]="s.can_edit"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            backLink="/suppliers"
            backLabelKey="suppliers.common.backToRegister"
          >
            <div header>
              <div class="mb-1.5 flex flex-wrap items-center gap-2">
                <span class="font-mono text-[12.5px] text-fg-muted">{{ s.code }}</span>
                <app-badge [tone]="supplierTone(s.status)">
                  {{ 'suppliers.status.' + s.status | transloco }}
                </app-badge>
                <app-badge [tone]="critTone(s.criticality)">
                  {{ 'suppliers.criticality.' + s.criticality | transloco }}
                </app-badge>
                @if (s.evaluation_overdue) {
                  <app-badge tone="fail">
                    {{ 'suppliers.detail.evaluationOverdue' | transloco }}
                  </app-badge>
                }
              </div>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
              >
                {{ s.name }}
              </h1>
            </div>

            <ng-container actions>
              <app-watch-button entityType="supplier" [entityId]="s.id" />
              <app-button variant="ghost" size="sm" (click)="askSummary()">
                <app-icon name="spark" [size]="14" />
                {{ 'suppliers.ai.summarise' | transloco }}
              </app-button>
              @if (s.can_edit) {
                <a
                  [routerLink]="['/suppliers', s.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'suppliers.common.edit' | transloco }}
                </a>
                <app-button variant="secondary" size="sm" (click)="openStatus()">
                  {{ 'suppliers.detail.changeStatus' | transloco }}
                </app-button>
                <app-button size="sm" (click)="startEvaluation()">
                  {{ 'suppliers.evaluations.start' | transloco }}
                </app-button>
              }
              @if (s.can_delete) {
                <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'suppliers.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-5">
              <app-guide-intro scope="suppliers" page="detail" />

              <app-card>
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'suppliers.detail.approval' | transloco }}
                  </h2>
                  <app-ask-about
                    [prompt]="'suppliers.ai.prompts.nextStep' | transloco"
                    field="status"
                  />
                </div>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.status' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ 'suppliers.statusHelp.' + s.status | transloco }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.approvedAt' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (s.approved_at) {
                        {{
                          'suppliers.detail.approvedOn'
                            | transloco
                              : {
                                  date: (s.approved_at | localDay),
                                  name: s.approved_by?.name ?? '–',
                                }
                        }}
                      } @else {
                        {{ 'suppliers.detail.notApproved' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.lastEvaluated' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (s.last_evaluated_at) {
                        {{ s.last_evaluated_at | localDay }}
                        @if (s.last_score !== null) {
                          ·
                          {{
                            'suppliers.list.score'
                              | transloco: { score: (s.last_score | localNumber: '1.0-1') }
                          }}
                        }
                      } @else {
                        {{ 'suppliers.detail.neverEvaluated' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.nextEvaluation' | transloco }}
                    </dt>
                    <dd
                      [class.text-fail]="s.evaluation_overdue"
                      [class.font-semibold]="s.evaluation_overdue"
                    >
                      @if (s.next_evaluation_at) {
                        {{ s.next_evaluation_at | localDay }}
                      } @else {
                        {{ 'suppliers.list.noEvaluationDate' | transloco }}
                      }
                    </dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.intervalMonths' | transloco }}
                    </dt>
                    <dd class="text-fg">
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
                    </dd>
                  </div>
                </dl>

                <h3 class="mt-4 mb-2 text-[13px] font-semibold text-fg-muted">
                  {{ 'suppliers.detail.latestAssessments' | transloco }}
                </h3>
                <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  @for (kind of kinds; track kind) {
                    <li class="rounded-tile border border-border px-3 py-2">
                      <p class="text-[12px] text-fg-muted">
                        {{ 'suppliers.evaluationKind.' + kind | transloco }}
                      </p>
                      @if (assessment(s, kind); as a) {
                        <a
                          [routerLink]="['/suppliers', s.id, 'evaluations', a.id]"
                          class="flex flex-wrap items-center gap-2 text-[13px] text-fg hover:underline"
                        >
                          @if (a.decision) {
                            <app-badge [tone]="decisionTone(a.decision)">
                              {{ 'suppliers.decision.' + a.decision | transloco }}
                            </app-badge>
                          }
                          @if (a.score !== null) {
                            <span>{{
                              'suppliers.list.score'
                                | transloco: { score: (a.score | localNumber: '1.0-1') }
                            }}</span>
                          }
                          @if (a.decided_at) {
                            <span class="text-fg-subtle">{{ a.decided_at | localDay }}</span>
                          }
                        </a>
                      } @else {
                        <p class="text-[13px] text-fg-subtle">
                          {{ 'suppliers.detail.noAssessment' | transloco }}
                        </p>
                      }
                    </li>
                  }
                </ul>
              </app-card>

              <app-supplier-evaluations-panel
                [supplier]="s"
                [canWrite]="s.can_edit"
                [startRequest]="startRequest()"
                (created)="reload()"
              />

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'suppliers.detail.profile' | transloco }}
                </h2>
                @if (s.description) {
                  <div
                    class="cf-prose mb-4 text-[13.5px] leading-relaxed text-fg"
                    [innerHTML]="s.description | appMarkdown"
                  ></div>
                }
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.category' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ 'suppliers.category.' + s.category | transloco }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.owner' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ s.owner?.name ?? ('suppliers.common.nobody' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.legalName' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ s.legal_name || '–' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.registrationNumber' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ s.registration_number || '–' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.country' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ s.country || '–' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.website' | transloco }}
                    </dt>
                    <dd class="truncate text-fg">
                      @if (safeWebsite(s.website); as url) {
                        <a
                          [href]="url"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-accent hover:underline"
                        >
                          {{ s.website }}
                        </a>
                      } @else {
                        {{ s.website || '–' }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.detail.contact' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (s.contact_name || s.contact_email || s.contact_phone) {
                        <span class="block">{{ s.contact_name }}</span>
                        @if (s.contact_email) {
                          <a
                            [href]="'mailto:' + s.contact_email"
                            class="block text-accent hover:underline"
                          >
                            {{ s.contact_email }}
                          </a>
                        }
                        @if (s.contact_phone) {
                          <span class="block">{{ s.contact_phone }}</span>
                        }
                      } @else {
                        –
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.detail.riskFlags' | transloco }}
                    </dt>
                    <dd class="flex flex-wrap gap-1.5">
                      @for (flag of activeFlags(); track flag) {
                        <app-badge tone="accent">{{
                          'suppliers.flags.' + flag | transloco
                        }}</app-badge>
                      } @empty {
                        <span class="text-fg-subtle">{{
                          'suppliers.detail.noFlags' | transloco
                        }}</span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.dataLocations' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ s.data_locations.length ? s.data_locations.join(', ') : '–' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'suppliers.fields.certifications' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ s.certifications.length ? s.certifications.join(', ') : '–' }}
                    </dd>
                  </div>
                </dl>
                @if (s.processes_personal_data) {
                  <p class="mt-4 rounded-tile bg-surface-2 px-3 py-2 text-[12.5px] text-fg-muted">
                    {{ 'suppliers.detail.processorHint' | transloco }}
                  </p>
                }
              </app-card>

              <app-supplier-performance-panel
                [supplierId]="s.id"
                [canWrite]="s.can_edit"
                (changed)="reload()"
              />

              <app-why-it-matters scope="suppliers" page="detail" />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 font-display text-[14px] font-bold text-fg">
                  {{ 'suppliers.detail.learn' | transloco }}
                </h2>
                <div class="flex flex-col items-start gap-2">
                  <app-lesson scope="suppliers" lesson="evaluating-suppliers" />
                  <app-lesson scope="suppliers" lesson="third-party-security" />
                  <app-teach-me topic="suppliers.detail" [subject]="s.name" />
                </div>
              </app-card>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="supplier" [entityId]="s.id" />
              </app-card>
            </ng-container>

            <div tasks>
              <app-entity-tasks
                entityType="supplier"
                [entityId]="s.id"
                [canCreate]="s.can_edit"
                [entityLabel]="s.code + ' ' + s.name"
              />
            </div>
          </app-record-detail-layout>

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
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = SUPPLIER_FIELD_LABELS;
  protected readonly kinds = EVALUATION_KINDS;
  protected readonly supplierTone = statusTone;
  protected readonly critTone = criticalityTone;
  protected readonly decisionTone = decisionTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly supplier = signal<SupplierDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly statusOpen = signal(false);
  protected readonly statusError = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly startRequest = signal(0);

  protected readonly canAudit = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('audit:read'),
  );
  protected readonly activeFlags = computed(() => {
    const s = this.supplier();
    return s ? SUPPLIER_FLAGS.filter((f) => s[f]) : [];
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const s = this.supplier();
      return {
        module: 'suppliers',
        entityType: 'supplier',
        entityId: this.id(),
        view: 'detail',
        title: s ? `${s.code} ${s.name}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
  }

  protected assessment(s: SupplierDetail, kind: EvaluationKind) {
    return s.latest_assessments[kind] ?? null;
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

  protected startEvaluation(): void {
    this.startRequest.update((n) => n + 1);
  }

  protected askSummary(): void {
    this.ask.showWith(this.language.translate('suppliers.ai.prompts.summarise'));
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
  }
}
