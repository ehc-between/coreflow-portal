import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField, FormFieldSpan } from '../../../shared/ui/form-field/form-field';

/**
 * One People form field on the shared form anatomy (docs/ux-guide.md §2.4): renders
 * `app-form-field` with the translated label (and `*`), the `?` help as a toggletip in
 * the label row, the control, one muted hint line and the error under it.
 * `[label-extra]` content (e.g. "Spør") also sits in the label row. Inside an
 * `app-form-section` grid, `span="full"` (or `class="sm:col-span-2"`) takes both columns.
 */
@Component({
  selector: 'app-people-field',
  imports: [TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0',
    '[class.sm:col-span-2]': "span() === 'full'",
  },
  template: `
    <app-form-field
      [label]="labelKey() | transloco"
      [inputId]="inputId()"
      [required]="required()"
      [hint]="error() || !hintKey() ? '' : (hintKey()! | transloco: hintParams())"
      [error]="error() ? (error()! | transloco) : ''"
    >
      @if (help()) {
        <app-field-help
          label-suffix
          [scope]="'people'"
          [page]="page()"
          [field]="help()!"
          [label]="labelKey() | transloco"
        />
      }
      <span label-suffix class="contents"><ng-content select="[label-extra]" /></span>
      <ng-content />
    </app-form-field>
  `,
})
export class PeopleField {
  readonly labelKey = input.required<string>();
  readonly inputId = input.required<string>();
  /** Guidance page of the help (`pages.<page>.fields.<help>`). */
  readonly page = input('form');
  readonly help = input<string | null>(null);
  readonly hintKey = input<string | null>(null);
  readonly hintParams = input<Record<string, unknown> | undefined>(undefined);
  readonly required = input(false);
  /** i18n key of the error to show instead of the hint. */
  readonly error = input<string | null | undefined>(null);
  /** `full` spans both columns of an `app-form-section` grid. */
  readonly span = input<FormFieldSpan>('half');
}
