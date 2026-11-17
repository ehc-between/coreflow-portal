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
import { LanguageService } from '../../../core/i18n/language.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { Attachments } from '../../../shared/attachments/attachments';
import { AskAbout } from '../../../shared/ask/ask-about';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import {
  checklistProgress,
  findingStatusBadge,
  findingTypeBadge,
  leadAuditorName,
  planStatusBadge,
  riskBadge,
} from '../data/audit-display';
import {
  Finding,
  ListResponse,
  PlanAction,
  PlanDetail,
  PlanStatus,
  REASON_REQUIRED,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditClauseRefs } from '../shared/clause-refs';
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
  process_ids: 'audits.fields.processes',
  criteria_document_ids: 'audits.fields.criteriaDocuments',
  auditee_user_ids: 'audits.fields.auditees',
  distribution_user_ids: 'audits.fields.distribution',
  location: 'audits.fields.location',
  risk_level: 'audits.fields.risk',
  planned_start: 'audits.fields.plannedStart',
  planned_end: 'audits.fields.plannedEnd',
  owner_user_id: 'audits.fields.owner',
  report_summary: 'audits.fields.reportSummary',
  report_conclusion: 'audits.fields.reportConclusion',
  report_outcome: 'audits.fields.reportOutcome',
  report_limitations: 'audits.fields.reportLimitations',
};

/** The actions that move the audit forward, in order; the first available is the primary button. */
export const PLAN_FORWARD: readonly PlanAction[] = [
  'start',
  'finish_fieldwork',
  'submit_report',
  'approve_report',
];

/** The one next step of a plan (primary button) and the rest (the "Mer" menu). */
export function splitPlanActions(actions: readonly PlanAction[]): {
  readonly primary: PlanAction | null;
  readonly rest: readonly PlanAction[];
} {
  const primary = PLAN_FORWARD.find((a) => actions.includes(a)) ?? null;
  return { primary, rest: actions.filter((a) => a !== primary) };
}

/** The lesson that fits where the audit is now (UX audit #21). */
export function planLesson(status: PlanStatus): string {
  switch (status) {
    case 'planned':
      return 'audit-team';
    case 'closed':
    case 'cancelled':
      return 'findings-and-capa';
    default:
      return 'internal-audits';
  }
}

/**
 * `/audits/plans/:id`: one audit. What it covers (scope, criteria, clauses,
 * processes, documents, people), the team with competence and independence checks,
 * the checklist with evidence and findings, and the report with approval. One
 * "what to do now" button in the header; the rest sits in "Mer". External
 * (certification body) audits get their own simpler layout: upload the body's
 * report and register its findings.
 */
@Component({
  selector: 'app-audit-plan-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    RecordDetailLayout,
    WatchButton,
    Attachments,
    AskAbout,
    WhyItMatters,
    EntityChip,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    MenuItem,
    ProgressBar,
    PromptDialog,
    StatusBadge,
    AuditsNav,
    AuditClauseRefs,
    AuditLoadState,
    PlanTeam,
    PlanChecklist,
    PlanReportPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.value(); as p) {
      @let sb = statusBadge(p.status);
      @let rb = risk(p.risk_level);
      @let acts = actions();
      <app-record-detail-layout
        entityType="audit_plan"
        [entityId]="p.id"
        [title]="p.title"
        [breadcrumbs]="[
          { labelKey: 'modules.names.audits', link: '/audits' },
          { labelKey: 'audits.plans.title', link: '/audits/plans' },
          { label: p.code },
        ]"
        [tabs]="tabs"
        [requirementsPanel]="true"
        [canEdit]="access.canWrite()"
        [includeAudit]="access.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/audits/plans"
        backLabelKey="audits.plans.back"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="plan-code">{{ p.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'audits.kind.' + p.kind | transloco }}</span>
          <app-status-badge [meaning]="sb.meaning" [value]="sb.value" [labelKey]="sb.labelKey" />
          <app-status-badge [meaning]="rb.meaning" [value]="rb.value" [labelKey]="rb.labelKey" />
          <app-ask-about
            [prompt]="'audits.planDetail.askAbout' | transloco: { code: p.code }"
            [requirements]="p.clause_refs"
          />
          <app-watch-button entityType="audit_plan" [entityId]="p.id" />
        </ng-container>

        @if (acts.primary; as a) {
          <app-button primary size="sm" [disabled]="saving.busy()" (click)="transition(a)">
            {{ 'audits.planAction.' + a | transloco }}
          </app-button>
        }
        @if (canEdit()) {
          <a
            secondary
            [routerLink]="['/audits/plans', p.id, 'edit']"
            class="inline-flex h-8 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {{ 'audits.common.edit' | transloco }}
          </a>
        }
        <a
          secondary
          [routerLink]="['/audits/plans', p.id, 'report']"
          class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <app-icon name="reports" [size]="14" />
          {{ 'audits.planDetail.openReport' | transloco }}
        </a>
        @for (a of acts.rest; track a) {
          <button appMenuItem overflow [disabled]="saving.busy()" (click)="transition(a)">
            {{ 'audits.planAction.' + a | transloco }}
          </button>
        }
        @if (access.canManage()) {
          <button appMenuItem overflow [danger]="true" (click)="deleting.set(true)">
            {{ 'audits.common.delete' | transloco }}
          </button>
        }

        <app-audits-nav nav />
        <app-help-strip help scope="audits" page="planDetail" [lesson]="lesson()" />

        <div class="flex flex-col gap-5">
          @if (p.status_reason) {
            <app-alert tone="info">
              {{ 'audits.planDetail.statusReason' | transloco: { reason: p.status_reason } }}
            </app-alert>
          }

          <app-card data-testid="plan-next-step">
            <p class="text-meta font-semibold tracking-wide text-fg-subtle uppercase">
              {{ 'audits.planDetail.nowTitle' | transloco }}
            </p>
            <p class="mt-1 text-body text-fg">{{ nextStepKey() | transloco }}</p>
          </app-card>

          <app-card>
            <h2 class="mb-4 font-display text-section font-bold text-fg">
              {{ 'audits.planDetail.about' | transloco }}
            </h2>
            <app-field-list>
              <app-field-item
                labelKey="audits.fields.scope"
                [value]="p.scope"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item labelKey="audits.fields.criteria" [wide]="true">
                @if (p.criteria) {
                  <p class="whitespace-pre-line">{{ p.criteria }}</p>
                }
                @if (p.criteria_documents?.length) {
                  <div class="mt-1.5 flex flex-wrap gap-1.5">
                    @for (d of p.criteria_documents; track d.entity_id) {
                      <app-entity-chip [ref]="d" />
                    }
                  </div>
                }
              </app-field-item>
              @if (p.objectives) {
                <app-field-item
                  labelKey="audits.fields.objectives"
                  [value]="p.objectives"
                  [wide]="true"
                  [multiline]="true"
                />
              }
              <app-field-item labelKey="audits.fields.clauseRefs" [wide]="true" empty="none">
                @if (p.clause_refs.length) {
                  <app-audit-clause-refs [refs]="p.clause_refs" />
                }
              </app-field-item>
              <app-field-item labelKey="audits.fields.processes" [wide]="true" empty="none">
                @if (p.processes?.length) {
                  <div class="flex flex-wrap gap-1.5">
                    @for (pr of p.processes; track pr.entity_id) {
                      <app-entity-chip [ref]="pr" />
                    }
                  </div>
                }
              </app-field-item>
              <app-field-item
                labelKey="audits.fields.frameworks"
                [value]="frameworkNames()"
                empty="none"
              />
              <app-field-item
                labelKey="audits.fields.departments"
                [value]="departments()"
                empty="none"
              />
              <app-field-item
                labelKey="audits.fields.schedule"
                [value]="
                  'audits.planDetail.range'
                    | transloco
                      : {
                          start:
                            (p.planned_start | localDay) || ('common.empty.notSet' | transloco),
                          end: (p.planned_end | localDay) || ('common.empty.notSet' | transloco),
                        }
                "
              />
              @if (p.actual_start) {
                <app-field-item
                  labelKey="audits.fields.actual"
                  [value]="
                    'audits.planDetail.range'
                      | transloco
                        : {
                            start: (p.actual_start | localDay),
                            end:
                              (p.actual_end | localDay) ||
                              ('audits.planDetail.ongoing' | transloco),
                          }
                  "
                />
              }
              <app-field-item labelKey="audits.fields.location" [value]="p.location" />
              <app-field-item labelKey="audits.fields.owner" [value]="p.owner?.name" />
              <app-field-item labelKey="audits.fields.leadAuditor" [value]="lead()" />
              <app-field-item
                labelKey="audits.fields.auditees"
                [value]="names(p.auditees)"
                empty="none"
              />
              <app-field-item
                labelKey="audits.fields.distribution"
                [value]="names(p.distribution)"
                empty="none"
              />
              <app-field-item labelKey="audits.fields.programme">
                @if (p.programme) {
                  <a
                    [routerLink]="['/audits/programmes', p.programme.id]"
                    class="font-semibold text-accent hover:underline"
                  >
                    <span class="font-mono text-meta">{{ p.programme.code }}</span>
                    {{ p.programme.title }}
                  </a>
                }
              </app-field-item>
              @if (p.kind === 'external') {
                <app-field-item labelKey="audits.fields.partyName">
                  @if (p.external_party_name || p.external_party_type) {
                    {{ p.external_party_name }}
                    @if (p.external_party_type) {
                      <span class="text-fg-muted"
                        >({{ 'audits.partyType.' + p.external_party_type | transloco }})</span
                      >
                    }
                  }
                </app-field-item>
                <app-field-item labelKey="audits.fields.certification">
                  @if (p.certification_id) {
                    <a
                      [routerLink]="['/audits/certifications', p.certification_id]"
                      class="font-semibold text-accent hover:underline"
                    >
                      {{
                        p.certification?.title ||
                          ('audits.planDetail.openCertification' | transloco)
                      }}
                    </a>
                  }
                </app-field-item>
              }
            </app-field-list>
          </app-card>

          @if (p.kind === 'external') {
            <app-card data-testid="plan-external">
              <h2 class="mb-1 font-display text-section font-bold text-fg">
                {{ 'audits.planDetail.external.title' | transloco }}
              </h2>
              <p class="mb-3 text-body text-fg-muted">
                {{ 'audits.planDetail.external.body' | transloco }}
              </p>
              <app-attachments
                entityType="audit_plan"
                [entityId]="p.id"
                [canEdit]="access.canWrite()"
                [compact]="true"
              />
              <div class="mt-3 flex flex-wrap gap-2 empty:hidden">
                @if (answerable()) {
                  <a
                    [routerLink]="['/audits/plans', p.id, 'findings', 'new']"
                    class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2"
                  >
                    <app-icon name="flag" [size]="14" />
                    {{ 'audits.planDetail.external.raise' | transloco }}
                  </a>
                }
              </div>
            </app-card>
          }

          <app-card>
            <h2 class="mb-3 font-display text-section font-bold text-fg">
              {{
                (p.kind === 'external' ? 'audits.planDetail.ourTeam' : 'audits.planDetail.team')
                  | transloco
              }}
            </h2>
            <app-audit-plan-team [plan]="p" [editable]="teamEditable()" (changed)="reload()" />
          </app-card>

          @if (p.kind === 'external') {
            <details
              class="rounded-card border border-border bg-surface p-5"
              data-testid="plan-checklist-optional"
            >
              <summary class="cursor-pointer font-display text-section font-bold text-fg">
                {{ 'audits.planDetail.ownChecklist' | transloco }}
              </summary>
              <p class="mt-1 mb-3 text-meta text-fg-muted">
                {{ 'audits.planDetail.ownChecklistHint' | transloco }}
              </p>
              <app-audit-plan-checklist
                [plan]="p"
                [editable]="checklistEditable()"
                [answerable]="answerable()"
                [canRaise]="answerable()"
                (changed)="reload()"
              />
            </details>
          } @else {
            <app-card>
              <h2 class="mb-3 font-display text-section font-bold text-fg">
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
          }

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-section font-bold text-fg">
                {{ 'audits.planDetail.findings' | transloco: { count: p.findings_total } }}
              </h2>
              @if (answerable() && p.kind === 'internal') {
                <a
                  [routerLink]="['/audits/plans', p.id, 'findings', 'new']"
                  class="inline-flex min-h-6 items-center gap-1 text-ui font-semibold text-accent hover:underline"
                >
                  <app-icon name="plus" [size]="13" />
                  {{ 'audits.findings.new' | transloco }}
                </a>
              }
            </div>
            @if (findings.value()?.items; as items) {
              @if (items.length) {
                <ul class="divide-y divide-border">
                  @for (f of items; track f.id) {
                    @let tb = typeBadge(f.finding_type);
                    @let fb = findingBadge(f.status);
                    <li class="flex flex-wrap items-center gap-2 py-2">
                      <a
                        [routerLink]="['/audits/findings', f.id]"
                        class="min-w-0 flex-1 basis-[220px] text-body font-semibold text-fg hover:text-accent"
                      >
                        <span class="font-mono text-meta font-normal text-fg-subtle">{{
                          f.code
                        }}</span>
                        {{ f.title }}
                      </a>
                      <app-status-badge
                        [meaning]="tb.meaning"
                        [value]="tb.value"
                        [labelKey]="tb.labelKey"
                      />
                      <app-status-badge
                        [meaning]="fb.meaning"
                        [value]="fb.value"
                        [labelKey]="fb.labelKey"
                      />
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-body text-fg-muted">
                  {{ 'audits.planDetail.noFindings' | transloco }}
                </p>
              }
            }
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-section font-bold text-fg">
              {{ 'audits.planDetail.report' | transloco }}
            </h2>
            <app-audit-plan-report-panel [plan]="p" (saved)="data.set($event)" />
          </app-card>
        </div>

        <app-card aside>
          <h2 class="mb-3 font-display text-card font-bold text-fg">
            {{ 'audits.planDetail.summary' | transloco }}
          </h2>
          @if (p.checklist_total) {
            <app-progress-bar
              [value]="progress()"
              [label]="
                'audits.checklist.progress'
                  | transloco: { answered: p.checklist_answered, total: p.checklist_total }
              "
            />
            <p class="mt-1 text-meta text-fg-muted">
              {{
                'audits.checklist.progress'
                  | transloco: { answered: p.checklist_answered, total: p.checklist_total }
              }}
            </p>
          }
          <dl class="mt-3 flex flex-col gap-1.5 text-ui">
            <div class="flex justify-between gap-2">
              <dt class="text-fg-muted">{{ 'audits.planDetail.openFindings' | transloco }}</dt>
              <dd class="font-semibold text-fg">{{ p.findings_open }} / {{ p.findings_total }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-fg-muted">{{ 'audits.fields.plannedStart' | transloco }}</dt>
              <dd class="text-fg">
                {{ (p.planned_start | localDay) || ('common.empty.notSet' | transloco) }}
              </dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-fg-muted">{{ 'audits.fields.leadAuditor' | transloco }}</dt>
              <dd class="text-right text-fg">
                {{ lead() || ('common.empty.notSet' | transloco) }}
              </dd>
            </div>
          </dl>
        </app-card>
        <div aside-learn>
          <app-why-it-matters scope="audits" page="planDetail" />
        </div>
      </app-record-detail-layout>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-audit-load-state [state]="data.state()" [rows]="6" (retry)="reload()" />
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
  private readonly language = inject(LanguageService);
  protected readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = PLAN_FIELD_LABELS;
  protected readonly statusBadge = planStatusBadge;
  protected readonly risk = riskBadge;
  protected readonly typeBadge = findingTypeBadge;
  protected readonly findingBadge = findingStatusBadge;

  protected readonly data = loadable<PlanDetail>();
  protected readonly findings = loadable<ListResponse<Finding>>();
  protected readonly saving = mutator();
  protected readonly pendingAction = signal<PlanAction | null>(null);
  protected readonly deleting = signal(false);

  private readonly status = computed(() => this.data.value()?.status ?? null);
  private readonly locked = computed(
    () => this.status() === 'closed' || this.status() === 'cancelled',
  );
  protected readonly actions = computed(() =>
    splitPlanActions(this.data.value()?.available_actions ?? []),
  );
  protected readonly lesson = computed(() => planLesson(this.status() ?? 'planned'));
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
  protected readonly progress = computed(() => {
    const p = this.data.value();
    return p ? checklistProgress(p.checklist_answered, p.checklist_total) : 0;
  });
  protected readonly lead = computed(() => {
    const p = this.data.value();
    return p ? leadAuditorName(p) : null;
  });
  protected readonly nextStepKey = computed(() => {
    const p = this.data.value();
    if (!p) {
      return '';
    }
    const kind = p.kind === 'external' ? 'external' : 'internal';
    return `audits.planDetail.next.${kind}.${p.status}`;
  });
  protected readonly frameworkNames = computed(() =>
    (this.data.value()?.frameworks ?? [])
      .map((f) => this.language.translate(`audits.frameworks.${f}`))
      .join(', '),
  );
  protected readonly departments = computed(() => {
    const p = this.data.value();
    if (!p) {
      return '';
    }
    if (p.auditee_departments?.length) {
      return p.auditee_departments.map((d) => d.name).join(', ');
    }
    const known = new Map(
      this.options.options().departments.map((d) => [d.value.replace(/^department:/, ''), d.label]),
    );
    return p.auditee_department_ids
      .map((id) => known.get(id))
      .filter((n): n is string => !!n)
      .join(', ');
  });

  constructor() {
    this.options.ensureLoaded();
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_plan',
      entityId: this.id(),
      view: 'detail',
      title: this.data.value()?.title ?? null,
      requirements: this.data.value()?.clause_refs ?? [],
    }));
    effect(() => {
      this.access.orgId();
      this.id();
      untracked(() => this.reload(false));
    });
  }

  protected names(users: readonly { name: string | null }[] | undefined): string {
    return (users ?? [])
      .map((u) => u.name)
      .filter((n): n is string => !!n)
      .join(', ');
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
