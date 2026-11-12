import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { ClauseChips } from '../../../shared/guidance/clause-chips';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { AuditAccess } from '../data/audit-access';
import { auditorName, checklistResultTone, findingTypeTone } from '../data/audit-display';
import { AuditReport, CHECKLIST_RESULTS, FINDING_TYPES } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';

/**
 * `/audits/plans/:id/report`: the complete audit report on one page (scope, criteria,
 * team, checklist results, findings, summary and conclusion, approval) — printable.
 */
@Component({
  selector: 'app-audit-plan-report',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    MarkdownPipe,
    ClauseChips,
    Badge,
    Button,
    Card,
    Icon,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[900px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <a
          [routerLink]="['/audits/plans', id()]"
          class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ 'audits.report.backToAudit' | transloco }}
        </a>
        <app-button variant="secondary" size="sm" (click)="print()">{{
          'audits.report.print' | transloco
        }}</app-button>
      </div>
      <app-audit-load-state [state]="data.state()" (retry)="load()" />
      @if (data.value(); as r) {
        <article class="flex flex-col gap-4">
          <header>
            <p class="text-[12.5px] font-semibold text-fg-subtle">{{ r.plan.code }}</p>
            <h1 class="font-display text-[26px] font-bold tracking-[-0.03em] text-fg">
              {{ 'audits.report.title' | transloco: { title: r.plan.title } }}
            </h1>
            <p class="mt-1 text-[13px] text-fg-muted">
              {{ 'audits.kind.' + r.plan.kind | transloco }} ·
              {{ 'audits.planStatus.' + r.plan.status | transloco }} ·
              {{
                'audits.planDetail.range'
                  | transloco
                    : {
                        start: (r.plan.actual_start ?? r.plan.planned_start | localDay) || '–',
                        end: (r.plan.actual_end ?? r.plan.planned_end | localDay) || '–',
                      }
              }}
            </p>
          </header>

          <app-card>
            <h2 class="mb-2 font-display text-[16px] font-bold">
              {{ 'audits.report.scopeCriteria' | transloco }}
            </h2>
            <p class="text-[13.5px] whitespace-pre-line">
              <strong>{{ 'audits.fields.scope' | transloco }}:</strong> {{ r.plan.scope || '–' }}
            </p>
            <p class="mt-1 text-[13.5px] whitespace-pre-line">
              <strong>{{ 'audits.fields.criteria' | transloco }}:</strong>
              {{ r.plan.criteria || '–' }}
            </p>
            @if (r.plan.clause_refs.length) {
              <div class="mt-2"><app-clause-chips [clauses]="r.plan.clause_refs" /></div>
            }
            <h3 class="mt-3 text-[13px] font-semibold text-fg-muted">
              {{ 'audits.planDetail.team' | transloco }}
            </h3>
            <ul class="mt-1 text-[13.5px]">
              @for (a of r.plan.auditors; track a.id) {
                <li>{{ name(a) }} — {{ 'audits.auditorRole.' + a.role | transloco }}</li>
              } @empty {
                <li class="text-fg-muted">{{ 'audits.team.empty' | transloco }}</li>
              }
            </ul>
          </app-card>

          <app-card>
            <h2 class="mb-2 font-display text-[16px] font-bold">
              {{ 'audits.report.summary' | transloco }}
            </h2>
            @if (r.plan.report_summary) {
              <div
                class="cf-prose text-[13.5px]"
                [innerHTML]="r.plan.report_summary | appMarkdown"
              ></div>
            } @else {
              <p class="text-[13px] text-fg-muted">{{ 'audits.report.noSummary' | transloco }}</p>
            }
            @if (r.plan.report_conclusion) {
              <h3 class="mt-3 text-[13px] font-semibold text-fg-muted">
                {{ 'audits.fields.reportConclusion' | transloco }}
              </h3>
              <p class="text-[13.5px] whitespace-pre-line">{{ r.plan.report_conclusion }}</p>
            }
            @if (r.plan.report_approved_at) {
              <p class="mt-3 text-[12.5px] text-fg-muted">
                {{
                  'audits.report.approvedBy'
                    | transloco
                      : {
                          name: r.plan.report_approved_by?.name || '–',
                          date: (r.plan.report_approved_at | localDate: 'medium'),
                        }
                }}
              </p>
            }
          </app-card>

          <app-card>
            <h2 class="mb-2 font-display text-[16px] font-bold">
              {{ 'audits.report.results' | transloco }}
            </h2>
            <div class="mb-3 flex flex-wrap gap-1.5">
              @for (res of results; track res) {
                <app-badge [tone]="resultTone(res)">
                  {{ 'audits.checklistResult.' + res | transloco }}:
                  {{ r.checklist.by_result[res] ?? 0 }}
                </app-badge>
              }
            </div>
            <ol class="list-decimal pl-5 text-[13px]">
              @for (item of r.checklist.items; track item.id) {
                <li class="py-1">
                  {{ item.question }}
                  <span class="text-fg-muted"
                    >— {{ 'audits.checklistResult.' + item.result | transloco }}</span
                  >
                  @if (item.notes) {
                    <span class="block text-[12.5px] whitespace-pre-line text-fg-muted">{{
                      item.notes
                    }}</span>
                  }
                </li>
              }
            </ol>
          </app-card>

          <app-card>
            <h2 class="mb-2 font-display text-[16px] font-bold">
              {{ 'audits.planDetail.findings' | transloco: { count: r.findings.length } }}
            </h2>
            <div class="mb-3 flex flex-wrap gap-1.5">
              @for (t of types; track t) {
                <app-badge [tone]="typeTone(t)"
                  >{{ 'audits.findingType.' + t | transloco }}:
                  {{ r.plan.findings_by_type[t] ?? 0 }}</app-badge
                >
              }
            </div>
            <ul class="divide-y divide-border text-[13.5px]">
              @for (f of r.findings; track f.id) {
                <li class="py-2">
                  <a
                    [routerLink]="['/audits/findings', f.id]"
                    class="font-semibold text-fg hover:text-accent"
                    >{{ f.code }} {{ f.title }}</a
                  >
                  <span class="ml-1 text-fg-muted">
                    ({{ 'audits.findingType.' + f.finding_type | transloco }},
                    {{ 'audits.findingStatus.' + f.status | transloco }})
                  </span>
                  @if (f.description) {
                    <p class="text-[12.5px] whitespace-pre-line text-fg-muted">
                      {{ f.description }}
                    </p>
                  }
                </li>
              } @empty {
                <li class="py-2 text-fg-muted">{{ 'audits.planDetail.noFindings' | transloco }}</li>
              }
            </ul>
          </app-card>
        </article>
      }
    </div>
  `,
})
export class PlanReportPage {
  private readonly api = inject(AuditsApi);
  private readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly data = loadable<AuditReport>();
  protected readonly results = CHECKLIST_RESULTS;
  protected readonly types = FINDING_TYPES;
  protected readonly resultTone = checklistResultTone;
  protected readonly typeTone = findingTypeTone;
  protected readonly name = auditorName;

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_plan',
      entityId: this.id(),
      view: 'other',
      title: this.data.value()?.plan.title ?? null,
    }));
    effect(() => {
      this.access.orgId();
      this.id();
      untracked(() => this.load());
    });
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
}
