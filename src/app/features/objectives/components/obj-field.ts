import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { OBJECTIVES_SCOPE } from '../objectives-display';

/**
 * A form control of this module on `app-form-field`, with the label row the UX
 * guide asks for: the label, a required marker, and the field help (`?` or, for
 * beginners, the help text) inline after the label instead of on its own line
 * under the control. An error (already translated key) shows under the control.
 *
 *   <app-obj-field [label]="'objectives.fields.title' | transloco" [inputId]="fid('title')"
 *                  page="form" help="title" [required]="true" [errorKey]="titleError()">
 *     <input [id]="fid('title')" … />
 *   </app-obj-field>
 */
@Component({
  selector: 'app-obj-field',
  imports: [TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <app-form-field>
      <div
        class="flex flex-wrap items-center gap-x-1.5 gap-y-1 [&>app-field-help.block]:basis-full"
      >
        <label [attr.for]="inputId() || null" class="text-ui font-semibold text-fg-muted">
          {{ label() }}
          @if (required()) {
            <span class="text-fail-ink" aria-hidden="true">*</span>
            <span class="sr-only">{{ 'objectives.form.required' | transloco }}</span>
          }
        </label>
        @if (help()) {
          <app-field-help
            [scope]="scope"
            [page]="page()"
            [field]="help()!"
            [requirements]="requirements()"
          />
        }
      </div>
      <ng-content />
      @if (errorKey(); as key) {
        <p class="text-meta text-fail-ink" role="alert" [attr.data-testid]="'error-' + help()">
          {{ key | transloco }}
        </p>
      }
    </app-form-field>
  `,
})
export class ObjField {
  readonly label = input.required<string>();
  readonly inputId = input('');
  /** Guidance page (`pages.<page>.fields.<help>`). */
  readonly page = input('form');
  /** Guidance field key; without it no help is shown. */
  readonly help = input<string | null>(null);
  readonly required = input(false);
  /** Canonical refs the field documents (else read from the guidance file). */
  readonly requirements = input<readonly string[] | null>(null);
  readonly errorKey = input<string | null>(null);

  protected readonly scope = OBJECTIVES_SCOPE;
}
