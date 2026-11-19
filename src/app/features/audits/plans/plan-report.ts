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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import {
  auditorName,
  checklistResultBadge,
  findingTypeBadge,
  leadAuditorName,
} from '../data/audit-display';
import { auditErrorKey } from '../data/audit-errors';
import { AuditReport, CHECKLIST_RESULTS, FINDING_TYPES } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditClauseRefs } from '../shared/clause-refs';
import { AuditLoadState } from '../shared/load-state';
import { OutputsPanel } from '../../../shared/outputs';
import { loadable } from '../shared/loadable';

/** File name of the downloaded report: `AUD-2026-002-revisjonsrapport.pdf`. */
export function reportFileName(code: string, suffix: string): string {
  const safe = (code || 'audit').replace(/[^A-Za-z0-9._-]+/g, '-');
  return `${safe}-${suffix}.pdf`;
}

/**
 * `/audits/plans/:id/report`: the complete audit report on one page, laid out the
 * way an auditor hands it over (ISO 19011 6.5): organisation, objectives, scope,
 * criteria, people and places, team, summary with the overall conclusion and the
 * limitations, every checklist answer with its notes and evidence, the findings
 * with clause and due date, who receives it, and the signatures. Printable, and
 * downloadable as a PDF.
 */
@Component({
  selector: 'app-audit-plan-report',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    MarkdownPipe,
    EntityChip,
    Button,
    Card,
    Icon,
    PageHeader,
    StatusBadge,
    AuditClauseRefs,
    AuditLoadState,
    OutputsPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7 print:max-w-none print:p-0">
      <div class="print:hidden">
        <app-page-header
          titleKey="audits.report.pageTitle"
          [breadcrumbs]="[
            { labelKey: 'modules.names.audits', link: '/audits' },
            { labelKey: 'audits.plans.title', link: '/audits/plans' },
            { label: data.value()?.plan?.code ?? '', link: ['/audits/plans', id()] },
            { labelKey: 'audits.report.pageTitle' },
          ]"
        >
          <app-button primary size="sm" [loading]="downloading()" (click)="download()">
            <app-icon name="upload" [size]="14" class="rotate-180" />
            {{ 'audits.report.download' | transloco }}
          </app-button>
          <app-button secondary variant="secondary" size="sm" (click)="print()">
            {{ 'audits.report.print' | transloco }}
          </app-button>
        </app-page-header>
        <app-outputs-panel
          class="mb-4"
          entityType="audit_plan"
          [entityId]="id()"
          data-testid="report-snapshots"
        />
      </div>
      <app-audit-load-state [state]="data.state()" [rows]="8" (retry)="load()" />
      @if (data.value(); as r) {
        @let p = r.plan;
        <article class="flex flex-col gap-4" data-testid="audit-report">
          <header class="rounded-card border border-border bg-surface p-5">
            @if (r.org_name) {
              <p class="text-meta font-semibold tracking-wide text-fg-subtle uppercase">
                {{ r.org_name }}
              </p>
            }
            <h2 class="mt-1 font-display text-page font-bold text-fg">
              {{ 'audits.report.title' | transloco: { title: p.title } }}
            </h2>
            <p class="mt-1 text-ui text-fg-muted">
              <span class="font-mono">{{ p.code }}</span> ·
              {{ 'audits.kind.' + p.kind | transloco }} ·
              {{ 'audits.planStatus.' + p.status | transloco }} ·
              {{
                'audits.planDetail.range'
                  | transloco
                    : {
                        start:
                          (p.actual_start ?? p.planned_start | localDay) ||
                          ('common.empty.notSet' | transloco),
                        end:
                          (p.actual_end ?? p.planned_end | localDay) ||
                          ('common.empty.notSet' | transloco),
                      }
              }}
            </p>
            @if (r.generated_at) {
              <p class="mt-1 text-meta text-fg-subtle">
                {{ 'audits.report.generated' | transloco: { date: (r.generated_at | localDate) } }}
              </p>
            }
          </header>

          <app-card>
            <h2 class="mb-3 font-display text-section font-bold">
              {{ 'audits.report.sections.about' | transloco }}
            </h2>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-body sm:grid-cols-2">
              <div class="sm:col-span-2">
                <dt class="text-meta font-semibold text-fg-muted">
                  {{ 'audits.fields.objectives' | transloco }}
                </dt>
                <dd class="whitespace-pre-line">
                  {{ p.objectives || ('common.empty.notSet' | transloco) }}
                </dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-meta font-semibold text-fg-muted">
                  {{ 'audits.fields.scope' | transloco }}
                </dt>
                <dd class="whitespace-pre-line">
                  {{ p.scope || ('common.empty.notSet' | transloco) }}
                </dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-meta font-semibold text-fg-muted">
                  {{ 'audits.fields.criteria' | transloco }}
                </dt>
                <dd class="whitespace-pre-line">
                  {{ p.criteria || ('common.empty.notSet' | transloco) }}
                </dd>
                @if (p.criteria_documents?.length) {
                  <dd class="mt-1 flex flex-wrap gap-1.5">
                    @for (d of p.criteria_documents; track d.entity_id) {
                      <app-entity-chip [ref]="d" />
                    }
                  </dd>
                }
              </div>
              <div class="sm:col-span-2">
                <dt class="text-meta font-semibold text-fg-muted">
                  {{ 'audits.fields.clauseRefs' | transloco }}
                </dt>
                <dd><app-audit-clause-refs [refs]="p.clause_refs" /></dd>
              </div>
              @if (p.processes?.length) {
                <div class="sm:col-span-2">
                  <dt class="text-meta font-semibold text-fg-muted">
                    {{ 'audits.fields.processes' | transloco }}
                  </dt>
                  <dd class="flex flex-wrap gap-1.5">
                    @for (pr of p.processes; track pr.entity_id) {
                      <app-entity-chip [ref]="pr" />
                    }
                  </dd>
                </div>
              }
              <div>
                <dt class="text-meta font-semibold text-fg-muted">
                  {{ 'audits.fields.departments' | transloco }}
                </dt>
                <dd>{{ departments() || ('common.empty.none' | transloco) }}</dd>
              </div>
              <div>
                <dt class="text-meta font-semibold text-fg-muted">
                  {{ 'audits.fields.location' | transloco }}
                </dt>
                <dd>{{ p.location || ('common.empty.notSet' | transloco) }}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-meta font-semibold text-fg-muted">
                  {{ 'audits.fields.auditees' | transloco }}
                </dt>
                <dd>{{ names(p.auditees) || ('common.empty.none' | transloco) }}</dd>
              </div>
            </dl>
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-section font-bold">
              {{ 'audits.planDetail.team' | transloco }}
            </h2>
            <ul class="text-body">
              @for (a of p.auditors; track a.id) {
                <li class="py-0.5">
                  {{ name(a) }} – {{ 'audits.auditorRole.' + a.role | transloco }}
                </li>
              } @empty {
                <li class="text-fg-muted">{{ 'audits.team.empty' | transloco }}</li>
              }
            </ul>
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-section font-bold">
              {{ 'audits.report.summary' | transloco }}
            </h2>
            @if (p.report_outcome) {
              <p
                class="mb-3 rounded-tile border border-border bg-surface-2 px-3 py-2 text-body font-semibold"
                data-testid="report-outcome"
              >
                {{ 'audits.reportOutcome.statement.' + p.report_outcome | transloco }}
              </p>
            }
            @if (p.report_summary) {
              <div class="cf-prose text-body" [innerHTML]="p.report_summary | appMarkdown"></div>
            } @else {
              <p class="text-body text-fg-muted">{{ 'audits.report.noSummary' | transloco }}</p>
            }
            @if (p.report_conclusion) {
              <h3 class="mt-4 text-ui font-semibold text-fg-muted">
                {{ 'audits.fields.reportConclusion' | transloco }}
              </h3>
              <p class="text-body whitespace-pre-line">{{ p.report_conclusion }}</p>
            }
            <h3 class="mt-4 text-ui font-semibold text-fg-muted">
              {{ 'audits.fields.reportLimitations' | transloco }}
            </h3>
            <p class="text-body whitespace-pre-line">
              {{ p.report_limitations || ('audits.report.noLimitations' | transloco) }}
            </p>
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-section font-bold">
              {{ 'audits.report.results' | transloco }}
            </h2>
            <div class="mb-3 flex flex-wrap gap-1.5">
              @for (res of results; track res) {
                @let rb = resultBadge(res);
                <app-status-badge
                  [meaning]="rb.meaning"
                  [value]="rb.value"
                  labelKey="audits.report.resultCount"
                  [labelParams]="{
                    label: ('audits.checklistResult.' + res | transloco),
                    count: r.checklist.by_result[res] ?? 0,
                  }"
                />
              }
            </div>
            @if (r.checklist.items.length) {
              <ol class="flex flex-col divide-y divide-border">
                @for (item of r.checklist.items; track item.id; let i = $index) {
                  @let ib = resultBadge(item.result);
                  <li class="py-2.5 text-body">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                      <p class="min-w-0 flex-1 basis-[260px]">
                        <span class="text-fg-subtle">{{ i + 1 }}.</span> {{ item.question }}
                      </p>
                      <app-status-badge
                        [meaning]="ib.meaning"
                        [value]="ib.value"
                        [labelKey]="ib.labelKey"
                      />
                    </div>
                    @if (item.clause_ref) {
                      <div class="mt-1"><app-audit-clause-refs [refs]="[item.clause_ref]" /></div>
                    }
                    @if (item.notes) {
                      <p class="mt-1 text-meta whitespace-pre-line text-fg-muted">
                        {{ item.notes }}
                      </p>
                    }
                    @if (item.evidence?.length) {
                      <div class="mt-1 flex flex-wrap items-center gap-1.5">
                        <span class="text-meta text-fg-muted"
                          >{{ 'audits.checklist.evidenceRecords' | transloco }}:</span
                        >
                        @for (e of item.evidence; track e.entity_id) {
                          <app-entity-chip [ref]="e" />
                        }
                      </div>
                    }
                  </li>
                }
              </ol>
            } @else {
              <p class="text-body text-fg-muted">{{ 'audits.report.noChecklist' | transloco }}</p>
            }
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-section font-bold">
              {{ 'audits.planDetail.findings' | transloco: { count: r.findings.length } }}
            </h2>
            <div class="mb-3 flex flex-wrap gap-1.5">
              @for (t of types; track t) {
                @let tb = typeBadge(t);
                <app-status-badge
                  [meaning]="tb.meaning"
                  [value]="tb.value"
                  labelKey="audits.report.resultCount"
                  [labelParams]="{
                    label: ('audits.findingType.' + t | transloco),
                    count: p.findings_by_type[t] ?? 0,
                  }"
                />
              }
            </div>
            <ul class="divide-y divide-border text-body">
              @for (f of r.findings; track f.id) {
                <li class="py-2.5">
                  <a
                    [routerLink]="['/audits/findings', f.id]"
                    class="font-semibold text-fg hover:text-accent"
                  >
                    <span class="font-mono text-meta font-normal text-fg-subtle">{{ f.code }}</span>
                    {{ f.title }}
                  </a>
                  <p class="mt-0.5 text-meta text-fg-muted">
                    {{ 'audits.findingType.' + f.finding_type | transloco }} ·
                    {{ 'audits.findingStatus.' + f.status | transloco }}
                    @if (f.response_due_at) {
                      ·
                      {{
                        'audits.report.dueOn' | transloco: { date: (f.response_due_at | localDay) }
                      }}
                    }
                  </p>
                  @if (f.clause_ref) {
                    <div class="mt-1">
                      <app-audit-clause-refs [refs]="[f.clause_ref]" [suggested]="true" />
                    </div>
                  }
                  @if (f.description) {
                    <p class="mt-1 text-meta whitespace-pre-line text-fg-muted">
                      {{ f.description }}
                    </p>
                  }
                </li>
              } @empty {
                <li class="py-2 text-fg-muted">{{ 'audits.planDetail.noFindings' | transloco }}</li>
              }
            </ul>
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-section font-bold">
              {{ 'audits.fields.distribution' | transloco }}
            </h2>
            <p class="text-body">
              {{ names(p.distribution) || ('common.empty.none' | transloco) }}
            </p>
          </app-card>

          <app-card data-testid="report-signatures">
            <h2 class="mb-3 font-display text-section font-bold">
              {{ 'audits.report.signatures' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
              @for (s of signatures(); track s.role) {
                <div>
                  <p class="text-meta font-semibold text-fg-muted">
                    {{ 'audits.report.signatureRole.' + s.role | transloco }}
                  </p>
                  <p class="mt-6 border-t border-border-strong pt-1 text-body text-fg">
                    {{ s.name || ('common.empty.notSet' | transloco) }}
                  </p>
                  <p class="text-meta text-fg-muted">
                    {{ s.at ? (s.at | localDate) : ('audits.report.notSigned' | transloco) }}
                  </p>
                </div>
              }
            </div>
          </app-card>
        </article>
      }
    </div>
  `,
})
export class PlanReportPage {
  private readonly api = inject(AuditsApi);
  private readonly access = inject(AuditAccess);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  readonly id = input.required<string>();

  protected readonly data = loadable<AuditReport>();
  protected readonly downloading = signal(false);
  protected readonly results = CHECKLIST_RESULTS;
  protected readonly types = FINDING_TYPES;
  protected readonly resultBadge = checklistResultBadge;
  protected readonly typeBadge = findingTypeBadge;
  protected readonly name = auditorName;

  /** The two signatures (lead auditor, approver), from the backend or the plan. */
  protected readonly signatures = computed(() => {
    const r = this.data.value();
    if (!r) {
      return [];
    }
    if (r.signatures?.length) {
      return r.signatures;
    }
    return [
      {
        role: 'lead_auditor' as const,
        name: leadAuditorName(r.plan),
        at: r.plan.report_submitted_at,
      },
      {
        role: 'approver' as const,
        name: r.plan.report_approved_by?.name ?? null,
        at: r.plan.report_approved_at,
      },
    ];
  });
  protected readonly departments = computed(
    () =>
      this.data
        .value()
        ?.plan.auditee_departments?.map((d) => d.name)
        .join(', ') ?? '',
  );

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_plan',
      entityId: this.id(),
      view: 'other',
      title: this.data.value()?.plan.title ?? null,
      requirements: this.data.value()?.plan.clause_refs ?? [],
    }));
    effect(() => {
      this.access.orgId();
      this.id();
      untracked(() => this.load());
    });
  }

  protected names(users: readonly { name: string | null }[] | undefined): string {
    return (users ?? [])
      .map((u) => u.name)
      .filter((n): n is string => !!n)
      .join(', ');
  }

  protected load(): void {
    const orgId = this.access.orgId();
    if (orgId) {
      this.data.load(this.api.report(orgId, this.id()));
    }
  }

  protected print(): void {
    globalThis.print?.();
  }

  protected download(): void {
    const orgId = this.access.orgId();
    if (!orgId || this.downloading()) {
      return;
    }
    const lang = this.language.active() === 'nb' ? 'nb' : 'en';
    this.downloading.set(true);
    this.api.reportPdf(orgId, this.id(), lang).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = reportFileName(
          this.data.value()?.plan.code ?? 'audit',
          this.language.translate('audits.report.fileSuffix'),
        );
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (error: unknown) => {
        this.downloading.set(false);
        this.notifications.error(auditErrorKey(error));
      },
    });
  }
}
