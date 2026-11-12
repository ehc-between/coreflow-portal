import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * A labelled form control with its learning-mode help: `app-form-field` plus
 * `app-field-help` (guidance file `context`, `pages.<page>.fields.<help>`).
 *
 *   <app-context-form-row labelKey="context.fields.title" inputId="f-title" page="policies-form" help="title">
 *     <input id="f-title" … />
 *   </app-context-form-row>
 */
@Component({
  selector: 'app-context-form-row',
  imports: [TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-form-field [label]="labelKey() | transloco" [inputId]="inputId()">
      <ng-content />
    </app-form-field>
    @if (help()) {
      <div class="mt-1">
        <app-field-help scope="context" [page]="page()" [field]="help()!" />
      </div>
    }
  `,
})
export class FormRow {
  readonly labelKey = input.required<string>();
  readonly inputId = input.required<string>();
  /** Guidance page key (e.g. `policies-form`). */
  readonly page = input('');
  /** Field key in the guidance page; no help when unset. */
  readonly help = input<string | null>(null);
}
