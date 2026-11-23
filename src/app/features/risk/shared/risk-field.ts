import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField, type FormFieldSpan } from '../../../shared/ui/form-field/form-field';

/**
 * One form control of the risk module on the shared form anatomy (docs/ux-guide.md
 * §2.4): the label row (label, required marker, `?` field help and an optional `[ask]`
 * button), the control, then a `[hint]` and the error ("what to fix") under it.
 * `span="full"` takes both columns of an `app-form-section` grid.
 *
 *   <app-risk-field inputId="risk-title" labelKey="risk.fields.title" [required]="true"
 *       helpPage="form" helpField="title" [error]="titleError()">
 *     <input id="risk-title" … />
 *   </app-risk-field>
 *
 * `plain` keeps the control unstyled (pickers that draw their own box) but uses the
 * same 24 px label row, so it still lines up with its neighbours.
 */
@Component({
  selector: 'app-risk-field',
  imports: [NgTemplateOutlet, TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0', '[class.sm:col-span-2]': "span() === 'full'" },
  template: `
    <ng-template #help>
      @if (helpField(); as field) {
        <app-field-help
          scope="risk"
          [page]="helpPage()"
          [field]="field"
          [label]="labelKey() | transloco"
        />
      }
      <ng-content select="[ask]" />
    </ng-template>
    <ng-template #control><ng-content /></ng-template>
    <ng-template #hint><ng-content select="[hint]" /></ng-template>
    @if (plain()) {
      <div class="flex flex-col gap-1.5">
        <div class="flex min-h-6 flex-wrap items-center gap-x-1.5 gap-y-1">
          <label
            [attr.for]="inputId() || null"
            class="text-ui leading-6 font-semibold text-fg-muted"
          >
            {{ labelKey() | transloco }}
            @if (required()) {
              <span class="text-fail-ink" aria-hidden="true">*</span>
              <span class="sr-only">{{ 'risk.form.required' | transloco }}</span>
            }
          </label>
          <ng-container [ngTemplateOutlet]="help" />
        </div>
        <ng-container [ngTemplateOutlet]="control" />
        <div class="text-meta leading-snug text-fg-subtle empty:hidden">
          <ng-container [ngTemplateOutlet]="hint" />
        </div>
        @if (error(); as key) {
          <p
            class="text-meta leading-snug font-medium text-fail-ink"
            role="alert"
            [id]="inputId() + '-error'"
          >
            {{ key | transloco }}
          </p>
        }
      </div>
    } @else {
      <app-form-field
        [label]="labelKey() | transloco"
        [inputId]="inputId()"
        [required]="required()"
        [error]="error() ?? '' | transloco"
      >
        <ng-container ngProjectAs="[label-suffix]">
          <ng-container [ngTemplateOutlet]="help" />
        </ng-container>
        <ng-container [ngTemplateOutlet]="control" />
        <div ngProjectAs="[hint]" class="text-meta leading-snug text-fg-subtle empty:hidden">
          <ng-container [ngTemplateOutlet]="hint" />
        </div>
      </app-form-field>
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
  /** `full` spans both columns of an `app-form-section` grid. */
  readonly span = input<FormFieldSpan>('half');
}
