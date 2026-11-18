import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * One form control of the risk module: the label with a required marker, the
 * field help ("?" or beginner text) and an optional `[ask]` button inline after
 * the label (never on its own line under the input), then the control in an
 * `app-form-field`, then the error ("what to fix") or a `[hint]`.
 *
 *   <app-risk-field inputId="risk-title" labelKey="risk.fields.title" [required]="true"
 *       helpPage="form" helpField="title" [error]="titleError()">
 *     <input id="risk-title" … />
 *   </app-risk-field>
 */
@Component({
  selector: 'app-risk-field',
  imports: [NgTemplateOutlet, TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
      <label [attr.for]="inputId() || null" class="text-ui font-semibold text-fg-muted">
        {{ labelKey() | transloco }}
        @if (required()) {
          <span class="text-fail-ink" aria-hidden="true">*</span>
          <span class="sr-only">{{ 'risk.form.required' | transloco }}</span>
        }
      </label>
      @if (helpField(); as field) {
        <app-field-help
          scope="risk"
          [page]="helpPage()"
          [field]="field"
          [label]="labelKey() | transloco"
        />
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
export class RiskField {
  readonly inputId = input('');
  readonly labelKey = input.required<string>();
  readonly required = input(false);
  /** Guidance page of the field help (`pages.<page>.fields.<field>` in risk.json). */
  readonly helpPage = input('form');
  readonly helpField = input<string | null>(null);
  /** Render the control as is (pickers that style their own box). */
  readonly plain = input(false);
  /** i18n key of the error to show under the control. */
  readonly error = input<string | null>(null);
}
