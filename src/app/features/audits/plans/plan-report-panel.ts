import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Button } from '../../../shared/ui/button/button';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { Icon } from '../../../shared/ui/icon/icon';
import { AuditAccess } from '../data/audit-access';
import { textOrNull } from '../data/audit-display';
import { PlanDetail, REPORT_OUTCOMES, ReportOutcome } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditField } from '../shared/audit-field';
import { mutator } from '../shared/mutator';

/** Statuses in which the report text may be edited (else 409 `report_locked`). */
export const REPORT_EDITABLE: readonly string[] = ['in_progress', 'reporting'];

/**
 * The audit report of a plan: summary (drafted with the assistant on request), the
 * overall conclusion (conforming / with findings / not conforming) with a free-text
 * conclusion and the limitations of the audit, who submitted and approved it, and a
 * link to the full, printable report.
 */
@Component({
  selector: 'app-audit-plan-report-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    LocalDatePipe,
    MarkdownPipe,
    Button,
    FieldItem,
    FieldList,
    Icon,
    AuditField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (editable()) {
      <div class="flex flex-col gap-4">
        <app-audit-field
          inputId="report-summary"
          labelKey="audits.fields.reportSummary"
          helpPage="planDetail"
          helpField="reportSummary"
        >
          <textarea
            id="report-summary"
            rows="6"
            [value]="summary()"
            (input)="summary.set($any($event.target).value)"
          ></textarea>
          <app-ai-assist-button
            ask
            assist="audits.summarise_report"
            labelKey="audits.ai.summariseReport"
            variant="ghost"
            entityType="audit_plan"
            [entityId]="plan().id"
            [input]="{ plan_id: plan().id }"
            (text)="summary.set($event)"
          />
        </app-audit-field>
        <app-audit-field
          inputId="report-outcome"
          labelKey="audits.fields.reportOutcome"
          helpPage="planDetail"
          helpField="reportOutcome"
        >
          <select id="report-outcome" (change)="outcome.set($any($event.target).value || null)">
            <option value="" [selected]="!outcome()">
              {{ 'audits.common.choose' | transloco }}
            </option>
            @for (o of outcomes; track o) {
              <option [value]="o" [selected]="outcome() === o">
                {{ 'audits.reportOutcome.' + o | transloco }}
              </option>
            }
          </select>
        </app-audit-field>
        <app-audit-field inputId="report-conclusion" labelKey="audits.fields.reportConclusion">
          <textarea
            id="report-conclusion"
            rows="3"
            [value]="conclusion()"
            (input)="conclusion.set($any($event.target).value)"
          ></textarea>
        </app-audit-field>
        <app-audit-field
          inputId="report-limitations"
          labelKey="audits.fields.reportLimitations"
          helpPage="planDetail"
          helpField="reportLimitations"
        >
          <textarea
            id="report-limitations"
            rows="2"
            [value]="limitations()"
            (input)="limitations.set($any($event.target).value)"
          ></textarea>
        </app-audit-field>
        <div class="flex justify-end">
          <app-button size="sm" [loading]="saving.busy()" [disabled]="!dirty()" (click)="save()">
            {{ 'audits.report.save' | transloco }}
          </app-button>
        </div>
      </div>
    } @else {
      @if (plan().report_summary) {
        <div
          class="cf-prose text-body text-fg"
          [innerHTML]="plan().report_summary | appMarkdown"
        ></div>
      } @else {
        <p class="text-body text-fg-muted">{{ 'audits.report.noSummary' | transloco }}</p>
      }
      <app-field-list class="mt-4">
        <app-field-item
          labelKey="audits.fields.reportOutcome"
          [value]="
            plan().report_outcome
              ? ('audits.reportOutcome.' + plan().report_outcome | transloco)
              : null
          "
        />
        <app-field-item
          labelKey="audits.fields.reportConclusion"
          [value]="plan().report_conclusion"
          [multiline]="true"
        />
        @if (plan().report_limitations) {
          <app-field-item
            labelKey="audits.fields.reportLimitations"
            [value]="plan().report_limitations"
            [multiline]="true"
            [wide]="true"
          />
        }
      </app-field-list>
    }

    @if (plan().report_submitted_at || plan().report_approved_at) {
      <dl class="mt-4 grid grid-cols-1 gap-x-4 gap-y-1 text-meta sm:grid-cols-2">
        @if (plan().report_submitted_at) {
          <div>
            <dt class="inline text-fg-muted">{{ 'audits.report.submitted' | transloco }}:</dt>
            <dd class="inline text-fg">
              {{
                'audits.report.byOn'
                  | transloco
                    : {
                        name:
                          plan().report_submitted_by?.name || ('audits.common.someone' | transloco),
                        date: (plan().report_submitted_at | localDate),
                      }
              }}
            </dd>
          </div>
        }
        @if (plan().report_approved_at) {
          <div>
            <dt class="inline text-fg-muted">{{ 'audits.report.approved' | transloco }}:</dt>
            <dd class="inline text-fg">
              {{
                'audits.report.byOn'
                  | transloco
                    : {
                        name:
                          plan().report_approved_by?.name || ('audits.common.someone' | transloco),
                        date: (plan().report_approved_at | localDate),
                      }
              }}
            </dd>
          </div>
        }
      </dl>
    }
    <a
      [routerLink]="['/audits/plans', plan().id, 'report']"
      class="mt-4 inline-flex min-h-6 items-center gap-1 text-ui font-semibold text-accent hover:underline"
    >
      <app-icon name="reports" [size]="14" />
      {{ 'audits.report.open' | transloco }}
    </a>
  `,
})
export class PlanReportPanel {
  private readonly api = inject(AuditsApi);
  private readonly access = inject(AuditAccess);

  readonly plan = input.required<PlanDetail>();
  readonly saved = output<PlanDetail>();

  protected readonly outcomes = REPORT_OUTCOMES;
  protected readonly saving = mutator();
  protected readonly summary = linkedSignal(() => this.plan().report_summary ?? '');
  protected readonly conclusion = linkedSignal(() => this.plan().report_conclusion ?? '');
  protected readonly limitations = linkedSignal(() => this.plan().report_limitations ?? '');
  protected readonly outcome = linkedSignal<ReportOutcome | null>(
    () => this.plan().report_outcome ?? null,
  );

  protected readonly editable = computed(
    () => this.access.canWrite() && REPORT_EDITABLE.includes(this.plan().status),
  );
  protected readonly dirty = computed(
    () =>
      this.summary() !== (this.plan().report_summary ?? '') ||
      this.conclusion() !== (this.plan().report_conclusion ?? '') ||
      this.limitations() !== (this.plan().report_limitations ?? '') ||
      this.outcome() !== (this.plan().report_outcome ?? null),
  );

  protected save(): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(
      this.api.updatePlan(orgId, this.plan().id, {
        report_summary: textOrNull(this.summary()),
        report_conclusion: textOrNull(this.conclusion()),
        report_limitations: textOrNull(this.limitations()),
        report_outcome: this.outcome(),
      }),
      { success: 'audits.notices.reportSaved', next: (plan) => this.saved.emit(plan) },
    );
  }
}
