import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AI_GOVERNANCE_SCOPE } from '../data/ai-governance-display';

/**
 * One form control of AI governance: the label (with a required marker), the
 * field help ("?" or beginner text) and an optional `[ask]` button inline after
 * the label (never on its own line under the control), then the control in an
 * `app-form-field`, then the error ("what to fix") or a `[hint]`.
 *
 *   <app-ai-field inputId="ais-name" labelKey="aiGovernance.fields.name" [required]="true"
 *       helpPage="systemForm" helpField="name" [error]="nameError()">
 *     <input id="ais-name" … />
 *   </app-ai-field>
 */
@Component({
  selector: 'app-ai-field',
  imports: [NgTemplateOutlet, TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
      @if (legend()) {
        <span [id]="inputId() + '-label'" class="text-ui font-semibold text-fg-muted">
          {{ labelKey() | transloco }}
        </span>
      } @else {
        <label [attr.for]="inputId() || null" class="text-ui font-semibold text-fg-muted">
          {{ labelKey() | transloco }}
          @if (required()) {
            <span class="text-fail-ink" aria-hidden="true">*</span>
            <span class="sr-only">{{ 'aiGovernance.common.required' | transloco }}</span>
          }
        </label>
      }
      @if (helpField(); as field) {
        <app-field-help
          [scope]="scope"
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

  protected readonly scope = AI_GOVERNANCE_SCOPE;
}
