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
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AuditAccess } from '../data/audit-access';
import { textOrNull } from '../data/audit-display';
import { PlanDetail } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { mutator } from '../shared/mutator';

/** Statuses in which the report text may be edited (else 409 `report_locked`). */
export const REPORT_EDITABLE: readonly string[] = ['in_progress', 'reporting'];

/**
 * The audit report of a plan: summary and conclusion (drafted with the assistant on
 * request), who submitted and approved it, and a link to the full report view.
 */
@Component({
  selector: 'app-audit-plan-report-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    FieldHelp,
    LocalDatePipe,
    MarkdownPipe,
    Button,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (editable()) {
      <div class="flex flex-col gap-3">
        <app-form-field
          [label]="'audits.fields.reportSummary' | transloco"
          inputId="report-summary"
        >
          <textarea
            id="report-summary"
            rows="6"
            [value]="summary()"
            (input)="summary.set($any($event.target).value)"
          ></textarea>
          <app-field-help scope="audits" page="planDetail" field="reportSummary" />
        </app-form-field>
        <app-form-field
          [label]="'audits.fields.reportConclusion' | transloco"
          inputId="report-conclusion"
        >
          <textarea
            id="report-conclusion"
            rows="3"
            [value]="conclusion()"
            (input)="conclusion.set($any($event.target).value)"
          ></textarea>
        </app-form-field>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <app-ai-assist-button
            assist="audits.summarise_report"
            labelKey="audits.ai.summariseReport"
            entityType="audit_plan"
            [entityId]="plan().id"
            [input]="{ plan_id: plan().id }"
            (text)="summary.set($event)"
          />
          <app-button size="sm" [loading]="saving.busy()" [disabled]="!dirty()" (click)="save()">
            {{ 'audits.report.save' | transloco }}
          </app-button>
        </div>
      </div>
    } @else {
      @if (plan().report_summary) {
        <div
          class="cf-prose text-[13.5px] text-fg"
          [innerHTML]="plan().report_summary | appMarkdown"
        ></div>
      } @else {
        <p class="text-[13px] text-fg-muted">{{ 'audits.report.noSummary' | transloco }}</p>
      }
      @if (plan().report_conclusion) {
        <h4 class="mt-3 text-[13px] font-semibold text-fg-muted">
          {{ 'audits.fields.reportConclusion' | transloco }}
        </h4>
        <p class="mt-1 text-[13.5px] whitespace-pre-line text-fg">{{ plan().report_conclusion }}</p>
      }
    }

    <dl class="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-2">
      @if (plan().report_submitted_at) {
        <div>
          <dt class="inline text-fg-muted">{{ 'audits.report.submitted' | transloco }}:</dt>
          <dd class="inline text-fg">
            {{ plan().report_submitted_by?.name || '–' }},
            {{ plan().report_submitted_at | localDate: 'medium' }}
          </dd>
        </div>
      }
      @if (plan().report_approved_at) {
        <div>
          <dt class="inline text-fg-muted">{{ 'audits.report.approved' | transloco }}:</dt>
          <dd class="inline text-fg">
            {{ plan().report_approved_by?.name || '–' }},
            {{ plan().report_approved_at | localDate: 'medium' }}
          </dd>
        </div>
      }
    </dl>
    <a
      [routerLink]="['/audits/plans', plan().id, 'report']"
      class="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline"
    >
      {{ 'audits.report.open' | transloco }}
    </a>
  `,
})
export class PlanReportPanel {
  private readonly api = inject(AuditsApi);
  private readonly access = inject(AuditAccess);

  readonly plan = input.required<PlanDetail>();
  readonly saved = output<PlanDetail>();

  protected readonly saving = mutator();
  protected readonly summary = linkedSignal(() => this.plan().report_summary ?? '');
  protected readonly conclusion = linkedSignal(() => this.plan().report_conclusion ?? '');

  protected readonly editable = computed(
    () => this.access.canWrite() && REPORT_EDITABLE.includes(this.plan().status),
  );
  protected readonly dirty = computed(
    () =>
      this.summary() !== (this.plan().report_summary ?? '') ||
      this.conclusion() !== (this.plan().report_conclusion ?? ''),
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
      }),
      { success: 'audits.notices.reportSaved', next: (plan) => this.saved.emit(plan) },
    );
  }
}
