import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField, type FormFieldSpan } from '../../../shared/ui/form-field/form-field';
import { AI_GOVERNANCE_SCOPE } from '../data/ai-governance-display';

/**
 * One form control of AI governance on the shared form anatomy (docs/ux-guide.md
 * §2.4): the label row (label, required marker, `?` field help and an optional `[ask]`
 * button), the control, then a `[hint]` and the error ("what to fix") under it.
 * `span="full"` takes both columns of an `app-form-section` grid.
 *
 *   <app-ai-field inputId="ais-name" labelKey="aiGovernance.fields.name" [required]="true"
 *       helpPage="systemForm" helpField="name" [error]="nameError()">
 *     <input id="ais-name" … />
 *   </app-ai-field>
 *
 * `plain` keeps the control unstyled (pickers and option groups that draw their own
 * box) with the same 24 px label row; `legend` renders the label as text with an id
 * (`<inputId>-label`) for radio / checkbox groups.
 */
@Component({
  selector: 'app-ai-field',
  imports: [NgTemplateOutlet, TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0', '[class.sm:col-span-2]': "span() === 'full'" },
  template: `
    <ng-template #help>
      @if (helpField(); as field) {
        <app-field-help
          [scope]="scope"
          [page]="helpPage()"
          [field]="field"
          [label]="labelKey() | transloco"
        />
      }
      <ng-content select="[ask]" />
    </ng-template>
    <ng-template #control><ng-content /></ng-template>
    <ng-template #hint><ng-content select="[hint]" /></ng-template>
    @if (plain() || legend()) {
      <div class="flex flex-col gap-1.5">
        <div class="flex min-h-6 flex-wrap items-center gap-x-1.5 gap-y-1">
          @if (legend()) {
            <span [id]="inputId() + '-label'" class="text-ui leading-6 font-semibold text-fg-muted">
              {{ labelKey() | transloco }}
              @if (required()) {
                <span class="text-fail-ink" aria-hidden="true">*</span>
              }
            </span>
          } @else {
            <label
              [attr.for]="inputId() || null"
              class="text-ui leading-6 font-semibold text-fg-muted"
            >
              {{ labelKey() | transloco }}
              @if (required()) {
                <span class="text-fail-ink" aria-hidden="true">*</span>
                <span class="sr-only">{{ 'aiGovernance.common.required' | transloco }}</span>
              }
            </label>
          }
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
export class AiField {
  readonly inputId = input('');
  readonly labelKey = input.required<string>();
  readonly required = input(false);
  /** Guidance page of the field help (`pages.<page>.fields.<field>`). */
  readonly helpPage = input('systemForm');
  readonly helpField = input<string | null>(null);
  /** Render the control as is (pickers and option groups that style their own box). */
  readonly plain = input(false);
  /** The control is a group (radios / checkboxes): render the label as text with an id. */
  readonly legend = input(false);
  /** i18n key of the error to show under the control. */
  readonly error = input<string | null>(null);
  /** `full` spans both columns of an `app-form-section` grid. */
  readonly span = input<FormFieldSpan>('half');

  protected readonly scope = AI_GOVERNANCE_SCOPE;
}
