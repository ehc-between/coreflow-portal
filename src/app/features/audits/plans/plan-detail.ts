import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { ClauseChips } from '../../../shared/guidance/clause-chips';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { AuditAccess } from '../data/audit-access';
import {
  findingStatusTone,
  findingTypeTone,
  planStatusTone,
  riskTone,
} from '../data/audit-display';
import {
  Finding,
  ListResponse,
  PlanAction,
  PlanDetail,
  REASON_REQUIRED,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { PlanChecklist } from './plan-checklist';
import { PlanReportPanel } from './plan-report-panel';
import { PlanTeam } from './plan-team';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Field labels of a plan revision snapshot. */
export const PLAN_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'audits.fields.title',
  kind: 'audits.fields.kind',
  status: 'audits.fields.status',
  scope: 'audits.fields.scope',
  criteria: 'audits.fields.criteria',
  objectives: 'audits.fields.objectives',
  frameworks: 'audits.fields.frameworks',
  clause_refs: 'audits.fields.clauseRefs',
  risk_level: 'audits.fields.risk',
  planned_start: 'audits.fields.plannedStart',
  planned_end: 'audits.fields.plannedEnd',
  owner_user_id: 'audits.fields.owner',
  report_summary: 'audits.fields.reportSummary',
  report_conclusion: 'audits.fields.reportConclusion',
};

/** Primary (filled) style for the action that moves the audit forward. */
const FORWARD: ReadonlySet<PlanAction> = new Set([
  'start',
  'finish_fieldwork',
  'submit_report',
  'approve_report',
]);

/**
 * `/audits/plans/:id`: one audit — scope and criteria, the audit team with competence
 * and independence checks, the checklist, findings and the report with approval —
 * plus related records, activity, comments, attachments and revision history.
 */
@Component({
  selector: 'app-audit-plan-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    RecordDetailLayout,
    WatchButton,
    AskAbout,
    ClauseChips,
    GuideIntro,
    WhyItMatters,
    LessonView,
    SupportsRequirements,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    PromptDialog,
    AuditLoadState,
    PlanTeam,
    PlanChecklist,
    PlanReportPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.value(); as p) {
      <app-record-detail-layout
        entityType="audit_plan"
        [entityId]="p.id"
        [tabs]="tabs"
        [canEdit]="access.canWrite()"
        [includeAudit]="access.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/audits/plans"
        backLabelKey="audits.plans.back"
      >
        <div header>
          <p class="text-[12.5px] font-semibold text-fg-subtle">{{ p.code }}</p>
          <div class="flex items-start gap-2">
            <h1
              class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            >
              {{ p.title }}
            </h1>
            <app-ask-about
              class="mt-1.5 flex-none"
              [prompt]="'audits.planDetail.askAbout' | transloco: { code: p.code }"
            />
          </div>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            <app-badge [tone]="statusTone(p.status)">{{
              'audits.planStatus.' + p.status | transloco
            }}</app-badge>
            <app-badge tone="neutral">{{ 'audits.kind.' + p.kind | transloco }}</app-badge>
            <app-badge [tone]="riskTone(p.risk_level)">{{
              'audits.risk.' + p.risk_level | transloco
            }}</app-badge>
          </div>
        </div>

        <div actions class="flex flex-wrap items-center gap-2">
          <app-watch-button entityType="audit_plan" [entityId]="p.id" />
          @for (a of p.available_actions; track a) {
            <app-button
              size="sm"
              [variant]="forward.has(a) ? 'primary' : 'secondary'"
              [disabled]="saving.busy()"
              (click)="transition(a)"
            >
              {{ 'audits.planAction.' + a | transloco }}
            </app-button>
          }
          @if (canEdit()) {
            <a
              [routerLink]="['/audits/plans', p.id, 'edit']"
              class="inline-flex h-8 items-center rounded-[10px] border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
            >
              {{ 'audits.common.edit' | transloco }}
            </a>
          }
          @if (access.canManage()) {
            <app-button size="sm" variant="ghost" (click)="deleting.set(true)">
              {{ 'audits.common.delete' | transloco }}
            </app-button>
          }
        </div>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="audits" page="planDetail" />
          @if (p.status_reason) {
            <p
              class="rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[13px] text-fg-muted"
            >
              {{ 'audits.planDetail.statusReason' | transloco: { reason: p.status_reason } }}
            </p>
          }

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'audits.planDetail.about' | transloco }}
            </h2>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.scope' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ p.scope || '–' }}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.criteria' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ p.criteria || '–' }}</dd>
              </div>
              @if (p.objectives) {
                <div class="sm:col-span-2">
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'audits.fields.objectives' | transloco }}
                  </dt>
                  <dd class="whitespace-pre-line text-fg">{{ p.objectives }}</dd>
                </div>
              }
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.frameworks' | transloco }}
                </dt>
                <dd class="text-fg">
                  @for (f of p.frameworks; track f; let last = $last) {
                    {{ 'audits.frameworks.' + f | transloco }}{{ last ? '' : ', ' }}
                  } @empty {
                    –
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.clauseRefs' | transloco }}
                </dt>
                <dd>
                  @if (p.clause_refs.length) {
                    <app-clause-chips [clauses]="p.clause_refs" />
                  } @else {
                    –
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.schedule' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{
                    'audits.planDetail.range'
                      | transloco
                        : {
                            start: (p.planned_start | localDay) || '–',
                            end: (p.planned_end | localDay) || '–',
                          }
                  }}
                </dd>
              </div>
              @if (p.actual_start) {
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'audits.fields.actual' | transloco }}
                  </dt>
                  <dd class="text-fg">
                    {{
                      'audits.planDetail.range'
                        | transloco
                          : {
                              start: (p.actual_start | localDay),
                              end: (p.actual_end | localDay) || '–',
                            }
                    }}
                  </dd>
                </div>
              }
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.owner' | transloco }}
                </dt>
                <dd class="text-fg">{{ p.owner?.name || '–' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.leadAuditor' | transloco }}
                </dt>
                <dd class="text-fg">{{ p.lead_auditor?.name || '–' }}</dd>
              </div>
              @if (p.programme) {
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'audits.fields.programme' | transloco }}
                  </dt>
                  <dd>
                    <a
                      [routerLink]="['/audits/programmes', p.programme.id]"
                      class="font-semibold text-accent hover:underline"
                    >
                      {{ p.programme.code }} · {{ p.programme.title }}
                    </a>
                  </dd>
                </div>
              }
              @if (p.kind === 'external') {
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'audits.fields.partyName' | transloco }}
                  </dt>
                  <dd class="text-fg">
                    {{ p.external_party_name || '–' }}
                    @if (p.external_party_type) {
                      <span class="text-fg-muted"
                        >({{ 'audits.partyType.' + p.external_party_type | transloco }})</span
                      >
                    }
                  </dd>
                </div>
                @if (p.certification_id) {
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'audits.fields.certification' | transloco }}
                    </dt>
                    <dd>
                      <a
                        [routerLink]="['/audits/certifications', p.certification_id]"
                        class="font-semibold text-accent hover:underline"
                      >
                        {{ 'audits.planDetail.openCertification' | transloco }}
                      </a>
                    </dd>
                  </div>
                }
              }
              @if (departmentNames().length) {
                <div class="sm:col-span-2">
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'audits.fields.departments' | transloco }}
                  </dt>
                  <dd class="text-fg">{{ departmentNames().join(', ') }}</dd>
                </div>
              }
            </dl>
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'audits.planDetail.team' | transloco }}
            </h2>
            <app-audit-plan-team [plan]="p" [editable]="teamEditable()" (changed)="reload()" />
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'audits.planDetail.checklist' | transloco }}
            </h2>
            <app-audit-plan-checklist
              [plan]="p"
              [editable]="checklistEditable()"
              [answerable]="answerable()"
              [canRaise]="answerable()"
              (changed)="reload()"
            />
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[16px] font-bold text-fg">
                {{ 'audits.planDetail.findings' | transloco: { count: p.findings_total } }}
              </h2>
              @if (answerable()) {
                <a
                  [routerLink]="['/audits/plans', p.id, 'findings', 'new']"
                  class="text-[13px] font-semibold text-accent hover:underline"
                >
                  {{ 'audits.findings.new' | transloco }}
                </a>
              }
            </div>
            @if (findings.value()?.items; as items) {
              @if (items.length) {
                <ul class="divide-y divide-border">
                  @for (f of items; track f.id) {
                    <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                      <a
                        [routerLink]="['/audits/findings', f.id]"
                        class="min-w-0 flex-1 text-[13.5px] font-semibold text-fg hover:text-accent"
                      >
                        <span class="text-fg-subtle">{{ f.code }}</span> {{ f.title }}
                      </a>
                      <app-badge [tone]="typeTone(f.finding_type)">{{
                        'audits.findingType.' + f.finding_type | transloco
                      }}</app-badge>
                      <app-badge [tone]="findingTone(f.status)">{{
                        'audits.findingStatus.' + f.status | transloco
                      }}</app-badge>
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-[13px] text-fg-muted">
                  {{ 'audits.planDetail.noFindings' | transloco }}
                </p>
              }
            }
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'audits.planDetail.report' | transloco }}
            </h2>
            <app-audit-plan-report-panel [plan]="p" (saved)="data.set($event)" />
          </app-card>

          <app-card>
            <app-supports-requirements entityType="audit_plan" [entityId]="p.id" />
          </app-card>
        </div>

        <div aside class="flex flex-col gap-4">
          <app-why-it-matters scope="audits" page="planDetail" />
          <app-lesson scope="audits" lesson="audit-team" />
        </div>
      </app-record-detail-layout>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-audit-load-state [state]="data.state()" (retry)="reload()" />
      </div>
    }

    <app-prompt-dialog
      [open]="!!pendingAction()"
      [title]="'audits.planAction.' + (pendingAction() ?? 'cancel') | transloco"
      [message]="'audits.common.reasonMessage' | transloco"
      [label]="'audits.common.reason' | transloco"
      [required]="true"
      [busy]="saving.busy()"
      [confirmLabel]="'audits.planAction.' + (pendingAction() ?? 'cancel') | transloco"
      [cancelLabel]="'audits.common.cancel' | transloco"
      (confirmed)="runTransition(pendingAction()!, $event)"
      (cancelled)="pendingAction.set(null)"
    />
    <app-confirm-dialog
      [open]="deleting()"
      [title]="'audits.planDetail.deleteTitle' | transloco"
      [message]="'audits.planDetail.deleteMessage' | transloco"
      [confirmLabel]="'audits.common.delete' | transloco"
      [cancelLabel]="'audits.common.cancel' | transloco"
      [busy]="saving.busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(false)"
    />
  `,
})
export class PlanDetailPage {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly options = inject(AssigneeOptionsService);
  protected readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = PLAN_FIELD_LABELS;
  protected readonly forward = FORWARD;
  protected readonly statusTone = planStatusTone;
  protected readonly riskTone = riskTone;
  protected readonly typeTone = findingTypeTone;
  protected readonly findingTone = findingStatusTone;

  protected readonly data = loadable<PlanDetail>();
  protected readonly findings = loadable<ListResponse<Finding>>();
  protected readonly saving = mutator();
  protected readonly pendingAction = signal<PlanAction | null>(null);
  protected readonly deleting = signal(false);

  private readonly status = computed(() => this.data.value()?.status ?? null);
  private readonly locked = computed(
    () => this.status() === 'closed' || this.status() === 'cancelled',
  );
  protected readonly canEdit = computed(() => this.access.canWrite() && !this.locked());
  protected readonly teamEditable = computed(
    () => this.canEdit() && (this.status() === 'planned' || this.status() === 'in_progress'),
  );
  protected readonly checklistEditable = computed(
    () => this.canEdit() && (this.status() === 'planned' || this.status() === 'in_progress'),
  );
  protected readonly answerable = computed(
    () => this.canEdit() && (this.status() === 'in_progress' || this.status() === 'reporting'),
  );
  protected readonly departmentNames = computed(() => {
    const ids = this.data.value()?.auditee_department_ids ?? [];
    const known = new Map(
      this.options.options().departments.map((d) => [d.value.replace(/^department:/, ''), d.label]),
    );
    return ids.map((id) => known.get(id)).filter((n): n is string => !!n);
  });

  constructor() {
    this.options.ensureLoaded();
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_plan',
      entityId: this.id(),
      view: 'detail',
      title: this.data.value()?.title ?? null,
    }));
    effect(() => {
      this.access.orgId();
      this.id();
      untracked(() => this.reload(false));
    });
  }

  reload(quiet = true): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    if (!quiet) {
      this.data.value.set(null);
    }
    this.data.load(this.api.getPlan(orgId, this.id()), quiet);
    this.findings.load(
      this.api.listFindings(orgId, { plan_id: this.id(), sort: 'severity', limit: 200 }),
      true,
    );
  }

  protected transition(action: PlanAction): void {
    if (REASON_REQUIRED.has(`plan:${action}`)) {
      this.pendingAction.set(action);
      return;
    }
    this.runTransition(action, null);
  }

  protected runTransition(action: PlanAction, reason: string | null): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(this.api.transitionPlan(orgId, this.id(), action, reason), {
      success: 'audits.notices.planTransitioned',
      next: (plan) => {
        this.pendingAction.set(null);
        this.data.set(plan);
      },
      error: () => {
        this.pendingAction.set(null);
      },
    });
  }

  protected remove(): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(this.api.deletePlan(orgId, this.id()), {
      success: 'audits.notices.planDeleted',
      next: () => void this.router.navigate(['/audits/plans']),
      error: () => {
        this.deleting.set(false);
      },
    });
  }
}
