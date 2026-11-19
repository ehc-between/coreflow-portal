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
import { AskPanelService } from '../../ask/ask-panel.service';
import { Attachments } from '../../../shared/attachments/attachments';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, formatLocalDay } from '../../../shared/locale/locale-pipes';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import {
  certificationStatusBadge,
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
import { AuditRecordLink } from '../shared/record-link';
import { showSection } from '../shared/show-section';
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

/** Tone of the status sentence: done is green, a cancelled audit is neutral, the rest is work under way. */
export function planStatusTone(status: PlanStatus): StatusLineTone {
  if (status === 'closed') {
    return 'pass';
  }
  return status === 'cancelled' ? 'neutral' : 'info';
}

/**
 * The order of the work sections (CSS `order`) by phase: team and checklist while
 * preparing, checklist and findings during fieldwork, findings and report after.
 */
export function planSectionOrder(status: PlanStatus): {
  readonly team: number;
  readonly checklist: number;
  readonly findings: number;
  readonly report: number;
} {
  switch (status) {
    case 'planned':
      return { team: 1, checklist: 2, findings: 3, report: 4 };
    case 'in_progress':
      return { checklist: 1, findings: 2, team: 3, report: 4 };
    default:
      return { findings: 1, report: 2, checklist: 3, team: 4 };
  }
}

/** Section ids on the plan page that "Oppfølging" lines point at. */
export const PLAN_SECTIONS = {
  team: 'plan-team',
  checklist: 'plan-checklist',
  findings: 'plan-findings',
  report: 'plan-report',
} as const;

/**
 * What an audit still needs ("Oppfølging", docs/ux-guide.md §2.7). `canEdit` is
 * the right to change the plan now (not closed or cancelled); `canWrite` alone is
 * enough to follow up open findings on a closed audit.
 */
export function planMissing(
  p: PlanDetail,
  opts: {
    readonly canEdit: boolean;
    readonly canWrite: boolean;
    readonly editLink: readonly unknown[];
    readonly show: (section: string) => void;
  },
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  const preparing = p.status === 'planned' || p.status === 'in_progress';
  if (opts.canEdit) {
    if (!p.scope?.trim()) {
      items.push({
        key: 'scope',
        labelKey: 'audits.planDetail.missing.scope',
        link: opts.editLink,
      });
    }
    if (!p.planned_start) {
      items.push({
        key: 'dates',
        labelKey: 'audits.planDetail.missing.dates',
        link: opts.editLink,
      });
    }
    if (p.kind === 'internal' && preparing && !leadAuditorName(p)) {
      items.push({
        key: 'lead',
        labelKey: 'audits.planDetail.missing.lead',
        action: () => opts.show(PLAN_SECTIONS.team),
      });
    }
    if (p.kind === 'internal' && preparing && !p.checklist_total) {
      items.push({
        key: 'checklist',
        labelKey: 'audits.planDetail.missing.checklist',
        action: () => opts.show(PLAN_SECTIONS.checklist),
      });
    }
    if (p.status === 'reporting' && !p.report_summary?.trim()) {
      items.push({
        key: 'report',
        labelKey: 'audits.planDetail.missing.report',
        action: () => opts.show(PLAN_SECTIONS.report),
      });
    }
    if (!p.owner) {
      items.push({
        key: 'owner',
        labelKey: 'audits.planDetail.missing.owner',
        link: opts.editLink,
      });
    }
  }
  if (opts.canWrite && p.status === 'closed' && p.findings_open > 0) {
    items.push({
      key: 'findings',
      labelKey: 'audits.planDetail.missing.openFindings',
      params: { count: p.findings_open },
      action: () => opts.show(PLAN_SECTIONS.findings),
    });
  }
  return items;
}

/**
 * `/audits/plans/:id`: one audit, on the detail-page anatomy (docs/ux-guide.md
 * §2.7). "Hovedinformasjon" says where the audit stands and what to do now, what
 * is audited, against what, when and by whom, with the checklist and findings
 * progress. Below: the other fields (empty ones hidden), the team with
 * competence and independence checks, the checklist, the findings and the
 * report. The "Oppfølging" card holds what is missing, the requirements, the
 * connections (with the programme or certification the audit belongs to) and
 * the owner. External (certification body) audits upload the body's report and
 * register its findings; their own checklist is optional.
 */
@Component({
  selector: 'app-audit-plan-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    Attachments,
    WhyItMatters,
    EntityChip,
    Button,
    Card,
    ConfirmDialog,
    FieldItem,
    HelpStrip,
    Icon,
    MenuItem,
    ProgressBar,
    PromptDialog,
    StatusBadge,
    AuditsNav,
    AuditClauseRefs,
    AuditLoadState,
    AuditRecordLink,
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
        [anatomy]="true"
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
        [missing]="missing()"
        backLink="/audits/plans"
        backLabelKey="audits.plans.back"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="plan-code">{{ p.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'audits.kind.' + p.kind | transloco }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge [meaning]="sb.meaning" [value]="sb.value" [labelKey]="sb.labelKey" />
        </ng-container>

        @if (acts.primary; as a) {
          <app-button primary [disabled]="saving.busy()" (click)="transition(a)">
            {{ 'audits.planAction.' + a | transloco }}
          </app-button>
        } @else if (canEdit()) {
          <app-button primary (click)="edit()">{{ 'audits.common.edit' | transloco }}</app-button>
        }
        @if (acts.primary && canEdit()) {
          <a
            secondary
            [routerLink]="editLink()"
            class="inline-flex h-9 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {{ 'audits.common.edit' | transloco }}
          </a>
        }
        @if (reportPhase()) {
          <a
            secondary
            [routerLink]="['/audits/plans', p.id, 'report']"
            class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <app-icon name="reports" [size]="14" />
            {{ 'audits.planDetail.openReport' | transloco }}
          </a>
        } @else {
          <button appMenuItem overflow type="button" (click)="openReport()">
            {{ 'audits.planDetail.openReport' | transloco }}
          </button>
        }
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

        <button appMenuItem ask type="button" (click)="askAi()">
          <app-icon name="spark" [size]="15" />
          {{ 'audits.detail.ask.plan' | transloco }}
        </button>

        <app-audits-nav nav />
        <app-help-strip help scope="audits" page="planDetail" [lesson]="lesson()" />

        <app-record-lead record-lead [fillLink]="canEdit() ? editLink() : null">
          <app-record-status-line status [tone]="statusTone()">
            {{ nextStepKey() | transloco }}
            @if (p.status_reason) {
              <span class="mt-0.5 block font-normal">
                {{ 'audits.planDetail.statusReason' | transloco: { reason: p.status_reason } }}
              </span>
            }
          </app-record-status-line>
          <div
            status
            class="-mt-1 mb-5 flex flex-wrap empty:hidden items-center gap-x-5 gap-y-2 text-ui text-fg-muted"
            data-testid="plan-progress"
          >
            @if (p.checklist_total) {
              <span class="flex items-center gap-2">
                <app-progress-bar
                  class="block w-24"
                  [value]="progress()"
                  [label]="
                    'audits.planDetail.progress.checklist'
                      | transloco: { answered: p.checklist_answered, total: p.checklist_total }
                  "
                />
                {{
                  'audits.planDetail.progress.checklist'
                    | transloco: { answered: p.checklist_answered, total: p.checklist_total }
                }}
              </span>
            } @else if (p.kind === 'internal' && checklistEditable()) {
              <span>{{ 'audits.planDetail.progress.noChecklist' | transloco }}</span>
            }
            @if (p.status !== 'planned' || p.findings_total) {
              <button
                type="button"
                class="inline-flex min-h-6 items-center gap-1 font-semibold hover:underline"
                [class]="p.findings_open ? 'text-warn-ink' : 'text-accent'"
                (click)="show(sections.findings)"
                data-testid="plan-progress-findings"
              >
                <app-icon name="flag" [size]="14" />
                {{
                  p.findings_total
                    ? ('audits.planDetail.progress.findings'
                      | transloco: { total: p.findings_total, open: p.findings_open })
                    : ('audits.planDetail.progress.noFindings' | transloco)
                }}
              </button>
            }
          </div>

          <app-field-item
            size="lead"
            [wide]="true"
            labelKey="audits.planDetail.lead.scope"
            [value]="p.scope"
            [multiline]="true"
          />
          <app-field-item size="lead" [wide]="true" labelKey="audits.planDetail.lead.criteria">
            @if (p.criteria) {
              <p class="whitespace-pre-line">{{ p.criteria }}</p>
            }
            @if (p.clause_refs.length) {
              <app-audit-clause-refs class="mt-2" [refs]="p.clause_refs" />
            }
            @if (p.criteria_documents?.length) {
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                @for (d of p.criteria_documents; track d.entity_id) {
                  <app-entity-chip [ref]="d" />
                }
              </div>
            }
          </app-field-item>
          <app-field-item
            size="lead"
            [labelKey]="
              p.actual_start ? 'audits.planDetail.lead.actualWhen' : 'audits.planDetail.lead.when'
            "
            [value]="when()"
          />
          @if (p.kind === 'external') {
            <app-field-item size="lead" labelKey="audits.planDetail.lead.auditor">
              @if (p.external_party_name || p.external_party_type) {
                {{ p.external_party_name }}
                @if (p.external_party_type) {
                  <span class="text-fg-muted"
                    >({{ 'audits.partyType.' + p.external_party_type | transloco }})</span
                  >
                }
              }
            </app-field-item>
          } @else {
            <app-field-item size="lead" labelKey="audits.fields.leadAuditor" [value]="lead()" />
          }
        </app-record-lead>

        <div class="flex flex-col gap-6">
          <app-record-details [columns]="3" [fillLink]="canEdit() ? editLink() : null">
            <app-field-item
              labelKey="audits.fields.objectives"
              [value]="p.objectives"
              [wide]="true"
              [multiline]="true"
            />
            <app-field-item labelKey="audits.fields.processes" [wide]="true">
              @if (p.processes?.length) {
                <div class="flex flex-wrap gap-x-4 gap-y-1.5">
                  @for (pr of p.processes; track pr.entity_id) {
                    <app-entity-chip [ref]="pr" />
                  }
                </div>
              }
            </app-field-item>
            <app-field-item labelKey="audits.fields.departments" [value]="departments()" />
            <app-field-item labelKey="audits.fields.auditees" [value]="names(p.auditees)" />
            <app-field-item labelKey="audits.fields.distribution" [value]="names(p.distribution)" />
            <app-field-item labelKey="audits.fields.location" [value]="p.location" />
            <app-field-item labelKey="audits.fields.frameworks" [value]="frameworkNames()" />
            <app-field-item labelKey="audits.fields.risk">
              <app-status-badge
                [meaning]="rb.meaning"
                [value]="rb.value"
                [labelKey]="rb.labelKey"
              />
            </app-field-item>
            @if (p.actual_start) {
              <app-field-item labelKey="audits.fields.schedule" [value]="plannedRange()" />
            }
          </app-record-details>

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

          @if (p.status !== 'planned' || p.findings_total) {
            <app-card
              [id]="sections.findings"
              tabindex="-1"
              class="outline-none"
              [style.order]="order().findings"
            >
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
          }

          @if (p.kind === 'external') {
            <details
              [id]="sections.checklist"
              tabindex="-1"
              [style.order]="order().checklist"
              class="rounded-card border border-border bg-surface p-5 outline-none"
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
          } @else if (p.checklist_total || checklistEditable() || answerable()) {
            <app-card
              [id]="sections.checklist"
              tabindex="-1"
              class="outline-none"
              [style.order]="order().checklist"
            >
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

          <app-card
            [id]="sections.team"
            tabindex="-1"
            class="outline-none"
            [style.order]="order().team"
          >
            <h2 class="mb-3 font-display text-section font-bold text-fg">
              {{
                (p.kind === 'external' ? 'audits.planDetail.ourTeam' : 'audits.planDetail.team')
                  | transloco
              }}
            </h2>
            <app-audit-plan-team [plan]="p" [editable]="teamEditable()" (changed)="reload()" />
          </app-card>

          @if (p.status !== 'planned' || p.report_summary) {
            <app-card
              [id]="sections.report"
              tabindex="-1"
              class="outline-none"
              [style.order]="order().report"
            >
              <h2 class="mb-3 font-display text-section font-bold text-fg">
                {{ 'audits.planDetail.report' | transloco }}
              </h2>
              <app-audit-plan-report-panel [plan]="p" (saved)="data.set($event)" />
            </app-card>
          }
        </div>

        @if (p.programme || p.certification_id) {
          <div
            follow-up-connections
            class="mt-4 flex flex-col gap-3 border-t border-border pt-3"
            data-testid="plan-belongs-to"
          >
            <h3 class="text-meta font-semibold text-fg-muted">
              {{ 'audits.detail.belongsTo' | transloco }}
            </h3>
            @if (p.programme; as prog) {
              <app-audit-record-link
                icon="calendar"
                [type]="'audits.detail.types.programme' | transloco"
                [code]="prog.code"
                [title]="prog.title"
                [link]="['/audits/programmes', prog.id]"
              />
            }
            @if (p.certification_id) {
              <app-audit-record-link
                icon="shield"
                [type]="'audits.detail.types.certification' | transloco"
                [code]="p.certification?.certificate_number"
                [title]="
                  p.certification?.title || ('audits.planDetail.openCertification' | transloco)
                "
                [status]="p.certification ? certBadge(p.certification.status) : null"
                [link]="['/audits/certifications', p.certification_id]"
              />
            }
          </div>
        }

        <app-record-meta follow-up-meta>
          <app-field-item layout="inline" labelKey="audits.fields.owner" [value]="p.owner?.name" />
          <app-field-item
            layout="inline"
            labelKey="audits.detail.meta.updated"
            [value]="p.updated_at | localDate"
          />
        </app-record-meta>

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
  private readonly ask = inject(AskPanelService);
  protected readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly sections = PLAN_SECTIONS;
  protected readonly fieldLabels = PLAN_FIELD_LABELS;
  protected readonly statusBadge = planStatusBadge;
  protected readonly risk = riskBadge;
  protected readonly certBadge = certificationStatusBadge;
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
  protected readonly statusTone = computed(() => planStatusTone(this.status() ?? 'planned'));
  protected readonly canEdit = computed(() => this.access.canWrite() && !this.locked());
  /** The report matters from reporting on: then "Rapport" is a header button, before that in "Mer". */
  protected readonly reportPhase = computed(() => {
    const s = this.status();
    return s === 'reporting' || s === 'report_review' || s === 'closed';
  });
  /** The work sections in the order that fits where the audit is now. */
  protected readonly order = computed(() => planSectionOrder(this.status() ?? 'planned'));
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/audits/plans',
    this.id(),
    'edit',
  ]);
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
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const p = this.data.value();
    if (!p) {
      return [];
    }
    return planMissing(p, {
      canEdit: this.canEdit(),
      canWrite: this.access.canWrite(),
      editLink: this.editLink(),
      show: (section) => this.show(section),
    });
  });
  protected readonly nextStepKey = computed(() => {
    const p = this.data.value();
    if (!p) {
      return '';
    }
    if (p.status === 'closed' && !p.findings_open) {
      return 'audits.planDetail.closedDone';
    }
    const kind = p.kind === 'external' ? 'external' : 'internal';
    return `audits.planDetail.next.${kind}.${p.status}`;
  });
  /** "2. jan. 2026 – 3. jan. 2026": the actual dates once the audit started, else the planned ones. */
  protected readonly when = computed(() => {
    const p = this.data.value();
    if (!p) {
      return '';
    }
    return p.actual_start
      ? this.range(p.actual_start, p.actual_end, 'audits.planDetail.ongoing')
      : this.range(p.planned_start, p.planned_end, 'common.empty.notSet');
  });
  protected readonly plannedRange = computed(() => {
    const p = this.data.value();
    return p ? this.range(p.planned_start, p.planned_end, 'common.empty.notSet') : '';
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

  private range(start: string | null, end: string | null, openKey: string): string {
    if (!start && !end) {
      return '';
    }
    const open = this.language.translate(openKey);
    return this.language.translate('audits.planDetail.range', {
      start: this.day(start) || this.language.translate('common.empty.notSet'),
      end: this.day(end) || open,
    });
  }

  private day(value: string | null): string {
    return formatLocalDay(value, 'mediumDate', this.language.locale());
  }

  protected openReport(): void {
    void this.router.navigate(['/audits/plans', this.id(), 'report']);
  }

  protected show(section: string): void {
    showSection(this.router, section);
  }

  protected edit(): void {
    void this.router.navigate(this.editLink());
  }

  protected askAi(): void {
    const p = this.data.value();
    if (!p) {
      return;
    }
    this.ask.askAbout(
      this.language.translate('audits.planDetail.askAbout', { code: p.code }),
      undefined,
      { requirements: p.clause_refs },
    );
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
