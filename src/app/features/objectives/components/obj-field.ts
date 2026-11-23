import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField, type FormFieldSpan } from '../../../shared/ui/form-field/form-field';
import { OBJECTIVES_SCOPE } from '../objectives-display';

/**
 * A form control of this module on the shared form anatomy (docs/ux-guide.md §2.4):
 * the label row (label, required marker, `?` field help), the control, then an
 * optional hint and the error (an i18n key) under it. `span="full"` takes both
 * columns of an `app-form-section` grid. `[ask]` content (an `app-ask-about`) sits in
 * the label row; `[hint]` content is a rich hint under the control.
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
  host: { class: 'block min-w-0', '[class.sm:col-span-2]': "span() === 'full'" },
  template: `
    <app-form-field
      [label]="label()"
      [inputId]="inputId()"
      [required]="required()"
      [hint]="hint()"
      [error]="errorKey() ?? '' | transloco"
    >
      @if (help()) {
        <app-field-help
          label-suffix
          [scope]="scope"
          [page]="page()"
          [field]="help()!"
          [label]="label()"
          [requirements]="requirements()"
        />
      }
      <ng-container ngProjectAs="[label-suffix]"><ng-content select="[ask]" /></ng-container>
      <ng-content />
      <ng-container ngProjectAs="[hint]"><ng-content select="[hint]" /></ng-container>
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
  /** One muted line under the control (already translated). */
  readonly hint = input<string | null>(null);
  /** `full` spans both columns of an `app-form-section` grid. */
  readonly span = input<FormFieldSpan>('half');

  protected readonly scope = OBJECTIVES_SCOPE;
}
