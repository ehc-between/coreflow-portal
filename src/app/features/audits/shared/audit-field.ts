import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * One control of an audit form: the label (with a required marker), the field
 * help "?" and an optional `[ask]` button on the same row as the label, never
 * as a lone "?" under the input; then the control inside `app-form-field`
 * (or as is with `plain` for pickers that draw their own box); then the error
 * ("what to fix") or a `[hint]`.
 *
 *   <app-audit-field inputId="plan-title" labelKey="audits.fields.title" [required]="true"
 *       helpPage="planForm" helpField="title">
 *     <input id="plan-title" … />
 *   </app-audit-field>
 */
@Component({
  selector: 'app-audit-field',
  imports: [NgTemplateOutlet, TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
      @if (legend()) {
        <span class="text-ui font-semibold text-fg-muted" [id]="inputId() + '-label'">
          {{ labelKey() | transloco }}
        </span>
      } @else {
        <label [attr.for]="inputId() || null" class="text-ui font-semibold text-fg-muted">
          {{ labelKey() | transloco }}
          @if (required()) {
            <span class="text-fail-ink" aria-hidden="true">*</span>
            <span class="sr-only">{{ 'audits.common.required' | transloco }}</span>
          }
        </label>
      }
      @if (helpField(); as field) {
        <app-field-help scope="audits" [page]="helpPage()" [field]="field" />
      }
      <ng-content select="[ask]" />
    </div>
    <ng-template #control><ng-content /></ng-template>
    @if (plain()) {
      <ng-container [ngTemplateOutlet]="control" />
    } @else {
      <app-form-field [inputId]="inputId()">
        <ng-container [ngTemplateOutlet]="control" />
      </app-form-field>
    }
    @if (error(); as key) {
      <p
        class="mt-1 text-meta font-semibold text-fail-ink"
        role="alert"
        [id]="inputId() + '-error'"
      >
        {{ key | transloco }}
      </p>
    } @else {
      <div class="mt-1 text-meta text-fg-subtle empty:hidden"><ng-content select="[hint]" /></div>
    }
  `,
})
export class AuditField {
  readonly inputId = input('');
  readonly labelKey = input.required<string>();
  readonly required = input(false);
  /** Guidance page of the field help (`pages.<page>.fields.<field>` in audits.json). */
  readonly helpPage = input('planForm');
  readonly helpField = input<string | null>(null);
  /** Render the control as is (pickers and checkbox groups that style their own box). */
  readonly plain = input(false);
  /** The label names a group (checkboxes), not one input: render it as text with an id. */
  readonly legend = input(false);
  /** i18n key of the error to show under the control. */
  readonly error = input<string | null>(null);
}
